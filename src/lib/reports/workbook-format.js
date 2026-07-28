import {
  normalizeBaseText, getText, decodeHtml, parseBrazilNumber,
  parseBrazilCurrency, formatNumberBR
} from '../core/text.js';
import { getLastUsedRow, getLastUsedCol } from './input-reader.js';

function copyCell(sourceCell, targetCell) {
  targetCell.value = sourceCell.value;
  if (sourceCell.style) targetCell.style = JSON.parse(JSON.stringify(sourceCell.style));
  if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
  if (sourceCell.alignment) targetCell.alignment = JSON.parse(JSON.stringify(sourceCell.alignment));
  if (sourceCell.font) targetCell.font = JSON.parse(JSON.stringify(sourceCell.font));
  if (sourceCell.fill) targetCell.fill = JSON.parse(JSON.stringify(sourceCell.fill));
  if (sourceCell.border) targetCell.border = JSON.parse(JSON.stringify(sourceCell.border));
}

function normalizeHeaderName(value) {
  return normalizeBaseText(getText(value));
}

function shouldConvertColumn(header) {
  const normalized = normalizeHeaderName(header);
  return normalized === 'PARCELA' || normalized === 'RECEBIDO' || normalized === 'COMISSAO'
    || normalized === 'MENSALIDADE' || normalized === 'REGRA' || normalized === 'VIDAS'
    || normalized.includes('TOTAL') || normalized.includes('VALOR');
}

function getNumberFormatForHeader(header, originalValue) {
  const normalized = normalizeHeaderName(header);
  const raw = String(originalValue || '').trim();
  if (normalized === 'REGRA' || raw.endsWith('%')) return '0%';
  if (normalized === 'PARCELA' || normalized === 'MENSALIDADE' || normalized === 'VIDAS') return '0';
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

// A seção PJ (ver applyTableSectionBorders) introduz um segundo cabeçalho com
// colunas diferentes do cabeçalho principal do bloco; sempre que uma nova linha
// de cabeçalho aparece (começa com "Código"), os nomes de coluna usados pra
// decidir o que converter são atualizados a partir dali.
function isHeaderRow(worksheet, row, lastCol) {
  return normalizeHeaderName(worksheet.getCell(row, 1).value) === 'CODIGO';
}

function convertBlockStringsToNumbers(worksheet, startRow, lastRow, lastCol) {
  const headerRowNumber = startRow + 8;
  let headers = [];
  for (let col = 1; col <= lastCol; col++) headers[col] = worksheet.getCell(headerRowNumber, col).value;
  for (let row = headerRowNumber + 1; row <= lastRow; row++) {
    if (isHeaderRow(worksheet, row, lastCol)) {
      headers = [];
      for (let col = 1; col <= lastCol; col++) headers[col] = worksheet.getCell(row, col).value;
      continue;
    }
    for (let col = 1; col <= lastCol; col++) {
      convertCellToNumberIfNeeded(worksheet.getCell(row, col), headers[col]);
    }
  }
}

// Marcador técnico interno do sistema de origem (ex: "Comissao_normal") que aparece
// solto entre o total e a tabela nos arquivos exportados — nunca foi pensado como
// conteúdo visível, então é apagado ao formatar o bloco.
function isInternalMarkerRow(row) {
  const values = (row.values || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (values.length !== 1) return false;
  return /^Comissao_[A-Za-zÀ-ÿ]+$/.test(String(values[0]).trim());
}

function applyStandardBlockStyle(worksheet, startRow, lastRow, lastCol) {
  const widths = [12, 24, 24, 15, 18, 22, 28, 10, 15, 15, 12, 12, 12, 15, 15];
  for (let col = 1; col <= Math.max(lastCol, widths.length); col++) {
    worksheet.getColumn(col).width = widths[col - 1] || 15;
  }
  worksheet.getRow(startRow).font = { bold: true, size: 12 };
  worksheet.getRow(startRow).height = 24;
  for (let row = startRow; row <= startRow + 7; row++) {
    worksheet.getRow(row).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    const worksheetRow = worksheet.getRow(row);
    if (isInternalMarkerRow(worksheetRow)) {
      worksheetRow.eachCell({ includeEmpty: true }, cell => { cell.value = null; });
    }
  }
  const headerRow = startRow + 8;
  const header = worksheet.getRow(headerRow);
  header.height = 28;
  header.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  for (let row = headerRow + 1; row <= lastRow; row++) {
    const worksheetRow = worksheet.getRow(row);
    worksheetRow.height = 22;
    worksheetRow.alignment = { vertical: 'middle', wrapText: false };
    worksheetRow.eachCell({ includeEmpty: true }, cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    });
  }
}

// A seção "PJ" ao final de um bloco tem seu próprio cabeçalho (Código, Empresa,
// Parcela, Vencimento, Pagamento, Recebido, Regra, Comissão, Vidas, Mensalidade),
// diferente do cabeçalho principal do bloco. applyStandardBlockStyle já estilizou
// essa linha como dado comum (borda cinza-clara); aqui ela vira cabeçalho de
// verdade (negrito, fundo cinza, borda), igual ao cabeçalho principal.
function isPjLabelRow(row) {
  const values = (row.values || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  return values.length === 1 && String(values[0]).trim().toUpperCase() === 'PJ';
}

const THICK_BORDER = { style: 'medium', color: { argb: 'FF000000' } };

// Desenha uma borda mais grossa só no perímetro externo da tabela (topo, base,
// laterais), preservando as bordas finas internas já aplicadas célula a célula.
function applyOuterBorder(worksheet, topRow, bottomRow, leftCol, rightCol) {
  for (let row = topRow; row <= bottomRow; row++) {
    for (let col = leftCol; col <= rightCol; col++) {
      const cell = worksheet.getCell(row, col);
      const border = { ...(cell.border || {}) };
      if (row === topRow) border.top = THICK_BORDER;
      if (row === bottomRow) border.bottom = THICK_BORDER;
      if (col === leftCol) border.left = THICK_BORDER;
      if (col === rightCol) border.right = THICK_BORDER;
      cell.border = border;
    }
  }
}

// Última coluna com valor no cabeçalho de uma tabela (a tabela PJ tem menos
// colunas que a tabela principal do bloco, então a borda externa não deve se
// estender pelas colunas vazias à direita).
function lastHeaderColumn(worksheet, headerRow, maxCol) {
  let last = 1;
  for (let col = 1; col <= maxCol; col++) {
    const value = worksheet.getCell(headerRow, col).value;
    if (value !== null && value !== undefined && String(value).trim() !== '') last = col;
  }
  return last;
}

// Estiliza o cabeçalho próprio da seção PJ (se existir) e desenha a barra
// externa ao redor de cada tabela do bloco: só a principal, ou a principal +
// PJ quando o bloco tiver as duas.
function applyTableSectionBorders(worksheet, startRow, lastRow, lastCol) {
  const mainHeaderRow = startRow + 8;
  let pjLabelRow = null;
  for (let row = mainHeaderRow + 1; row <= lastRow; row++) {
    if (isPjLabelRow(worksheet.getRow(row))) { pjLabelRow = row; break; }
  }

  if (pjLabelRow === null) {
    applyOuterBorder(worksheet, mainHeaderRow, lastRow, 1, lastHeaderColumn(worksheet, mainHeaderRow, lastCol));
    return;
  }

  const mainSectionEnd = Math.max(mainHeaderRow, pjLabelRow - 2);
  applyOuterBorder(worksheet, mainHeaderRow, mainSectionEnd, 1, lastHeaderColumn(worksheet, mainHeaderRow, lastCol));

  worksheet.getRow(pjLabelRow).font = { bold: true, size: 12 };
  const pjHeaderRow = pjLabelRow + 1;
  if (pjHeaderRow > lastRow) return;

  const headerRow = worksheet.getRow(pjHeaderRow);
  headerRow.height = 28;
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  applyOuterBorder(worksheet, pjHeaderRow, lastRow, 1, lastHeaderColumn(worksheet, pjHeaderRow, lastCol));
}

function copyXlsxBlock(sourceSheet, targetSheet, startRow, convertNumbers) {
  const lastRow = getLastUsedRow(sourceSheet);
  const lastCol = getLastUsedCol(sourceSheet);
  for (let col = 1; col <= lastCol; col++) {
    const width = sourceSheet.getColumn(col).width;
    if (width) targetSheet.getColumn(col).width = Math.max(targetSheet.getColumn(col).width || 0, width);
  }
  for (let row = 1; row <= lastRow; row++) {
    const sourceRow = sourceSheet.getRow(row);
    const targetRow = targetSheet.getRow(startRow + row - 1);
    if (sourceRow.height) targetRow.height = sourceRow.height;
    for (let col = 1; col <= lastCol; col++) copyCell(sourceRow.getCell(col), targetRow.getCell(col));
  }
  for (const merge of sourceSheet.model.merges || []) {
    const match = merge.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!match) continue;
    const [, col1, row1, col2, row2] = match;
    try {
      targetSheet.mergeCells(`${col1}${Number(row1) + startRow - 1}:${col2}${Number(row2) + startRow - 1}`);
    } catch (_) {}
  }
  applyStandardBlockStyle(targetSheet, startRow, startRow + lastRow - 1, lastCol);
  applyTableSectionBorders(targetSheet, startRow, startRow + lastRow - 1, lastCol);
  if (convertNumbers) convertBlockStringsToNumbers(targetSheet, startRow, startRow + lastRow - 1, lastCol);
  return startRow + lastRow + 3;
}

function copyHtmlBlock(item, targetSheet, startRow, convertNumbers) {
  const lastCol = Math.max(...item.rows.map(row => row.length), 15);
  item.rows.forEach((row, rowIndex) => {
    const outputRow = targetSheet.getRow(startRow + rowIndex);
    row.forEach((value, colIndex) => { outputRow.getCell(colIndex + 1).value = value; });
  });
  const lastRow = startRow + item.rows.length - 1;
  applyStandardBlockStyle(targetSheet, startRow, lastRow, lastCol);
  applyTableSectionBorders(targetSheet, startRow, lastRow, lastCol);
  if (convertNumbers) convertBlockStringsToNumbers(targetSheet, startRow, lastRow, lastCol);
  return lastRow + 3;
}

function copyBlock(item, targetSheet, startRow, convertNumbers) {
  return item.type === 'xlsx'
    ? copyXlsxBlock(item.sheet, targetSheet, startRow, convertNumbers)
    : copyHtmlBlock(item, targetSheet, startRow, convertNumbers);
}

function consolidateCommissionTotalsInWorksheet(worksheet) {
  const lastRow = getLastUsedRow(worksheet);
  const lastCol = getLastUsedCol(worksheet);
  const totals = [];
  for (let row = 1; row <= lastRow; row++) {
    for (let col = 1; col <= lastCol; col++) {
      const labelCell = worksheet.getCell(row, col);
      const text = decodeHtml(getText(labelCell.value));
      if (!normalizeBaseText(text).includes('TOTAL DE COMISSOES A PAGAR')) continue;
      let value = parseBrazilCurrency(text);
      let valueCell = null;
      if (value === null) {
        for (let nextCol = col + 1; nextCol <= Math.min(lastCol, col + 6); nextCol++) {
          const candidate = worksheet.getCell(row, nextCol);
          const parsed = parseBrazilCurrency(getText(candidate.value));
          if (parsed !== null) { value = parsed; valueCell = candidate; break; }
        }
      }
      if (value !== null) totals.push({ labelCell, valueCell, value });
      break;
    }
  }
  if (!totals.length) return { found: false, total: 0, count: 0 };
  const total = Math.round((totals.reduce((sum, item) => sum + item.value, 0) + Number.EPSILON) * 100) / 100;
  const first = totals[0];
  if (first.valueCell) {
    first.valueCell.value = total;
    first.valueCell.numFmt = '#,##0.00';
  } else {
    first.labelCell.value = `Total de Comissões a pagar: ${formatNumberBR(total)}`;
  }
  for (let index = 1; index < totals.length; index++) {
    totals[index].labelCell.value = null;
    if (totals[index].valueCell) totals[index].valueCell.value = null;
  }
  return { found: true, total, count: totals.length };
}

export {
  copyCell,
  convertCellToNumberIfNeeded,
  convertBlockStringsToNumbers,
  applyStandardBlockStyle,
  copyBlock,
  consolidateCommissionTotalsInWorksheet
};
