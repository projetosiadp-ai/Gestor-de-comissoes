import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import blobStream from 'blob-stream';
import { saveAs } from 'file-saver';
import {
  normalizeBaseText,
  brokerNameCore,
  areLikelySameBroker,
  safeFileName,
  decodeHtml,
  getText,
  parseVendedorCorretora,
  parseBrazilCurrency,
  formatBRL
} from '../lib/core/text.js';
import { readInput, getRowsFromXlsxSheet } from '../lib/reports/input-reader.js';
import { copyBlock, consolidateCommissionTotalsInWorksheet } from '../lib/reports/workbook-format.js';
import { getCorretorasConfig } from './configService.js';

async function resolveCorretoraViaConfig(base) {
  const config = await getCorretorasConfig();

  for (const [nomePrincipal, aliases] of Object.entries(config)) {
    const principalNorm = normalizeBaseText(nomePrincipal);
    const aliasList = Array.isArray(aliases) ? aliases : [];

    if (base === principalNorm || base.startsWith(principalNorm) || principalNorm.startsWith(base)) {
      return nomePrincipal;
    }

    for (const alias of aliasList) {
      const aliasNorm = normalizeBaseText(alias);
      if (!aliasNorm) continue;
      if (base === aliasNorm || base.startsWith(aliasNorm) || aliasNorm.startsWith(base)) {
        return nomePrincipal;
      }
    }
  }

  return null;
}

// Cria um resolvedor de nome de corretora escopado a um único lote de arquivos
// (uma chamada de generateGeneralReport/generateIndividualReports/parseGeneralInputs).
// Além da configuração cadastrada manualmente (system_config/corretoras_config),
// reconhece automaticamente quando duas grafias diferentes vistas no MESMO lote são
// a mesma corretora (ex: "TJK" e "TJK Corretora de Seguros Ltda"), comparando o nome
// sem sufixos jurídicos/descritivos genéricos (brokerNameCore). A primeira grafia
// vista para uma corretora "vence" e vira o nome canônico usado no relatório.
function createCorretoraResolver() {
  const canonicalByCore = new Map();

  return async function resolverCorretora(nome) {
    const original = String(nome || '').trim();
    const base = normalizeBaseText(original);
    if (!base || base.includes('NAO IDENTIFICADA')) return 'Corretora não identificada';

    const configMatch = await resolveCorretoraViaConfig(base);
    const resolvedName = configMatch || original;

    const core = brokerNameCore(resolvedName);
    const existing = canonicalByCore.get(core);
    if (existing) return existing;

    canonicalByCore.set(core, resolvedName);
    return resolvedName;
  };
}

// Varre os nomes finais de corretora de um relatório e sinaliza pares que parecem
// ser a mesma corretora grafada de forma diferente, mas que o resolvedor não uniu
// automaticamente (por segurança). É só um aviso para o usuário conferir, nunca
// uma fusão automática.
function findPossibleDuplicateBrokerPairs(names) {
  const relevant = names.filter(n => n && n !== 'Corretora não identificada');
  const pairs = [];
  for (let i = 0; i < relevant.length; i++) {
    for (let j = i + 1; j < relevant.length; j++) {
      if (areLikelySameBroker(relevant[i], relevant[j])) {
        pairs.push([relevant[i], relevant[j]]);
      }
    }
  }
  return pairs;
}

function findTotalInRows(rows) {
  let total = 0;
  let found = false;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const text = decodeHtml(getText(row[c]));
      const norm = normalizeBaseText(text);

      if (norm.includes('TOTAL DE COMISSOES') || norm.includes('TOTAL COMISSAO') || norm.includes('TOTAL GERAL') || norm.includes('TOTAL')) {
        let value = parseBrazilCurrency(text);

        if (value === null) {
          for (let k = c + 1; k < Math.min(row.length, c + 5); k++) {
            value = parseBrazilCurrency(row[k]);
            if (value !== null) break;
          }
        }

        if (value !== null && value > 0) {
          total += value;
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  return { found, total };
}

function getItemCommissionTotal(item, errors) {
  const rows = item.type === 'html-xls' ? item.rows : getRowsFromXlsxSheet(item.sheet);
  const result = findTotalInRows(rows);
  
  if (!result.found || result.total === 0) {
    if (errors) {
      // Find the row that contains "Total de Comissões" to log it for debugging
      let debugRow = "Nenhuma linha encontrada contendo 'Total de Comissões'";
      for(let r=0; r<Math.min(rows.length, 10); r++) {
         if (rows[r] && Array.isArray(rows[r]) && rows[r].some(c => String(c||'').toUpperCase().includes('TOTAL'))) {
           debugRow = JSON.stringify(rows[r]);
           break;
         }
      }
      errors.push(`Aviso: Total zerado no arquivo ${item.filePath}. Debug linha do total: ${debugRow}`);
    }
  }
  
  return result.found ? result.total : 0;
}

export async function generateGeneralReport(files, onProgress) {
  if (!files || files.length === 0) throw new Error('Nenhum arquivo fornecido.');

  let readCount = 0;
  const items = [];
  const errors = [];
  const reportData = [];
  const resolverCorretora = createCorretoraResolver();

  for (const file of files) {
    try {
      const item = await readInput(file, false);
      const corretoraOriginal = item.info.corretora || 'Corretora não identificada';
      const corretora = await resolverCorretora(corretoraOriginal);
      
      const total = getItemCommissionTotal(item);
      const semTotal = total === 0 && !item.rows?.some(r => r?.join('').includes('TOTAL'));

      let existing = items.find(i => i.corretora === corretora);
      if (!existing) {
        existing = {
          corretora,
          arquivos: 0,
          total: 0,
          arquivosSemTotal: []
        };
        items.push(existing);
      }

      existing.arquivos += 1;
      existing.total += total;
      if (semTotal) existing.arquivosSemTotal.push(file.name);

    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
    readCount++;
    if (onProgress) onProgress(readCount, files.length, `Lendo arquivos: ${readCount} de ${files.length}`, 'leitura');
  }

  items.sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));

  if (items.length === 0) throw new Error('Nenhum resumo pôde ser extraído.');

  if (onProgress) onProgress(files.length, files.length, 'Gerando PDF...', 'geracao');

  const pdfBlob = await createSummaryPdf(items, errors);
  saveAs(pdfBlob, `Resumo_Comissoes_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.pdf`);

  const possibleDuplicateBrokers = findPossibleDuplicateBrokerPairs(items.map(i => i.corretora));

  return { items, errors, totalGeral: items.reduce((acc, i) => acc + i.total, 0), possibleDuplicateBrokers };
}

async function createSummaryPdf(items, errors) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = doc.pipe(blobStream());

    const now = new Date();

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

    doc.fontSize(8).fillColor('#64748b').text('Desenvolvido por glzn-comercial', 48, 780, { align: 'center', width: 500 });
    doc.end();

    stream.on('finish', () => resolve(stream.toBlob('application/pdf')));
    stream.on('error', reject);
  });
}

export async function generateIndividualReports(files, sortAlpha, convertNumbers, filesToDeduplicate, filesToSkip = [], onProgress = null, autoDownload = false) {
  const grouped = new Map();
  const errors = [];
  let readCount = 0;
  const resolverCorretora = createCorretoraResolver();

  for (const file of files) {
    if (filesToSkip && filesToSkip.includes(file.name)) {
      readCount++;
      if (onProgress) onProgress(readCount, files.length, `Pulando arquivo: ${file.name}`, 'leitura');
      continue;
    }
    try {
      const shouldDeduplicate = filesToDeduplicate && filesToDeduplicate.includes(file.name);
      const item = await readInput(file, shouldDeduplicate);
      const corretoraOriginal = item.info.corretora || 'Corretora não identificada';
      const corretora = await resolverCorretora(corretoraOriginal);
      item.info.corretoraGrupo = corretora;
      item.info.corretoraOriginal = corretoraOriginal;
      if (!grouped.has(corretora)) grouped.set(corretora, []);
      grouped.get(corretora).push(item);
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
    readCount++;
    if (onProgress) onProgress(readCount, files.length, `Lendo arquivos: ${readCount} de ${files.length}`, 'leitura');
  }

  if (grouped.size === 0) throw new Error('Nenhum arquivo válido foi lido.');

  const corretoras = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let generated = 0;
  const summary = [];
  const generatedFiles = [];

  for (const corretora of corretoras) {
    let items = grouped.get(corretora);
    items = items.sort((a, b) => {
      if (a.info.isPrincipalCorretora && !b.info.isPrincipalCorretora) return -1;
      if (!a.info.isPrincipalCorretora && b.info.isPrincipalCorretora) return 1;
      if (sortAlpha) return a.info.vendedor.localeCompare(b.info.vendedor, 'pt-BR');
      return 0;
    });

    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'glzn-comercial';
    wbOut.created = new Date();
    const wsOut = wbOut.addWorksheet('Comissões Gerais', { views: [{ showGridLines: true }] });

    let nextRow = 1;
    for (const item of items) {
      nextRow = copyBlock(item, wsOut, nextRow, convertNumbers);
    }

    const consolidation = consolidateCommissionTotalsInWorksheet(wsOut);
    
    const buffer = await wbOut.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `${safeFileName(corretora)}.xlsx`;

    generatedFiles.push({ fileName, blob, corretora });

    if (autoDownload) {
      saveAs(blob, fileName);
    }

    const principais = items.filter(i => i.info.isPrincipalCorretora).length;
    const vendedoresMap = new Map();
    let mapTotal = 0;
    // Linhas brutas (com CPF, contrato, parcela etc.) de cada arquivo original desta
    // corretora, na mesma ordem usada para montar o Excel gerado acima. Guardado no
    // resumo para permitir reconstruir o arquivo completo mais tarde (ex: ao baixar
    // de novo pelo histórico de "Relatórios Salvos").
    const rawBlocks = [];

    for (const item of items) {
      const total = getItemCommissionTotal(item, []);
      mapTotal += total;

      const rows = item.rows || (item.sheet ? getRowsFromXlsxSheet(item.sheet) : []);
      rawBlocks.push(rows);
      let headerRow = null;
      let vendedorIdx = -1;
      let comissaoIdx = -1;

      // Apenas considera a coluna "VENDEDOR" explícita em tabelas (NÃO "RESPONSÁVEL" que é o cliente/usuário do plano)
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        if (Array.isArray(rows[r])) {
          const vIdx = rows[r].findIndex(c => {
            const str = String(c || '').toUpperCase().trim();
            return str === 'VENDEDOR';
          });
          const cIdx = rows[r].findIndex(c => {
            const str = String(c || '').toUpperCase().trim();
            return str.includes('COMISS') && !str.includes('RECEB');
          });
          if (vIdx !== -1) {
            headerRow = r;
            vendedorIdx = vIdx;
            if (cIdx !== -1) comissaoIdx = cIdx;
            break;
          }
        }
      }

      if (vendedorIdx !== -1 && headerRow !== null) {
        for (let r = headerRow + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;
          if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
          const rawName = String(row[vendedorIdx] || '').trim();
          if (!rawName) continue;
          const parsed = parseVendedorCorretora(rawName);
          const vName = (parsed && parsed.vendedor !== 'Corretora principal') ? parsed.vendedor : rawName;
          
          let vCom = 0;
          if (comissaoIdx !== -1) {
            const parsedCom = parseBrazilCurrency(String(row[comissaoIdx] || ''));
            if (parsedCom !== null) vCom = parsedCom;
          }
          vendedoresMap.set(vName, (vendedoresMap.get(vName) || 0) + vCom);
        }
      } else {
        const nome = item.info.isPrincipalCorretora ? item.info.corretoraGrupo : item.info.vendedor;
        vendedoresMap.set(nome, (vendedoresMap.get(nome) || 0) + total);
      }
    }

    const finalTotal = (consolidation.found && consolidation.total > 0) ? consolidation.total : mapTotal;

    const vendedoresDetalhes = Array.from(vendedoresMap.entries())
      .map(([nome, val]) => ({
        nome: (!nome || nome === 'Corretora principal') ? corretora : nome,
        total: val > 0 ? val : null
      }));

    if (vendedoresDetalhes.length === 0) {
      vendedoresDetalhes.push({ nome: corretora, total: finalTotal });
    }

    const nomesVendedores = vendedoresDetalhes.map(v => v.nome);

    summary.push({
      corretora,
      vendedores: vendedoresDetalhes.length,
      arquivosPrincipais: principais,
      total: finalTotal,
      totalConsolidado: finalTotal,
      vendedoresDetalhes,
      nomesVendedores,
      rawBlocks
    });

    generated++;
    if (onProgress) onProgress(generated, corretoras.length, `Gerando arquivo para: ${corretora}`, 'geracao');
  }

  const possibleDuplicateBrokers = findPossibleDuplicateBrokerPairs(summary.map(s => s.corretora));

  return { summary, errors, generatedFiles, possibleDuplicateBrokers };
}

export async function parseGeneralInputs(files, onProgress) {
  const blocks = [];
  const errors = [];
  let readCount = 0;
  const resolverCorretora = createCorretoraResolver();

  for (const file of files) {
    try {
      const item = await readInput(file, false);
      const rows = item.type === 'html-xls' ? item.rows : getRowsFromXlsxSheet(item.sheet);

      const corretoraOriginal = item.info.corretora || 'Corretora não identificada';
      const corretora = await resolverCorretora(corretoraOriginal);

      let total = 0;
      const result = findTotalInRows(rows);
      if (result.found && result.total > 0) {
        total = result.total;
      } else {
        // Fallback: sum values in commission column or last row cells
        let comissaoColIdx = -1;
        if (rows[0]) {
          comissaoColIdx = rows[0].findIndex(c => {
            const str = String(c || '').toUpperCase().trim();
            return str.includes('COMISS') && !str.includes('RECEB');
          });
        }

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;
          if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;

          if (comissaoColIdx !== -1) {
            const val = parseBrazilCurrency(String(row[comissaoColIdx] || ''));
            if (val !== null) total += val;
          } else {
            for (let k = row.length - 1; k >= 0; k--) {
              const val = parseBrazilCurrency(String(row[k] || ''));
              if (val !== null) {
                total += val;
                break;
              }
            }
          }
        }
      }

      blocks.push({
        corretora,
        total: total,
        category: 'PF'
      });
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
    readCount++;
    if (onProgress) onProgress(readCount, files.length, `Lendo arquivos: ${readCount} de ${files.length}`, 'leitura');
  }

  return { blocks, errors };
}

export async function generateGeneralExcel(reportMonth, corretorasData) {
  if (!reportMonth) throw new Error('Mês de referência não informado.');
  if (!corretorasData || corretorasData.length === 0) throw new Error('Nenhum dado de corretora fornecido.');

  const [year, month] = reportMonth.split('-');
  const date = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date).toUpperCase();
  const monthNameCapitalized = monthName.charAt(0) + monthName.slice(1).toLowerCase();
  
  const baseFileName = `${month}_RELATORIO_GERAL_${monthName}_${year}.xlsx`;
  const year2d = year.slice(-2);
  const sheetName = `${monthName} ${year2d}`;

  const grouped = new Map();
  for (const c of corretorasData) {
    const name = c.corretora;
    if (!grouped.has(name)) {
      grouped.set(name, {
        corretora: name,
        PF: 0, PJ: 0, Diferencas: 0, Meta: 0,
        DescTaxa: 0, LancamentosFuturos: 0, IR: 0
      });
    }
    const gr = grouped.get(name);
    const totalVal = Number(c.totalComissao || 0);
    const category = c.category || 'PF';

    if (category === 'PF') gr.PF += totalVal;
    else if (category === 'PJ') gr.PJ += totalVal;

    gr.Diferencas += Number(c.diferencas || 0);
    gr.Meta += Number(c.meta || 0);
    gr.DescTaxa += Number(c.descTaxa || 0);
    gr.LancamentosFuturos += Number(c.lancamentosFuturos || 0);
    gr.IR += Number(c.ir || 0);
  }

  const sortedCorretoras = Array.from(grouped.values()).sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'glzn-comercial';
  wb.created = new Date();
  
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

  const widths = [32, 14, 14, 16, 14, 14, 16, 22, 12, 16, 12, 4, 32, 16];
  widths.forEach((w, idx) => { ws.getColumn(idx + 1).width = w; });

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

    row.getCell(1).value = cData.corretora;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    
    row.getCell(2).value = cData.PF;
    row.getCell(3).value = cData.PJ;
    row.getCell(4).value = cData.Diferencas;
    row.getCell(5).value = cData.Meta === 0 ? null : cData.Meta;
    row.getCell(6).value = cData.DescTaxa === 0 ? null : cData.DescTaxa;

    row.getCell(7).value = { formula: `B${r}+C${r}+D${r}+E${r}+F${r}` };

    row.getCell(8).value = cData.LancamentosFuturos === 0 ? null : cData.LancamentosFuturos;
    row.getCell(9).value = cData.IR === 0 ? null : cData.IR;

    row.getCell(10).value = { formula: `IF(G${r}>10,G${r},0)` };
    row.getCell(11).value = null;

    row.getCell(13).value = cData.corretora;
    row.getCell(13).alignment = { vertical: 'middle', horizontal: 'left' };

    row.getCell(14).value = { formula: `J${r}` };

    [2, 3, 4, 5, 6, 7, 8, 9, 10, 14].forEach(colIdx => {
      const cell = row.getCell(colIdx);
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });

    for (let col = 1; col <= 14; col++) {
      if (col === 12) continue;
      row.getCell(col).border = thinBorder;
    }

    r++;
  }

  r++;

  const lastDataRow = r - 2;
  const totRow = ws.getRow(r);
  totRow.height = 24;

  totRow.getCell(1).value = "TOTAL ";
  totRow.getCell(1).font = { bold: true };
  totRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

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

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, baseFileName);

  return { fileName: baseFileName };
}
