const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  normalizeBaseText,
  safeFileName,
  decodeHtml,
  getText,
  parseVendedorCorretora,
  parseBrazilNumber,
  parseBrazilCurrency,
  formatNumberBR,
  formatBRL
} = require('./core/text.cjs');
const {
  analyzeDuplicateRecords
} = require('./core/duplicate-analysis.cjs');
const { assertLocalPath, assertInputFiles } = require('./core/ipc-validation.cjs');
const {
  fingerprintFiles,
  resolveVersionedFile,
  reserveVersionedFolder,
  writeFileAtomically
} = require('./core/process-safety.cjs');
const {
  activeReports,
  trashedReports,
  trashReport,
  restoreReport,
  purgeExpiredReports,
  readHistoryFile,
  writeHistoryFile
} = require('./core/history-store.cjs');
const { ProcessingJobs } = require('./core/processing-jobs.cjs');
const { createAppSettings } = require('./config/app-settings.cjs');
const { createCorretorasRepository } = require('./config/corretoras.cjs');
const { createWindowFactory } = require('./app/create-window.cjs');
const { registerSystemIpc } = require('./ipc/register-system-ipc.cjs');
const { registerHistoryIpc } = require('./ipc/register-history-ipc.cjs');
const { registerDuplicatesIpc } = require('./ipc/register-duplicates-ipc.cjs');
const { registerReportIpc } = require('./ipc/register-report-ipc.cjs');
const {
  readInput,
  readDuplicateRecords,
  getLastUsedRow,
  getLastUsedCol,
  getRowsFromXlsxSheet
} = require('./reports/input-reader.cjs');
const {
  copyBlock,
  consolidateCommissionTotalsInWorksheet
} = require('./reports/workbook-format.cjs');

const APP_ROOT = path.resolve(__dirname, '..', '..');

const processingJobs = new ProcessingJobs();
const appSettings = createAppSettings({ app, validatePath: assertLocalPath });
const corretorasRepository = createCorretorasRepository({
  app,
  bundledConfigPath: path.join(APP_ROOT, 'config', 'corretoras.default.json')
});

const createWindow = createWindowFactory({
  BrowserWindow,
  appRoot: APP_ROOT,
  isDevelopment: process.env.NODE_ENV === 'development'
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });



function getHistoryPath() {
  return path.join(app.getPath('userData'), 'relatorios-salvos.json');
}

function readSavedReports() {
  const historyPath = getHistoryPath();
  const items = readHistoryFile(historyPath);
  const retained = purgeExpiredReports(items);
  if (retained.length !== items.length) writeHistoryFile(historyPath, retained);
  return retained;
}

function writeSavedReports(items) {
  writeHistoryFile(getHistoryPath(), items);
}

function monthReportInfo(reportMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(reportMonth || ''))) {
    throw new Error('Informe um mês de referência válido.');
  }
  const [year, month] = reportMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return {
    key: reportMonth,
    label: `${monthTitle}/${year}`,
    folderName: `Relatorio_${monthTitle}_${year}`
  };
}

registerSystemIpc({
  ipcMain, dialog, shell, settings: appSettings, processingJobs, assertLocalPath
});
registerHistoryIpc({
  ipcMain, readSavedReports, writeSavedReports,
  activeReports, trashedReports, trashReport, restoreReport
});


let CORRETORAS_CONFIG = corretorasRepository.getAll();

function normalizarCorretoraParaGrupo(nome) {
  const original = String(nome || '').trim();
  const base = normalizeBaseText(original);
  if (!base || base.includes('NAO IDENTIFICADA')) return 'Corretora não identificada';

  for (const [nomePrincipal, aliases] of Object.entries(CORRETORAS_CONFIG)) {
    const principalNorm = normalizeBaseText(nomePrincipal);
    const aliasList = Array.isArray(aliases) ? aliases : [];

    if (base === principalNorm || base.includes(principalNorm) || principalNorm.includes(base)) {
      return nomePrincipal;
    }

    for (const alias of aliasList) {
      const aliasNorm = normalizeBaseText(alias);
      if (!aliasNorm) continue;
      if (base === aliasNorm || base.includes(aliasNorm) || aliasNorm.includes(base)) {
        return nomePrincipal;
      }
    }
  }

  return original;
}

registerDuplicatesIpc({
  ipcMain, assertInputFiles, fingerprintFiles, readDuplicateRecords,
  analyzeDuplicateRecords, readSavedReports, path
});

function getItemCommissionTotal(item) {
  const rows = item.type === 'html-xls' ? item.rows : getRowsFromXlsxSheet(item.sheet);
  const result = findTotalInRows(rows);
  return result.found ? result.total : 0;
}

function getCorretoraFromFileName(filePath) {
  // Na aba PDF de resumo, as planilhas já vêm prontas e nomeadas corretamente.
  // Então o nome da corretora deve ser o nome do arquivo, não o texto do topo.
  return safeFileName(path.basename(filePath, path.extname(filePath)))
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCorretoraFromTitleForSummary(title, filePath = '') {
  const parsed = parseVendedorCorretora(title, filePath);
  const group = normalizarCorretoraParaGrupo(parsed.corretora || parsed.titulo || path.basename(filePath, path.extname(filePath)));
  return group && group !== 'Corretora não identificada'
    ? group
    : safeFileName(path.basename(filePath, path.extname(filePath))).replace(/-/g, ' ');
}

function findTotalInRows(rows) {
  let total = 0;
  let found = false;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const text = decodeHtml(getText(row[c]));
      const norm = normalizeBaseText(text);

      if (norm.includes('TOTAL DE COMISSOES A PAGAR')) {
        let value = parseBrazilCurrency(text);

        // Se o valor estiver na célula ao lado, tenta nas próximas células da linha.
        if (value === null) {
          for (let k = c + 1; k < Math.min(row.length, c + 5); k++) {
            value = parseBrazilCurrency(row[k]);
            if (value !== null) break;
          }
        }

        if (value !== null) {
          total += value;
          found = true;
        }
      }
    }
  }

  return { total, found };
}

async function readRowsForSummary(filePath) {
  const input = await readInput(filePath);

  if (input.type === 'html-xls') {
    return { rows: input.rows, info: input.info };
  }

  const rows = [];
  const sheet = input.sheet;
  const lastRow = getLastUsedRow(sheet);
  const lastCol = getLastUsedCol(sheet);

  for (let r = 1; r <= lastRow; r++) {
    const row = [];
    for (let c = 1; c <= lastCol; c++) {
      row.push(sheet.getCell(r, c).value);
    }
    rows.push(row);
  }

  return { rows, info: input.info };
}

async function buildSummaryItems(files) {
  const byCorretora = new Map();
  const errors = [];

  for (const file of files) {
    try {
      const { rows, info } = await readRowsForSummary(file);
      const corretora = getCorretoraFromFileName(file);
      const { total, found } = findTotalInRows(rows);

      if (!byCorretora.has(corretora)) {
        byCorretora.set(corretora, { corretora, total: 0, arquivos: 0, arquivosSemTotal: [] });
      }

      const item = byCorretora.get(corretora);
      item.arquivos += 1;
      item.total += total;
      if (!found) item.arquivosSemTotal.push(path.basename(file));
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err.message}`);
    }
  }

  const items = Array.from(byCorretora.values()).sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));
  return { items, errors };
}

async function createSummaryPdf(items, errors, outputFolder) {
  const outputRoot = path.join(outputFolder, 'Resumos_Gerados');
  fs.mkdirSync(outputRoot, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const { outputPath: outPath } = resolveVersionedFile(path.join(outputRoot, `Resumo_Comissoes_${stamp}.pdf`));

  await writeFileAtomically(outPath, temporaryPath => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = fs.createWriteStream(temporaryPath);
    doc.pipe(stream);

    const logoPath = path.join(APP_ROOT, 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 48, 32, { width: 150 }); } catch (_) {}
    }

    doc.fillColor('#002b8f').fontSize(18).font('Helvetica-Bold').text('Resumo de Comissões', 220, 42, { align: 'right' });
    doc.fillColor('#334155').fontSize(9).font('Helvetica').text(`Gerado em ${now.toLocaleString('pt-BR')}`, 220, 66, { align: 'right' });
    doc.moveDown(3);

    const totalGeral = items.reduce((acc, item) => acc + item.total, 0);
    const startY = 120;
    let y = startY;

    doc.roundedRect(48, y - 12, 500, 44, 8).fill('#eef8ff');
    doc.fillColor('#002b8f').fontSize(11).font('Helvetica-Bold').text(`Corretoras: ${items.length}`, 64, y);
    doc.text(`Total geral: ${formatBRL(totalGeral)}`, 300, y);
    y += 52;

    const drawHeader = () => {
      doc.rect(48, y, 500, 24).fill('#002b8f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('Corretora', 58, y + 7, { width: 310 });
      doc.text('Arquivos', 370, y + 7, { width: 60, align: 'center' });
      doc.text('Valor total', 435, y + 7, { width: 100, align: 'right' });
      y += 24;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(10);

    items.forEach((item, idx) => {
      if (y > 745) {
        doc.addPage();
        y = 60;
        drawHeader();
      }
      const fill = idx % 2 === 0 ? '#ffffff' : '#f8fcff';
      doc.rect(48, y, 500, 26).fill(fill).strokeColor('#d8e9f7').stroke();
      doc.fillColor('#12304a').font('Helvetica');
      doc.text(item.corretora, 58, y + 8, { width: 300, ellipsis: true });
      doc.text(String(item.arquivos), 370, y + 8, { width: 60, align: 'center' });
      doc.font('Helvetica-Bold').text(formatBRL(item.total), 435, y + 8, { width: 100, align: 'right' });
      y += 26;
    });

    y += 18;
    if (y > 730) { doc.addPage(); y = 60; }
    doc.moveTo(48, y).lineTo(548, y).strokeColor('#009fe3').lineWidth(1).stroke();
    y += 14;
    doc.fillColor('#002b8f').fontSize(12).font('Helvetica-Bold').text(`TOTAL GERAL: ${formatBRL(totalGeral)}`, 48, y, { align: 'right', width: 500 });

    const semTotal = items.flatMap(i => i.arquivosSemTotal.map(a => `${i.corretora}: ${a}`));
    if (semTotal.length || errors.length) {
      doc.addPage();
      y = 60;
      doc.fillColor('#002b8f').fontSize(14).font('Helvetica-Bold').text('Observações', 48, y);
      y += 24;
      doc.fillColor('#12304a').fontSize(10).font('Helvetica');
      if (semTotal.length) {
        doc.font('Helvetica-Bold').text('Arquivos sem total identificado:', 48, y); y += 16;
        doc.font('Helvetica');
        semTotal.forEach(x => { doc.text(`- ${x}`, 58, y, { width: 470 }); y += 14; });
        y += 10;
      }
      if (errors.length) {
        doc.font('Helvetica-Bold').text('Arquivos com erro de leitura:', 48, y); y += 16;
        doc.font('Helvetica');
        errors.forEach(x => { doc.text(`- ${x}`, 58, y, { width: 470 }); y += 14; });
      }
    }

    doc.fontSize(8).fillColor('#64748b').text('Desenvolvido por glzn-comercial', 48, 800, { align: 'center', width: 500 });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  }));

  return outPath;
}

async function handleGenerateSummaryPdf(event, { files, outputFolder }) {
  files = assertInputFiles(files);
  outputFolder = assertLocalPath(outputFolder, { label: 'a pasta de destino' });

  const sendProgress = (current, total, message, phase = 'resumo') => {
    const percent = total ? Math.round((current / total) * 100) : 0;
    event.sender.send('summary-progress-update', { current, total, percent, message, phase });
  };

  sendProgress(0, files.length, 'Lendo planilhas para o resumo...', 'leitura');

  // Reaproveita a leitura em lote, mas com progresso simples.
  const byCorretora = new Map();
  const errors = [];
  let count = 0;

  for (const file of files) {
    try {
      const { rows, info } = await readRowsForSummary(file);
      const corretora = getCorretoraFromFileName(file);
      const { total, found } = findTotalInRows(rows);

      if (!byCorretora.has(corretora)) {
        byCorretora.set(corretora, { corretora, total: 0, arquivos: 0, arquivosSemTotal: [] });
      }
      const item = byCorretora.get(corretora);
      item.arquivos += 1;
      item.total += total;
      if (!found) item.arquivosSemTotal.push(path.basename(file));
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err.message}`);
    }
    count++;
    sendProgress(count, files.length, `Lendo planilhas: ${count} de ${files.length}`, 'leitura');
  }

  const items = Array.from(byCorretora.values()).sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));
  if (!items.length) throw new Error('Não foi possível extrair nenhum resumo das planilhas selecionadas.');

  sendProgress(files.length, files.length, 'Gerando PDF...', 'geracao');
  const pdfPath = await createSummaryPdf(items, errors, outputFolder);
  sendProgress(files.length, files.length, 'PDF gerado com sucesso!', 'concluido');

  return { pdfPath, items, errors, totalGeral: items.reduce((acc, item) => acc + item.total, 0) };
}

async function handleGenerateReports(event, { files, outputFolder, sortAlpha, convertNumbers, reportMonth, jobId }) {
  jobId = jobId || `legacy-${crypto.randomUUID()}`;
  processingJobs.start(jobId);
  try {
  files = assertInputFiles(files);
  outputFolder = assertLocalPath(outputFolder, { label: 'a pasta de destino' });
  const reportInfo = monthReportInfo(reportMonth);
  const fingerprints = await fingerprintFiles(files);

  const sendProgress = (current, total, message, phase = 'processando') => {
    const percent = total ? Math.round((current / total) * 100) : 0;
    event.sender.send('progress-update', { current, total, percent, message, phase });
  };

  const grouped = new Map();
  const errors = [];

  sendProgress(0, files.length, 'Iniciando leitura dos arquivos...', 'leitura');

  let readCount = 0;
  for (const file of files) {
    await new Promise(resolve => setImmediate(resolve));
    processingJobs.assertActive(jobId);
    try {
      const item = await readInput(file);
      const corretoraOriginal = item.info.corretora || 'Corretora não identificada';
      const corretora = normalizarCorretoraParaGrupo(corretoraOriginal);
      item.info.corretoraGrupo = corretora;
      item.info.corretoraOriginal = corretoraOriginal;
      if (!grouped.has(corretora)) grouped.set(corretora, []);
      grouped.get(corretora).push(item);
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err.message}`);
    }
    readCount++;
    sendProgress(readCount, files.length, `Lendo arquivos: ${readCount} de ${files.length}`, 'leitura');
  }

  if (grouped.size === 0) throw new Error('Nenhum arquivo válido foi lido.');

  const outputReservation = reserveVersionedFolder(path.join(outputFolder, reportInfo.folderName));
  const outputRoot = outputReservation.outputPath;

  const resultFiles = [];
  const summary = [];
  const corretoras = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sendProgress(0, corretoras.length, 'Gerando arquivos por corretora...', 'geracao');

  let generated = 0;
  for (const corretora of corretoras) {
    await new Promise(resolve => setImmediate(resolve));
    processingJobs.assertActive(jobId);
    let items = grouped.get(corretora);

    // Arquivo da corretora principal sempre primeiro; depois os vendedores.
    items = items.sort((a, b) => {
      if (a.info.isPrincipalCorretora && !b.info.isPrincipalCorretora) return -1;
      if (!a.info.isPrincipalCorretora && b.info.isPrincipalCorretora) return 1;
      if (sortAlpha) return a.info.vendedor.localeCompare(b.info.vendedor, 'pt-BR');
      return 0;
    });

    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'glzn-comercial';
    wbOut.created = new Date();
    wbOut.modified = new Date();

    const wsOut = wbOut.addWorksheet('Comissões Gerais', { views: [{ showGridLines: true }] });

    let nextRow = 1;
    for (const item of items) {
      nextRow = copyBlock(item, wsOut, nextRow, convertNumbers);
    }

    // Faz a soma depois que todos os blocos já estão no arquivo final.
    // Assim a soma usa exatamente os valores que aparecem na planilha,
    // inclusive quando um arquivo de entrada já contém vários blocos.
    const consolidation = consolidateCommissionTotalsInWorksheet(wsOut);
    const totalConsolidado = consolidation.total;

    const outPath = path.join(outputRoot, safeFileName(corretora) + '.xlsx');
    await writeFileAtomically(outPath, temporaryPath => wbOut.xlsx.writeFile(temporaryPath));
    processingJobs.assertActive(jobId);
    resultFiles.push(outPath);

    const vendedoresReais = items.filter(i => !i.info.isPrincipalCorretora);
    const principais = items.filter(i => i.info.isPrincipalCorretora).length;

    // Group sellers and sum their commission totals (treating the broker itself as a seller if it has a principal sheet)
    const vendedoresMap = new Map();
    for (const i of items) {
      const nome = i.info.isPrincipalCorretora ? i.info.corretoraOriginal : i.info.vendedor;
      const total = getItemCommissionTotal(i);
      vendedoresMap.set(nome, (vendedoresMap.get(nome) || 0) + total);
    }
    const vendedoresDetalhes = Array.from(vendedoresMap.entries()).map(([nome, total]) => ({
      nome,
      total
    })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    summary.push({
      corretora,
      vendedores: vendedoresMap.size,
      arquivosPrincipais: principais,
      arquivo: outPath,
      vendedoresDetalhes,
      temCorretoraPrincipal: principais > 0,
      totalConsolidado
    });

    generated++;
    sendProgress(generated, corretoras.length, `Gerando relatórios: ${generated} de ${corretoras.length}`, 'geracao');
  }

  sendProgress(corretoras.length, corretoras.length, 'Concluído!', 'concluido');

  const totalSellers = summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
  const totalValue = Math.round((summary.reduce((sum, item) => sum + Number(item.totalConsolidado || 0), 0) + Number.EPSILON) * 100) / 100;
  const savedReport = {
    id: `${reportInfo.key}-${Date.now()}`,
    month: reportInfo.key,
    label: reportInfo.label,
    createdAt: new Date().toISOString(),
    outputRoot,
    version: outputReservation.version,
    batchFingerprint: fingerprints.batchFingerprint,
    fileFingerprints: fingerprints.fileFingerprints,
    sellers: totalSellers,
    brokers: summary.length,
    totalValue,
    inputFiles: files.length,
    outputFiles: resultFiles.length,
    errors: errors.length,
    summary: summary.map(item => ({
      corretora: item.corretora,
      vendedores: item.vendedores,
      totalConsolidado: item.totalConsolidado,
      arquivo: item.arquivo,
      vendedoresDetalhes: item.vendedoresDetalhes || []
    }))
  };

  const history = readSavedReports();
  history.unshift(savedReport);
  writeSavedReports(history.slice(0, 100));

  return { outputRoot, totalFiles: resultFiles.length, resultFiles, errors, summary, savedReport };
  } finally {
    processingJobs.finish(jobId);
  }
}

async function handleImportReadyReports(event, { files, reportMonth }) {
  files = assertInputFiles(files, { extensions: ['.xlsx'] });
  const fingerprints = await fingerprintFiles(files);
  const reportInfo = monthReportInfo(reportMonth);

  const errors = [];
  const summary = [];

  for (const file of files) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);
      const sheet = workbook.worksheets[0];

      // Pegar todas as linhas
      const rows = [];
      const lastRow = getLastUsedRow(sheet);
      const lastCol = getLastUsedCol(sheet);
      for (let r = 1; r <= lastRow; r++) {
        const row = [];
        for (let c = 1; c <= lastCol; c++) {
          row.push(sheet.getCell(r, c).value);
        }
        rows.push(row);
      }

      // Identificar o total consolidado da corretora
      const { total: totalConsolidado } = findTotalInRows(rows);

      // Identificar corretora a partir do nome do arquivo
      const corretora = getCorretoraFromFileName(file);

      // Mapear vendedores (blocos de dados na planilha consolidada)
      // Cada bloco começa com um título que contém o nome do vendedor.
      // O nome do vendedor pode ser extraído varrendo a coluna A (ou a primeira célula de cada linha).
      const vendedoresMap = new Map();
      
      // Iremos identificar blocos escaneando as células em busca de padrões de vendedores
      for (let r = 1; r <= lastRow; r++) {
        const firstCellValue = sheet.getCell(r, 1).value;
        const firstCellText = decodeHtml(getText(firstCellValue));
        if (firstCellText && firstCellText.includes(' - ')) {
          const parsed = parseVendedorCorretora(firstCellValue, file);
          if (parsed.vendedor && parsed.vendedor !== 'Corretora principal') {
            // Achar o total correspondente a este bloco de vendedor
            // Varre as linhas seguintes até achar outro bloco ou até o fim
            let totalVendedor = 0;
            for (let nextR = r + 1; nextR <= lastRow; nextR++) {
              const nextFirstCellValue = sheet.getCell(nextR, 1).value;
              const nextFirstCellText = decodeHtml(getText(nextFirstCellValue));
              if (nextFirstCellText && nextFirstCellText.includes(' - ')) {
                break; // Achou o próximo vendedor
              }
              const rowText = decodeHtml(getText(sheet.getCell(nextR, 1).value));
              const rowNorm = normalizeBaseText(rowText);
              if (rowNorm.includes('TOTAL DE COMISSOES A PAGAR')) {
                // Tenta achar o valor na mesma linha
                let val = parseBrazilCurrency(rowText);
                if (val === null) {
                  for (let c = 2; c <= Math.min(lastCol, 6); c++) {
                    const parsedVal = parseBrazilCurrency(getText(sheet.getCell(nextR, c).value));
                    if (parsedVal !== null) {
                      val = parsedVal;
                      break;
                    }
                  }
                }
                if (val !== null) {
                  totalVendedor = val;
                }
              }
            }
            vendedoresMap.set(parsed.vendedor, (vendedoresMap.get(parsed.vendedor) || 0) + totalVendedor);
          }
        }
      }

      let vendedoresDetalhes = Array.from(vendedoresMap.entries()).map(([nome, total]) => ({
        nome,
        total
      })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      // Se nenhum vendedor específico foi mapeado, adiciona a corretora como vendedor principal
      if (vendedoresDetalhes.length === 0) {
        vendedoresDetalhes = [{ nome: corretora, total: totalConsolidado }];
      }

      summary.push({
        corretora,
        vendedores: vendedoresDetalhes.length,
        arquivosPrincipais: 0,
        arquivo: file,
        vendedoresDetalhes,
        temCorretoraPrincipal: true,
        totalConsolidado
      });
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err.message}`);
    }
  }

  if (summary.length === 0) {
    throw new Error('Nenhum relatório pronto válido pôde ser importado.');
  }

  const totalSellers = summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
  const totalValue = Math.round((summary.reduce((sum, item) => sum + Number(item.totalConsolidado || 0), 0) + Number.EPSILON) * 100) / 100;
  
  // Pegamos a pasta do primeiro arquivo como outputRoot
  const outputRoot = path.dirname(files[0]);

  const savedReport = {
    id: `${reportInfo.key}-${Date.now()}`,
    month: reportInfo.key,
    label: reportInfo.label,
    createdAt: new Date().toISOString(),
    outputRoot,
    version: 1,
    batchFingerprint: fingerprints.batchFingerprint,
    fileFingerprints: fingerprints.fileFingerprints,
    sellers: totalSellers,
    brokers: summary.length,
    totalValue,
    inputFiles: files.length,
    outputFiles: files.length,
    errors: errors.length,
    summary: summary.map(item => ({
      corretora: item.corretora,
      vendedores: item.vendedores,
      totalConsolidado: item.totalConsolidado,
      arquivo: item.arquivo,
      vendedoresDetalhes: item.vendedoresDetalhes || []
    }))
  };

  const history = readSavedReports();
  history.unshift(savedReport);
  writeSavedReports(history.slice(0, 100));

  return { success: true, savedReport, errors };
}

async function handleParseGeneralInputs(event, { files }) {
  files = assertInputFiles(files, { extensions: ['.xlsx'] });
  
  const blocks = [];
  const errors = [];
  
  for (const file of files) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);
      const ws = workbook.worksheets[0];
      const lastRow = ws.actualRowCount;
      
      for (let r = 1; r <= lastRow; r++) {
        const cellVal = ws.getCell(r, 1).value;
        const text = decodeHtml(getText(cellVal));
        if (text && text.includes(' - ') && !text.startsWith('Lote:') && !text.startsWith('Período:') && !text.startsWith('Total de') && !text.startsWith('Comissao_')) {
          const parsed = parseVendedorCorretora(cellVal, file);
          if (parsed.corretora && parsed.corretora !== 'Corretora não identificada') {
            // Find total
            let total = 0;
            for (let nextR = r + 1; nextR <= Math.min(lastRow, r + 25); nextR++) {
              const nextVal = ws.getCell(nextR, 1).value;
              const nextText = decodeHtml(getText(nextVal));
              if (nextText.includes('Total de Comissões a pagar:')) {
                total = parseBrazilCurrency(nextText) || 0;
                break;
              }
            }
            
            // Scan headers at r+8
            const headers = [];
            const headerRow = r + 8;
            for (let c = 1; c <= 20; c++) {
              const hv = ws.getCell(headerRow, c).value;
              if (hv) headers.push(normalizeBaseText(getText(hv)));
            }
            
            // Detect default category
            let defaultCategory = 'PF';
            const normTitle = normalizeBaseText(text);
            
            if (normTitle.includes('DIFERENCA') || normTitle.includes('DIFERENCAS') || normTitle.includes('DIF')) {
              defaultCategory = 'Diferenças';
            } else if (normTitle.includes('META')) {
              defaultCategory = 'Meta';
            } else if (normTitle.includes('DESC TAXA') || normTitle.includes('TAXA')) {
              defaultCategory = 'Desc Taxa';
            } else if (normTitle.includes('IR ')) {
              defaultCategory = 'IR';
            } else if (normTitle.includes('LANÇAMENTO FUTURO') || normTitle.includes('FUTURO')) {
              defaultCategory = 'Lançamentos Futuros';
            } else {
              const isPF = headers.some(h => h.includes('CPF') || h.includes('RESPONSAVEL') || h.includes('USUARIO') || h.includes('PLANO'));
              if (!isPF) {
                defaultCategory = 'PJ';
              }
            }
            
            blocks.push({
              filePath: file,
              fileName: path.basename(file),
              vendedor: parsed.vendedor,
              corretora: parsed.corretora,
              total,
              category: defaultCategory
            });
          }
        }
      }
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err.message}`);
    }
  }
  
  return { blocks, errors };
}

async function handleGenerateGeneralReport(event, { reportMonth, outputFolder, corretorasData }) {
  if (!reportMonth) throw new Error('Mês de referência não informado.');
  outputFolder = assertLocalPath(outputFolder, { label: 'a pasta de destino' });
  if (!corretorasData || corretorasData.length === 0) throw new Error('Nenhum dado de corretora fornecido.');

  // Parse Month info
  const [year, month] = reportMonth.split('-');
  const date = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date).toUpperCase();
  const monthNameCapitalized = monthName.charAt(0) + monthName.slice(1).toLowerCase();
  
  const baseFileName = `${month}_RELATÓRIO GERAL_${monthName}_${year}.xlsx`;
  const { outputPath: outPath } = resolveVersionedFile(path.join(outputFolder, baseFileName));
  const fileName = path.basename(outPath);

  const year2d = year.slice(-2);
  const sheetName = `${monthName} ${year2d}`;

  // Group and merge corretorasData by normalized name
  const grouped = new Map();
  for (const c of corretorasData) {
    const name = normalizarCorretoraParaGrupo(c.corretora);
    if (!grouped.has(name)) {
      grouped.set(name, {
        corretora: name,
        PF: 0,
        PJ: 0,
        Diferenças: 0,
        Meta: 0,
        DescTaxa: 0,
        LancamentosFuturos: 0,
        IR: 0
      });
    }
    const gr = grouped.get(name);
    const totalVal = Number(c.totalComissao || 0);
    const category = c.category || 'PF';

    if (category === 'PF') gr.PF += totalVal;
    else if (category === 'PJ') gr.PJ += totalVal;

    gr.Diferenças += Number(c.diferencas || 0);
    gr.Meta += Number(c.meta || 0);
    gr.DescTaxa += Number(c.descTaxa || 0);
    gr.LancamentosFuturos += Number(c.lancamentosFuturos || 0);
    gr.IR += Number(c.ir || 0);
  }

  const sortedCorretoras = Array.from(grouped.values()).sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));

  // Create Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = 'glzn-comercial';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

  // Column Widths
  const widths = [32, 14, 14, 16, 14, 14, 16, 22, 12, 16, 12, 4, 32, 16];
  widths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  // Title Row 7
  ws.mergeCells('A7:K7');
  const titleA = ws.getCell('A7');
  titleA.value = `RELATÓRIO DE COMISSIONAMENTO ${monthNameCapitalized}/${year}`;
  titleA.font = { bold: true, size: 13, color: { argb: 'FF002B8F' } };
  titleA.alignment = { vertical: 'middle', horizontal: 'left' };

  ws.mergeCells('M7:N7');
  const titleM = ws.getCell('M7');
  titleM.value = 'DADOS DE COMISSÃO E NOTA FISCAL';
  titleM.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
  titleM.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getRow(7).height = 28;

  // Headers Row 8
  const headers = [
    "CORRETORA", "PF", "PJ", "DIFERENÇAS", "META", "DESC TAXA", "VALOR TOTAL", 
    "LANÇAMENTOS FUTUROS", "IR", "A RECEBER", "NF", null, "CORRETORA", "VALOR"
  ];
  
  const headerRow = ws.getRow(8);
  headerRow.height = 26;
  headers.forEach((h, idx) => {
    if (h === null) return;
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF062A60' } };
    cell.alignment = { vertical: 'middle', horizontal: idx === 0 || idx === 12 ? 'left' : 'center', wrapText: false };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Borders helper
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
  };

  let r = 9;
  for (const cData of sortedCorretoras) {
    const row = ws.getRow(r);
    row.height = 20;

    // A: CORRETORA
    row.getCell(1).value = cData.corretora;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    
    // B-F: PF, PJ, DIFERENÇAS, META, DESC TAXA
    row.getCell(2).value = cData.PF;
    row.getCell(3).value = cData.PJ;
    row.getCell(4).value = cData.Diferenças;
    row.getCell(5).value = cData.Meta === 0 ? null : cData.Meta;
    row.getCell(6).value = cData.DescTaxa === 0 ? null : cData.DescTaxa;

    // G: VALOR TOTAL (Formula: B + C + D + E + F)
    row.getCell(7).value = { formula: `B${r}+C${r}+D${r}+E${r}+F${r}` };

    // H-I: LANÇAMENTOS FUTUROS, IR
    row.getCell(8).value = cData.LancamentosFuturos === 0 ? null : cData.LancamentosFuturos;
    row.getCell(9).value = cData.IR === 0 ? null : cData.IR;

    // J: A RECEBER (Formula: IF(G > 10, G, 0))
    row.getCell(10).value = { formula: `IF(G${r}>10,G${r},0)` };

    // K: NF
    row.getCell(11).value = null;

    // M: CORRETORA (resumo)
    row.getCell(13).value = cData.corretora;
    row.getCell(13).alignment = { vertical: 'middle', horizontal: 'left' };

    // N: VALOR (resumo, Formula: J)
    row.getCell(14).value = { formula: `J${r}` };

    // Format all numeric columns
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 14].forEach(colIdx => {
      const cell = row.getCell(colIdx);
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });

    // Apply borders
    for (let col = 1; col <= 14; col++) {
      if (col === 12) continue;
      row.getCell(col).border = thinBorder;
    }

    r++;
  }

  // Row separator
  r++;

  // TOTALS Row
  const lastDataRow = r - 2;
  const totRow = ws.getRow(r);
  totRow.height = 24;

  totRow.getCell(1).value = "TOTAL ";
  totRow.getCell(1).font = { bold: true };
  totRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  // Main column sums: B to J
  const sumCols = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const colLetters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  sumCols.forEach((colIdx, idx) => {
    const letter = colLetters[idx];
    const cell = totRow.getCell(colIdx);
    cell.value = { formula: `SUM(${letter}9:${letter}${lastDataRow})` };
    cell.font = { bold: true };
    cell.numFmt = '#,##0.00';
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });

  totRow.getCell(13).value = "TOTAL";
  totRow.getCell(13).font = { bold: true };
  totRow.getCell(13).alignment = { vertical: 'middle', horizontal: 'left' };

  totRow.getCell(14).value = { formula: `SUM(N9:N${lastDataRow})` };
  totRow.getCell(14).font = { bold: true };
  totRow.getCell(14).numFmt = '#,##0.00';
  totRow.getCell(14).alignment = { vertical: 'middle', horizontal: 'right' };

  // Totals border & fill
  const doubleBottomBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'double', color: { argb: 'FF000000' } }
  };
  for (let col = 1; col <= 14; col++) {
    if (col === 12) continue;
    const cell = totRow.getCell(col);
    cell.border = doubleBottomBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFFF' } };
  }

  // Save Workbook
  await writeFileAtomically(outPath, temporaryPath => wb.xlsx.writeFile(temporaryPath));
  return { outPath, fileName };
}

async function handleGetCorretorasConfig() {
  return CORRETORAS_CONFIG;
}

async function handleSaveCorretorasConfig(_, newConfig) {
  CORRETORAS_CONFIG = corretorasRepository.save(newConfig);
  return true;
}

registerReportIpc({
  ipcMain,
  handlers: {
    generateSummaryPdf: handleGenerateSummaryPdf,
    generateReports: handleGenerateReports,
    importReadyReports: handleImportReadyReports,
    parseGeneralInputs: handleParseGeneralInputs,
    generateGeneralReport: handleGenerateGeneralReport,
    getCorretorasConfig: handleGetCorretorasConfig,
    saveCorretorasConfig: handleSaveCorretorasConfig
  }
});
