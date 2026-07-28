import ExcelJS from 'exceljs';
import { decodeHtml, parseVendedorCorretora, parseBrazilCurrency, formatNumberBR } from '../core/text.js';
import { extractHtmlCommissionRecords, recordsFromRows } from '../core/duplicate-analysis.js';

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  sheet.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, (_, colNumber) => {
      if (colNumber > last) last = colNumber;
    });
  });
  return last;
}

function getRowsFromXlsxSheet(sheet) {
  const rows = [];
  const lastRow = getLastUsedRow(sheet);
  const lastCol = getLastUsedCol(sheet);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = [];
    for (let colNumber = 1; colNumber <= lastCol; colNumber++) {
      row.push(sheet.getCell(rowNumber, colNumber).value);
    }
    rows.push(row);
  }
  return rows;
}

async function readXlsxInput(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const info = parseVendedorCorretora(sheet.getCell('A1').value, file.name);
  return { filePath: file.name, type: 'xlsx', workbook, sheet, info };
}

function extractHtmlTitle(clean) {
  const withoutStyle = clean.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const beforePeriodHtml = withoutStyle.split(/<\s*b[^>]*>\s*Per[ií]odo\s*:/i)[0] || withoutStyle;
  const boldMatches = [...beforePeriodHtml.matchAll(/<b[^>]*>\s*([\s\S]*?)\s*<\/b>/gi)]
    .map(match => decodeHtml(match[1]))
    .filter(value => value && !/^Per[ií]odo|^Lote|^Total|^Comissao/i.test(value));
  if (boldMatches.length) return boldMatches[0];

  const plain = decodeHtml(withoutStyle.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' '));
  const beforePeriod = plain.split(/Per[ií]odo/i)[0] || plain;
  return beforePeriod.split(/\n|\s{3,}/).map(value => value.trim())
    .find(value => value && !/^style/i.test(value)) || '';
}

function htmlToRows(html, fileName = '', shouldDeduplicate = false) {
  const clean = html.replace(/\r?\n/g, ' ');

  let baseName = fileName.split(/[\\/]/).pop();
  if (baseName.includes('.')) baseName = baseName.substring(0, baseName.lastIndexOf('.'));
  const titulo = extractHtmlTitle(clean) || baseName || fileName;

  const periodoMatch = clean.match(/Per[^:<]*odo:\s*<\/b>\s*([^<]*)/i);
  const periodo = decodeHtml(periodoMatch ? periodoMatch[1] : '');

  const loteMatch = clean.match(/Lote:\s*<\/b>\s*([^<]*)\s*-\s*<b[^>]*>\s*([^<]*)/i);
  const lote = loteMatch ? `${decodeHtml(loteMatch[1])} - ${decodeHtml(loteMatch[2])}` : '';

  const totalMatch = clean.match(/Total de Comiss[^:]*a pagar:[\s<b\/>]*([\d.,]+)/i);
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
    let trM;
    while ((trM = trRx.exec(tableHtml)) !== null) {
      const cells = [];
      const tdRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdM;
      while ((tdM = tdRx.exec(trM[0])) !== null) {
        cells.push(decodeHtml(tdM[1]));
      }
      if (cells.length > 0) result.push(cells);
    }
    return result;
  }

  // --- 1. Lê tabela PJ (GRD_ResultadoPJ) para coletar empresas PJ e calcular total PJ
  const pjCompanies = new Set();
  let pjTotal = 0;
  let pjRecebidoTotal = 0;
  let pjAllRows = [];
  let pjComissaoColIdx = 7;
  let pjRecebidoColIdx = 5;
  let pjEmpresaColIdx = 1;

  const pjTableMatch = clean.match(/id="GRD_ResultadoPJ"[^>]*>([\s\S]*?)<\/table>/i);
  if (pjTableMatch) {
    pjAllRows = parseTableRows(pjTableMatch[1]);
    if (pjAllRows[0]) {
      const comIdx = pjAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('COMISS'));
      if (comIdx !== -1) pjComissaoColIdx = comIdx;
      const recIdx = pjAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('RECEB'));
      if (recIdx !== -1) pjRecebidoColIdx = recIdx;
      const empIdx = pjAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('EMPRESA'));
      if (empIdx !== -1) pjEmpresaColIdx = empIdx;
    }

    for (let i = 1; i < pjAllRows.length; i++) {
      const row = pjAllRows[i];
      if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
      const empresa = String(row[pjEmpresaColIdx] || '').trim();
      if (!empresa) continue;
      const comissao = parseBrazilCurrency(String(row[pjComissaoColIdx] || ''));
      const recebido = parseBrazilCurrency(String(row[pjRecebidoColIdx] || ''));
      if (recebido !== null || comissao !== null) {
        pjCompanies.add(empresa);
        if (comissao !== null) pjTotal += comissao;
        if (recebido !== null) pjRecebidoTotal += recebido;
      }
    }
  }

  const pfTableMatch = clean.match(/id="GRD_ResultadoPF"[^>]*>([\s\S]*?)<\/table>/i);

  if (!pfTableMatch) {
    // Tenta GRD_Resultado (relatório de lotes/geral com todos os vendedores)
    const grdResultadoMatch = clean.match(/id="GRD_Resultado"[^>]*>([\s\S]*?)<\/table>/i);
    // Fallback: primeira tabela genérica
    const tableMatch = grdResultadoMatch || clean.match(/<table[\s\S]*?<\/table>/i);

    if (!tableMatch) {
      rows[4] = [`Total de Comissões a pagar: ${totalOriginal}`];
      return rows;
    }

    const tableHtml = grdResultadoMatch ? tableMatch[1] : tableMatch[0];
    const allRows = parseTableRows(tableHtml);

    // Soma dinâmica: encontra a coluna "Comissão" e soma
    let fallbackTotal = 0;
    let fallbackComissaoIdx = -1;
    if (allRows[0]) {
      fallbackComissaoIdx = allRows[0].findIndex(c =>
        String(c || '').toUpperCase().includes('COMISS') &&
        !String(c || '').toUpperCase().includes('RECEB')
      );
    }

    // Tenta pegar o total da ÚLTIMA linha em negrito usando a coluna de Comissão
    let boldTotal = null;
    const lastDataRow = allRows[allRows.length - 1];
    if (lastDataRow && fallbackComissaoIdx !== -1) {
      const val = parseBrazilCurrency(String(lastDataRow[fallbackComissaoIdx] || ''));
      if (val !== null && val > 0) boldTotal = val;
    }

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
      if (!row.some(c => String(c || '').trim())) continue;
      if (fallbackComissaoIdx !== -1) {
        const val = parseBrazilCurrency(String(row[fallbackComissaoIdx] || ''));
        if (val !== null) fallbackTotal += val;
      } else {
        for (let k = row.length - 1; k >= 0; k--) {
          const val = parseBrazilCurrency(String(row[k] || ''));
          if (val !== null) { fallbackTotal += val; break; }
        }
      }
    }

    // Prioridade: totalOriginal (do cabeçalho) > boldTotal (rodapé da coluna comissão) > fallbackTotal (soma coluna)
    const finalTotal = totalOriginal || (boldTotal !== null ? formatNumberBR(boldTotal) : formatNumberBR(fallbackTotal));

    allRows.forEach(r => rows.push(r));
    rows[4] = [`Total de Comissões a pagar: ${finalTotal}`];
    return rows;
  }

  const pfAllRows = parseTableRows(pfTableMatch[1]);
  let pfTotal = 0;
  let pfRecebidoTotal = 0;
  const pfDataRows = [];

  if (pfAllRows[0]) rows.push(pfAllRows[0]);

  let pfComissaoColIdx = 12;
  let pfRecebidoColIdx = 11;
  let pfEmpresaColIdx = 5;
  let pfCodColIdx = 0;
  if (pfAllRows[0]) {
    const comIdx = pfAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('COMISS'));
    if (comIdx !== -1) pfComissaoColIdx = comIdx;
    const recIdx = pfAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('RECEB'));
    if (recIdx !== -1) pfRecebidoColIdx = recIdx;
    const empIdx = pfAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('EMPRESA'));
    if (empIdx !== -1) pfEmpresaColIdx = empIdx;
    const codIdx = pfAllRows[0].findIndex(c => String(c || '').toUpperCase().includes('CÓDIGO') || String(c || '').toUpperCase().includes('CODIGO'));
    if (codIdx !== -1) pfCodColIdx = codIdx;
  }

  for (let i = 1; i < pfAllRows.length; i++) {
    const row = pfAllRows[i];
    if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
    if (!row.some(c => String(c || '').trim())) continue;

    const empresa = String(row[pfEmpresaColIdx] || '').trim();
    if (shouldDeduplicate && pjCompanies.size > 0 && empresa && pjCompanies.has(empresa)) continue;

    const comissao = parseBrazilCurrency(String(row[pfComissaoColIdx] || ''));
    if (comissao !== null) pfTotal += comissao;
    const recebido = parseBrazilCurrency(String(row[pfRecebidoColIdx] || ''));
    if (recebido !== null) pfRecebidoTotal += recebido;
    pfDataRows.push(row);
  }

  pfDataRows.forEach(r => rows.push(r));

  // Linha de total ao final da tabela PF, só nas colunas Recebido e Comissão
  // (igual ao relatório feito manualmente).
  if (pfDataRows.length > 0) {
    const totalsRow = new Array(pfAllRows[0] ? pfAllRows[0].length : 15).fill('');
    totalsRow[pfCodColIdx] = 'TOTAL GERAL';
    totalsRow[pfRecebidoColIdx] = formatNumberBR(round2(pfRecebidoTotal));
    totalsRow[pfComissaoColIdx] = formatNumberBR(round2(pfTotal));
    rows.push(totalsRow);
  }

  // --- 3. Adiciona bloco PJ ao final, com o cabeçalho e as colunas próprias da
  // tabela PJ (Vidas não existe no PF, e PJ não tem Responsável/Usuário/Contrato/
  // CPF/Plano/Data de Adesão — por isso ganha sua própria tabela, em vez de ser
  // espremida no layout de colunas do PF).
  if (pjAllRows.length > 0 && pjCompanies.size > 0) {
    rows.push([]); // separador
    rows.push(['PJ']); // rótulo de seção
    rows.push(['Código', 'Empresa', 'Parcela', 'Vencimento', 'Pagamento', 'Recebido', 'Regra', 'Comissão', 'Vidas', 'Mensalidade']);
    let pjRowCount = 0;
    for (let i = 1; i < pjAllRows.length; i++) {
      const row = pjAllRows[i];
      if (row.some(c => String(c || '').toUpperCase().includes('TOTAL'))) continue;
      const empresa = String(row[1] || '').trim();
      if (!empresa) continue;
      const recebido = parseBrazilCurrency(String(row[5] || ''));
      const comissao = parseBrazilCurrency(String(row[7] || ''));
      if (recebido === null && comissao === null) continue;
      rows.push([row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]]);
      pjRowCount += 1;
    }
    // Linha de total ao final da tabela PJ, só nas colunas Recebido e Comissão.
    if (pjRowCount > 0) {
      rows.push(['TOTAL GERAL', '', '', '', '', formatNumberBR(round2(pjRecebidoTotal)), '', formatNumberBR(round2(pjTotal)), '', '']);
    }
  }

  // --- 4. Total recalculado = PF restante + PJ ---
  const grandTotal = Math.round((pfTotal + pjTotal + Number.EPSILON) * 100) / 100;
  rows[4] = [`Total de Comissões a pagar: ${formatNumberBR(grandTotal)}`];
  return rows;
}

async function readHtmlInput(file, shouldDeduplicate = false) {
  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsText(file, 'iso-8859-1');
  });
  const rows = htmlToRows(text, file.name, shouldDeduplicate);
  return {
    filePath: file.name,
    type: 'html-xls',
    rows,
    info: parseVendedorCorretora(rows[0]?.[0], file.name)
  };
}

async function readInput(file, shouldDeduplicate = false) {
  const isExcel = file.name.toLowerCase().endsWith('.xlsx');
  return isExcel ? readXlsxInput(file) : readHtmlInput(file, shouldDeduplicate);
}

async function analyzeFile(file) {
  const isExcel = file.name.toLowerCase().endsWith('.xlsx');
  let brokerName = 'Corretora não identificada';
  try {
    const item = await readInput(file, false);
    if (item && item.info) {
      brokerName = item.info.corretora || brokerName;
    }
  } catch (err) {
    console.error('Erro ao ler corretora no analyzeFile:', err);
  }

  if (isExcel) {
    return { filePath: file.name, fileName: file.name, brokerName, hasDuplicates: false, duplicateCompanies: [] };
  }

  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsText(file, 'iso-8859-1');
  });
  const clean = text.replace(/\r?\n/g, ' ');

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
    filePath: file.name,
    fileName: file.name,
    brokerName,
    hasDuplicates: duplicateCompanies.size > 0,
    duplicateCompanies: Array.from(duplicateCompanies)
  };
}

async function readDuplicateRecords(file) {
  const isExcel = file.name.toLowerCase().endsWith('.xlsx');
  
  if (!isExcel) {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(e);
      reader.readAsText(file, 'iso-8859-1');
    });
    return extractHtmlCommissionRecords(text, file.name);
  }
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.flatMap(sheet => recordsFromRows(getRowsFromXlsxSheet(sheet), {
    filePath: file.name,
    table: sheet.name
  }));
}

export {
  extractHtmlTitle,
  htmlToRows,
  readInput,
  readDuplicateRecords,
  getLastUsedRow,
  getLastUsedCol,
  getRowsFromXlsxSheet,
  analyzeFile
};
