const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });



function getHistoryPath() {
  return path.join(app.getPath('userData'), 'relatorios-salvos.json');
}

function readSavedReports() {
  try {
    const historyPath = getHistoryPath();
    if (!fs.existsSync(historyPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeSavedReports(items) {
  const historyPath = getHistoryPath();
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(items, null, 2), 'utf8');
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

ipcMain.handle('list-saved-reports', async () => {
  return readSavedReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
});

ipcMain.handle('delete-saved-report', async (_, id) => {
  const next = readSavedReports().filter(item => item.id !== id);
  writeSavedReports(next);
  return true;
});

ipcMain.handle('open-path', async (_, targetPath) => {
  if (!targetPath) return false;
  const error = await shell.openPath(targetPath);
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecione as planilhas de comissão',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Planilhas/HTML do sistema', extensions: ['xls', 'xlsx', 'html', 'htm'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-ready-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecione os relatórios consolidados já prontos (.xlsx)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Relatórios consolidados', extensions: ['xlsx'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-summary-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecione as planilhas prontas para gerar o PDF de resumo',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Planilhas de comissão', extensions: ['xls', 'xlsx', 'html', 'htm'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecione onde salvar os relatórios gerados',
    properties: ['openDirectory']
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('select-general-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecione as planilhas consolidadas das corretoras (.xlsx)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Planilhas Excel', extensions: ['xlsx'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});


function normalizeBaseText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' E ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCorretorasConfig() {
  const configPath = path.join(__dirname, 'corretoras.json');
  const defaultConfig = {
    "AS PRIME": [
      "AS PRIME",
      "SERVIÇOS DE APOIO A CORRETORES LTDA - ME",
      "SERVICOS DE APOIO A CORRETORES LTDA ME"
    ],
    "MJC": [
      "MJC",
      "MJC CONSULTORIA",
      "MJC CORRETORA",
      "MARCOS JACINTO DA COSTA"
    ],
    "YIA BROKER": [
      "YIA BROKER",
      "YIA BROKER DIGITAL",
      "YIA BROKER CORRETORA DE SEGUROS MASSIFICADO LTDA"
    ]
  };

  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      return defaultConfig;
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : defaultConfig;
  } catch (_) {
    return defaultConfig;
  }
}

const CORRETORAS_CONFIG = loadCorretorasConfig();

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

function safeFileName(name) {
  return String(name || 'SEM_NOME')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.richText) return value.richText.map(x => x.text).join('');
    if (value.result !== undefined) return String(value.result);
    if (value.formula !== undefined && value.result !== undefined) return String(value.result);
  }
  return String(value);
}

function parseVendedorCorretora(rawTitle, filePath = '') {
  let text = decodeHtml(getText(rawTitle))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normaliza traços diferentes e espaços grudados.
  text = text.replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ');

  let vendedor = '';
  let corretora = '';
  let isPrincipalCorretora = false;

  const parts = text.split(' - ').map(p => p.trim()).filter(Boolean);

  // Caso 1: padrão VENDEDOR - CORRETORA
  if (parts.length >= 2) {
    vendedor = parts[0];
    corretora = parts.slice(1).join(' - ');
  }

  // Caso 2: arquivo da própria corretora, sem vendedor.
  // Exemplo: "AS PRIME" ou "NEWPLANECOM ADMINISTRADORA..."
  // Aqui a linha de cima é a corretora, não um erro.
  if (!corretora && text && !text.match(/^Per[ií]odo|^Lote|^Total|^Comissao/i)) {
    corretora = text;
    vendedor = 'Corretora principal';
    isPrincipalCorretora = true;
  }

  // Plano B: tenta pelo nome do arquivo somente se ainda não achou nada útil.
  if ((!corretora || corretora === 'Corretora não identificada') && filePath) {
    const base = path.basename(filePath, path.extname(filePath))
      .replace(/[_]+/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
    const fileParts = base.split(' - ').map(p => p.trim()).filter(Boolean);
    if (fileParts.length >= 2) {
      vendedor = vendedor || fileParts[0];
      corretora = fileParts.slice(1).join(' - ');
      text = text || base;
      isPrincipalCorretora = false;
    }
  }

  return {
    vendedor: vendedor || 'Corretora principal',
    corretora: corretora || 'Corretora não identificada',
    titulo: text || 'Identificação não encontrada',
    isPrincipalCorretora
  };
}

function copyCell(sourceCell, targetCell) {
  targetCell.value = sourceCell.value;
  if (sourceCell.style) targetCell.style = JSON.parse(JSON.stringify(sourceCell.style));
  if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
  if (sourceCell.alignment) targetCell.alignment = JSON.parse(JSON.stringify(sourceCell.alignment));
  if (sourceCell.font) targetCell.font = JSON.parse(JSON.stringify(sourceCell.font));
  if (sourceCell.fill) targetCell.fill = JSON.parse(JSON.stringify(sourceCell.fill));
  if (sourceCell.border) targetCell.border = JSON.parse(JSON.stringify(sourceCell.border));
}

async function readXlsxInput(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const info = parseVendedorCorretora(sheet.getCell('A1').value, filePath);
  return { filePath, type: 'xlsx', workbook, sheet, info };
}

function extractHtmlTitle(clean) {
  // O sistema coloca a identificação logo no topo, antes de "Período".
  // Pode vir como:
  //   VENDEDOR - CORRETORA
  // ou apenas:
  //   CORRETORA
  const withoutStyle = clean.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // 1) Pega o primeiro <b> antes do Período. Isso resolve arquivos sem vendedor.
  const beforePeriodHtml = withoutStyle.split(/<\s*b[^>]*>\s*Per[ií]odo\s*:/i)[0] || withoutStyle;
  const boldMatches = [...beforePeriodHtml.matchAll(/<b[^>]*>\s*([\s\S]*?)\s*<\/b>/gi)]
    .map(m => decodeHtml(m[1]))
    .filter(x => x && !/^Per[ií]odo|^Lote|^Total|^Comissao/i.test(x));
  if (boldMatches.length) return boldMatches[0];

  // 2) Se por algum motivo não veio em <b>, pega a primeira linha antes do Período.
  const plain = decodeHtml(withoutStyle.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' '));
  const beforePeriod = plain.split(/Per[ií]odo/i)[0] || plain;
  const line = beforePeriod.split(/\n|\s{3,}/).map(x => x.trim()).find(x => x && !/^style/i.test(x));
  if (line) return line;

  return '';
}

function htmlToRows(html, filePath = '', shouldDeduplicate = false) {
  const clean = html.replace(/\r?\n/g, ' ');

  const titulo = extractHtmlTitle(clean) || path.basename(filePath, path.extname(filePath));

  const periodoMatch = clean.match(/Per[^:<]*odo:\s*<\/b>\s*([^<]*)/i);
  const periodo = decodeHtml(periodoMatch ? periodoMatch[1] : '');

  const loteMatch = clean.match(/Lote:\s*<\/b>\s*([^<]*)\s*-\s*<b[^>]*>\s*([^<]*)/i);
  const lote = loteMatch ? `${decodeHtml(loteMatch[1])} - ${decodeHtml(loteMatch[2])}` : '';

  const totalMatch = clean.match(/Total de Comiss[^:]*a pagar:\s*<b[^>]*>\s*([^<]*)/i);
  const totalOriginal = decodeHtml(totalMatch ? totalMatch[1] : '');

  const rows = [];
  rows[0] = [titulo];
  rows[1] = [`Período: ${periodo}`];
  rows[2] = [`Lote: ${lote}`];
  rows[3] = [];
  rows[5] = [];
  rows[6] = [];
  rows[7] = ['Comissao_normal'];

  // Extrai todas as linhas <tr> de um bloco de HTML de tabela
  function parseTableRows(tableHtml) {
    const result = [];
    const trRx = /<tr[\s\S]*?<\/tr>/gi;
    const tdRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let trM;
    while ((trM = trRx.exec(tableHtml)) !== null) {
      const cells = [];
      let tdM;
      while ((tdM = tdRx.exec(trM[0])) !== null) {
        cells.push(decodeHtml(tdM[1]));
      }
      if (cells.length > 0) result.push(cells);
    }
    return result;
  }

  // --- 1. Lê tabela PJ (GRD_ResultadoPJ) para coletar empresas PJ e calcular total PJ ---
  const pjCompanies = new Set();
  let pjTotal = 0;
  let pjAllRows = [];
  const pjTableMatch = clean.match(/id="GRD_ResultadoPJ"[^>]*>([\s\S]*?)<\/table>/i);
  if (pjTableMatch) {
    pjAllRows = parseTableRows(pjTableMatch[1]);
    // Colunas PJ: [0]Código [1]Empresa [2]Parcela [3]Vencimento [4]Pagamento
    //             [5]Recebido [6]Regra [7]Comissão [8]Vidas [9]Mensalidade
    for (let i = 1; i < pjAllRows.length; i++) {
      const row = pjAllRows[i];
      if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
      const empresa = String(row[1] || '').trim();
      if (!empresa) continue;
      const comissao = parseBrazilCurrency(String(row[7] || ''));
      const recebido = parseBrazilCurrency(String(row[5] || ''));
      if (recebido !== null || comissao !== null) {
        pjCompanies.add(empresa);
        if (comissao !== null) pjTotal += comissao;
      }
    }
  }

  // --- 2. Lê tabela PF (GRD_ResultadoPF), removendo empresas que já constam no PJ ---
  const pfTableMatch = clean.match(/id="GRD_ResultadoPF"[^>]*>([\s\S]*?)<\/table>/i);

  if (!pfTableMatch) {
    // Fallback: sem ID específico, comportamento antigo (primeira tabela)
    const tableMatch = clean.match(/<table[\s\S]*?<\/table>/i);
    if (!tableMatch) {
      rows[4] = [`Total de Comissões a pagar: ${totalOriginal}`];
      return rows;
    }
    const allRows = parseTableRows(tableMatch[0]);
    allRows.forEach(r => rows.push(r));
    rows[4] = [`Total de Comissões a pagar: ${totalOriginal}`];
    return rows;
  }

  const pfAllRows = parseTableRows(pfTableMatch[1]);
  let pfTotal = 0;
  const pfDataRows = [];

  // pfAllRows[0] = cabeçalho da tabela PF
  if (pfAllRows[0]) rows.push(pfAllRows[0]);

  // Colunas PF: [0]Código [1]Responsável [2]Usuário [3]Contrato [4]CPF
  //             [5]Empresa [6]Plano [7]Parcela [8]Vencimento [9]Pagamento
  //             [10]Regra [11]Recebido [12]Comissão [13]Mensalidade [14]Data de Adesão
  for (let i = 1; i < pfAllRows.length; i++) {
    const row = pfAllRows[i];
    if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
    const code = String(row[0] || '').trim();
    if (!code) continue;
    // Remove linhas de empresas que já constam no bloco PJ (apenas se a dedupilação for solicitada)
    const empresa = String(row[5] || '').trim();
    if (shouldDeduplicate && pjCompanies.size > 0 && empresa && pjCompanies.has(empresa)) continue;
    const comissao = parseBrazilCurrency(String(row[12] || ''));
    if (comissao !== null) pfTotal += comissao;
    pfDataRows.push(row);
  }

  pfDataRows.forEach(r => rows.push(r));

  // --- 3. Adiciona bloco PJ ao final, mapeando para o formato de colunas PF ---
  // PJ: [0]Código [1]Empresa [2]Parcela [3]Vencimento [4]Pagamento
  //     [5]Recebido [6]Regra [7]Comissão [8]Vidas [9]Mensalidade
  // PF: [0]Código [1]Responsável [2]Usuário [3]Contrato [4]CPF
  //     [5]Empresa [6]Plano [7]Parcela [8]Vencimento [9]Pagamento
  //     [10]Regra [11]Recebido [12]Comissão [13]Mensalidade [14]Data de Adesão
  if (pjAllRows.length > 0 && pjCompanies.size > 0) {
    rows.push([]); // separador
    rows.push(['PJ']); // rótulo de seção (não é cabeçalho de tabela)
    for (let i = 1; i < pjAllRows.length; i++) {
      const row = pjAllRows[i];
      if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
      const empresa = String(row[1] || '').trim();
      if (!empresa) continue;
      const recebido = parseBrazilCurrency(String(row[5] || ''));
      const comissao = parseBrazilCurrency(String(row[7] || ''));
      if (recebido === null && comissao === null) continue;
      // Mapeia colunas PJ para as posições equivalentes da tabela PF
      rows.push([
        row[0],  // [0]  Código
        row[1],  // [1]  Responsável ← usa Empresa PJ
        '',      // [2]  Usuário
        '',      // [3]  Contrato
        '',      // [4]  CPF
        row[1],  // [5]  Empresa
        '',      // [6]  Plano
        row[2],  // [7]  Parcela
        row[3],  // [8]  Vencimento
        row[4],  // [9]  Pagamento
        row[6],  // [10] Regra
        row[5],  // [11] Recebido
        row[7],  // [12] Comissão
        row[9],  // [13] Mensalidade
        '',      // [14] Data de Adesão
      ]);
    }
  }

  // --- 4. Total recalculado = PF restante + PJ ---
  const grandTotal = Math.round((pfTotal + pjTotal + Number.EPSILON) * 100) / 100;
  rows[4] = [`Total de Comissões a pagar: ${formatNumberBR(grandTotal)}`];

  return rows;
}


function normalizeHeaderName(value) {
  return normalizeBaseText(getText(value));
}

function parseBrazilNumber(text) {
  let s = String(text || '').trim();
  if (!s) return null;
  s = s.replace(/R\$/gi, '').replace(/\s+/g, '');

  const isPercent = s.endsWith('%');
  if (isPercent) s = s.slice(0, -1);

  // Aceita números no padrão brasileiro: 1.234,56 / 39,90 / 1957049
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && !/^-?\d+(,\d+)?$/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) {
    return null;
  }

  // Se tiver vírgula, considera vírgula decimal e ponto como milhar.
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return isPercent ? n / 100 : n;
}

function shouldConvertColumn(header) {
  const h = normalizeHeaderName(header);
  return (
    h === 'PARCELA' ||
    h === 'RECEBIDO' ||
    h === 'COMISSAO' ||
    h === 'MENSALIDADE' ||
    h === 'REGRA' ||
    h.includes('TOTAL') ||
    h.includes('VALOR')
  );
}

function getNumberFormatForHeader(header, originalValue) {
  const h = normalizeHeaderName(header);
  const raw = String(originalValue || '').trim();
  if (h === 'REGRA' || raw.endsWith('%')) return '0%';
  if (h === 'PARCELA' || h === 'MENSALIDADE') return '0';
  return '#,##0.00';
}

function convertCellToNumberIfNeeded(cell, header) {
  if (!shouldConvertColumn(header)) return;
  const original = getText(cell.value);
  const parsed = parseBrazilNumber(original);
  if (parsed === null) return;
  cell.value = parsed;
  cell.numFmt = getNumberFormatForHeader(header, original);
}

function convertBlockStringsToNumbers(ws, startRow, lastRow, lastCol) {
  const headerRowNumber = startRow + 8;
  const headers = [];
  for (let c = 1; c <= lastCol; c++) {
    headers[c] = ws.getCell(headerRowNumber, c).value;
  }

  for (let r = headerRowNumber + 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      convertCellToNumberIfNeeded(cell, headers[c]);
    }
  }
}

function applyStandardBlockStyle(ws, startRow, lastRow, lastCol) {
  // Larguras parecidas com a planilha original, mas mais legíveis.
  const widths = [12, 24, 24, 15, 18, 22, 28, 10, 15, 15, 12, 12, 12, 15, 15];
  for (let c = 1; c <= Math.max(lastCol, widths.length); c++) {
    ws.getColumn(c).width = widths[c - 1] || 15;
  }

  // Título e linhas superiores.
  ws.getRow(startRow).font = { bold: true, size: 12 };
  ws.getRow(startRow).height = 24;
  for (let r = startRow; r <= startRow + 7; r++) {
    ws.getRow(r).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
  }

  // Cabeçalho da tabela fica sempre na linha 9 do bloco.
  const headerRow = startRow + 8;
  const header = ws.getRow(headerRow);
  header.height = 28;
  header.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Linhas de dados.
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.height = 22;
    row.alignment = { vertical: 'middle', wrapText: false };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    });
  }

  // Borda grossa em volta do bloco.
  const medium = { style: 'medium', color: { argb: 'FF000000' } };
  for (let c = 1; c <= lastCol; c++) {
    ws.getCell(startRow, c).border = { ...ws.getCell(startRow, c).border, top: medium };
    ws.getCell(lastRow, c).border = { ...ws.getCell(lastRow, c).border, bottom: medium };
  }
  for (let r = startRow; r <= lastRow; r++) {
    ws.getCell(r, 1).border = { ...ws.getCell(r, 1).border, left: medium };
    ws.getCell(r, lastCol).border = { ...ws.getCell(r, lastCol).border, right: medium };
  }
}

function readHtmlInput(filePath, shouldDeduplicate = false) {
  const buffer = fs.readFileSync(filePath);
  const html = buffer.toString('latin1');
  const rows = htmlToRows(html, filePath, shouldDeduplicate);
  const info = parseVendedorCorretora(rows[0]?.[0], filePath);
  return { filePath, type: 'html-xls', rows, info };
}

async function readInput(filePath, shouldDeduplicate = false) {
  const ext = path.extname(filePath).toLowerCase();
  const firstBytes = fs.readFileSync(filePath).slice(0, 20).toString('latin1').toLowerCase();

  if (ext === '.xlsx' || firstBytes.startsWith('pk')) {
    return await readXlsxInput(filePath);
  }

  // Arquivos .xls gerados pelo sistema são HTML disfarçado de Excel.
  return readHtmlInput(filePath, shouldDeduplicate);
}

function getLastUsedRow(sheet) {
  let last = 1;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (row.actualCellCount > 0) last = rowNumber;
  });
  return last;
}

function getLastUsedCol(sheet) {
  let last = 1;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (_, colNumber) => { if (colNumber > last) last = colNumber; });
  });
  return last;
}

function copyXlsxBlock(sourceSheet, targetSheet, startRow, convertNumbers) {
  const lastRow = getLastUsedRow(sourceSheet);
  const lastCol = getLastUsedCol(sourceSheet);

  for (let c = 1; c <= lastCol; c++) {
    const srcCol = sourceSheet.getColumn(c);
    const dstCol = targetSheet.getColumn(c);
    if (srcCol.width) dstCol.width = Math.max(dstCol.width || 0, srcCol.width);
  }

  for (let r = 1; r <= lastRow; r++) {
    const srcRow = sourceSheet.getRow(r);
    const dstRow = targetSheet.getRow(startRow + r - 1);
    if (srcRow.height) dstRow.height = srcRow.height;
    for (let c = 1; c <= lastCol; c++) {
      copyCell(srcRow.getCell(c), dstRow.getCell(c));
    }
  }

  const merges = sourceSheet.model.merges || [];
  for (const merge of merges) {
    const match = merge.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!match) continue;
    const [, c1, r1, c2, r2] = match;
    const newRange = `${c1}${Number(r1) + startRow - 1}:${c2}${Number(r2) + startRow - 1}`;
    try { targetSheet.mergeCells(newRange); } catch (_) {}
  }

  applyStandardBlockStyle(targetSheet, startRow, startRow + lastRow - 1, lastCol);
  if (convertNumbers) convertBlockStringsToNumbers(targetSheet, startRow, startRow + lastRow - 1, lastCol);
  return startRow + lastRow + 3;
}

function copyHtmlBlock(item, targetSheet, startRow, convertNumbers) {
  const rows = item.rows;
  const lastCol = Math.max(...rows.map(r => r.length), 15);

  rows.forEach((row, idx) => {
    const outRow = targetSheet.getRow(startRow + idx);
    row.forEach((value, colIdx) => {
      outRow.getCell(colIdx + 1).value = value;
    });
  });

  const lastRow = startRow + rows.length - 1;
  applyStandardBlockStyle(targetSheet, startRow, lastRow, lastCol);
  if (convertNumbers) convertBlockStringsToNumbers(targetSheet, startRow, lastRow, lastCol);
  return lastRow + 3;
}

function copyBlock(item, targetSheet, startRow, convertNumbers) {
  if (item.type === 'xlsx') return copyXlsxBlock(item.sheet, targetSheet, startRow, convertNumbers);
  return copyHtmlBlock(item, targetSheet, startRow, convertNumbers);
}



function getRowsFromXlsxSheet(sheet) {
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

  return rows;
}

function getItemCommissionTotal(item) {
  const rows = item.type === 'html-xls' ? item.rows : getRowsFromXlsxSheet(item.sheet);
  const result = findTotalInRows(rows);
  return result.found ? result.total : 0;
}

function formatNumberBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateFirstCommissionTotal(ws, consolidatedTotal) {
  const lastRow = getLastUsedRow(ws);
  const lastCol = getLastUsedCol(ws);

  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      const text = decodeHtml(getText(cell.value));
      const normalized = normalizeBaseText(text);

      if (!normalized.includes('TOTAL DE COMISSOES A PAGAR')) continue;

      // O padrão mais comum traz o texto e o valor na mesma célula.
      // Mantemos exatamente o rótulo e trocamos somente o valor.
      if (parseBrazilCurrency(text) !== null || /:\s*$/.test(text) === false) {
        cell.value = `Total de Comissões a pagar: ${formatNumberBR(consolidatedTotal)}`;
        return true;
      }

      // Plano B: caso o valor esteja em uma célula à direita.
      for (let nextCol = c + 1; nextCol <= Math.min(lastCol, c + 4); nextCol++) {
        const valueCell = ws.getCell(r, nextCol);
        if (parseBrazilCurrency(getText(valueCell.value)) !== null) {
          valueCell.value = consolidatedTotal;
          valueCell.numFmt = '#,##0.00';
          return true;
        }
      }

      cell.value = `Total de Comissões a pagar: ${formatNumberBR(consolidatedTotal)}`;
      return true;
    }
  }

  return false;
}


function consolidateCommissionTotalsInWorksheet(ws) {
  const lastRow = getLastUsedRow(ws);
  const lastCol = getLastUsedCol(ws);
  const totals = [];

  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const labelCell = ws.getCell(r, c);
      const text = decodeHtml(getText(labelCell.value));
      const normalized = normalizeBaseText(text);

      if (!normalized.includes('TOTAL DE COMISSOES A PAGAR')) continue;

      let value = parseBrazilCurrency(text);
      let valueCell = null;

      // Alguns relatórios deixam o rótulo em uma célula e o valor em outra.
      if (value === null) {
        for (let nextCol = c + 1; nextCol <= Math.min(lastCol, c + 6); nextCol++) {
          const candidate = ws.getCell(r, nextCol);
          const parsed = parseBrazilCurrency(getText(candidate.value));
          if (parsed !== null) {
            value = parsed;
            valueCell = candidate;
            break;
          }
        }
      }

      if (value !== null) {
        totals.push({ labelCell, valueCell, value });
      }

      // Só existe um campo desse tipo por linha; evita leitura duplicada.
      break;
    }
  }

  if (!totals.length) return { found: false, total: 0, count: 0 };

  const consolidatedTotal = Math.round(
    (totals.reduce((sum, item) => sum + item.value, 0) + Number.EPSILON) * 100
  ) / 100;

  const first = totals[0];

  if (first.valueCell) {
    // Mantém o primeiro rótulo e altera apenas a primeira célula numérica.
    first.valueCell.value = consolidatedTotal;
    first.valueCell.numFmt = '#,##0.00';
  } else {
    // Padrão mais comum do sistema: rótulo e valor na mesma célula.
    first.labelCell.value = `Total de Comissões a pagar: ${formatNumberBR(consolidatedTotal)}`;
  }

  // Remove os demais campos individuais de total.
  // O arquivo final fica apenas com o primeiro campo no topo,
  // contendo a soma de todos os blocos da corretora.
  for (let i = 1; i < totals.length; i++) {
    const item = totals[i];
    item.labelCell.value = null;

    if (item.valueCell) {
      item.valueCell.value = null;
    }
  }

  return { found: true, total: consolidatedTotal, count: totals.length };
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

function parseBrazilCurrency(text) {
  const raw = String(text || '').replace(/R\$/gi, '').trim();
  const matches = raw.match(/-?\d{1,3}(?:\.\d{3})*,\d{1,2}|-?\d+,\d{1,2}|-?\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  const s0 = matches[matches.length - 1];
  let s = s0.replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const outPath = path.join(outputRoot, `Resumo_Comissoes_${stamp}.pdf`);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, 'assets', 'logo.png');
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
  });

  return outPath;
}

ipcMain.handle('generate-summary-pdf', async (event, { files, outputFolder }) => {
  if (!files || files.length === 0) throw new Error('Nenhuma planilha foi selecionada.');
  if (!outputFolder) throw new Error('Selecione a pasta onde deseja salvar o PDF.');

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
});

async function analyzeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const firstBytes = fs.readFileSync(filePath).slice(0, 20).toString('latin1').toLowerCase();

  let brokerName = 'Corretora não identificada';
  try {
    const item = await readInput(filePath, false);
    if (item && item.info) {
      const corretoraOriginal = item.info.corretora || 'Corretora não identificada';
      brokerName = normalizarCorretoraParaGrupo(corretoraOriginal);
    }
  } catch (err) {
    console.error('Erro ao ler corretora no analyzeFile:', err);
  }

  if (ext === '.xlsx' || firstBytes.startsWith('pk')) {
    return { filePath, fileName: path.basename(filePath), brokerName, hasDuplicates: false, duplicateCompanies: [] };
  }

  const html = fs.readFileSync(filePath, 'latin1');
  const clean = html.replace(/\r?\n/g, ' ');

  // Parse PJ table
  const pjCompanies = new Set();
  const pjTableMatch = clean.match(/id="GRD_ResultadoPJ"[^>]*>([\s\S]*?)<\/table>/i);
  if (pjTableMatch) {
    const trRx = /<tr[\s\S]*?<\/tr>/gi;
    const tdRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let trM;
    while ((trM = trRx.exec(pjTableMatch[1])) !== null) {
      const cells = [];
      let tdM;
      while ((tdM = tdRx.exec(trM[0])) !== null) {
        cells.push(decodeHtml(tdM[1]));
      }
      if (cells.length > 0 && !cells.some(c => String(c || '').toUpperCase().includes('TOTAL'))) {
        const empresa = String(cells[1] || '').trim();
        if (empresa) pjCompanies.add(empresa);
      }
    }
  }

  // Parse PF table and look for duplicates
  const duplicateCompanies = new Set();
  const pfTableMatch = clean.match(/id="GRD_ResultadoPF"[^>]*>([\s\S]*?)<\/table>/i);
  if (pfTableMatch && pjCompanies.size > 0) {
    const trRx = /<tr[\s\S]*?<\/tr>/gi;
    const tdRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let trM;
    while ((trM = trRx.exec(pfTableMatch[1])) !== null) {
      const cells = [];
      let tdM;
      while ((tdM = tdRx.exec(trM[0])) !== null) {
        cells.push(decodeHtml(tdM[1]));
      }
      if (cells.length > 0 && !cells.some(c => String(c || '').toUpperCase().includes('TOTAL'))) {
        const empresa = String(cells[5] || '').trim();
        if (empresa && pjCompanies.has(empresa)) {
          duplicateCompanies.add(empresa);
        }
      }
    }
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    brokerName,
    hasDuplicates: duplicateCompanies.size > 0,
    duplicateCompanies: Array.from(duplicateCompanies)
  };
}

ipcMain.handle('analyze-files', async (event, filePaths) => {
  const results = [];
  for (const file of filePaths) {
    try {
      const res = await analyzeFile(file);
      results.push(res);
    } catch (err) {
      results.push({ filePath: file, fileName: path.basename(file), brokerName: 'Corretora não identificada', hasDuplicates: false, error: err.message });
    }
  }
  return results;
});

ipcMain.handle('generate-reports', async (event, { files, outputFolder, sortAlpha, convertNumbers, reportMonth, filesToDeduplicate = [], filesToSkip = [] }) => {
  if (!files || files.length === 0) throw new Error('Nenhum arquivo foi selecionado.');
  if (!outputFolder) throw new Error('Selecione a pasta onde deseja salvar.');
  const reportInfo = monthReportInfo(reportMonth);

  const sendProgress = (current, total, message, phase = 'processando') => {
    const percent = total ? Math.round((current / total) * 100) : 0;
    event.sender.send('progress-update', { current, total, percent, message, phase });
  };

  const grouped = new Map();
  const errors = [];

  sendProgress(0, files.length, 'Iniciando leitura dos arquivos...', 'leitura');

  let readCount = 0;
  for (const file of files) {
    if (filesToSkip && filesToSkip.includes(file)) {
      readCount++;
      sendProgress(readCount, files.length, `Pulando arquivo (duplicidade não corrigida): ${path.basename(file)}`, 'leitura');
      continue;
    }
    try {
      const shouldDeduplicate = filesToDeduplicate && filesToDeduplicate.includes(file);
      const item = await readInput(file, shouldDeduplicate);
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

  const outputRoot = path.join(outputFolder, reportInfo.folderName);
  fs.mkdirSync(outputRoot, { recursive: true });

  const resultFiles = [];
  const summary = [];
  const corretoras = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sendProgress(0, corretoras.length, 'Gerando arquivos por corretora...', 'geracao');

  let generated = 0;
  for (const corretora of corretoras) {
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
    await wbOut.xlsx.writeFile(outPath);
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
});

ipcMain.handle('import-ready-reports', async (event, { files, reportMonth }) => {
  if (!files || files.length === 0) throw new Error('Nenhum arquivo foi selecionado.');
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
});

ipcMain.handle('parse-general-inputs', async (event, { files }) => {
  if (!files || files.length === 0) throw new Error('Nenhum arquivo foi selecionado.');
  
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
});

ipcMain.handle('generate-general-report', async (event, { reportMonth, outputFolder, corretorasData }) => {
  if (!reportMonth) throw new Error('Mês de referência não informado.');
  if (!outputFolder) throw new Error('Selecione uma pasta de destino.');
  if (!corretorasData || corretorasData.length === 0) throw new Error('Nenhum dado de corretora fornecido.');

  // Parse Month info
  const [year, month] = reportMonth.split('-');
  const date = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date).toUpperCase();
  const monthNameCapitalized = monthName.charAt(0) + monthName.slice(1).toLowerCase();
  
  const fileName = `${month}_RELATÓRIO GERAL_${monthName}_${year}.xlsx`;
  const outPath = path.join(outputFolder, fileName);

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
  await wb.xlsx.writeFile(outPath);
  return { outPath, fileName };
});


