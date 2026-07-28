const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ExcelJS = require('exceljs');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/reports/workbook-format.js'));
  return import(moduleUrl.href);
}

function buildBlockRows() {
  return [
    ['TJK CORRETORA DE SEGUROS LTDA'],
    ['Período: 01/06/2026 até 30/06/2026'],
    ['Lote: 24691 - Aberto'],
    [],
    ['Total de Comissões a pagar: 228,84'],
    [],
    [],
    ['Comissao_normal'],
    ['Código', 'Responsável', 'CPF', 'Comissão'],
    ['5424764', 'PALOMA APARECIDA', '532.923.218-08', 8.76]
  ];
}

test('applyStandardBlockStyle does not draw a border around the blank/info rows', async () => {
  const { copyBlock } = await loadModule();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comissões Gerais');
  copyBlock({ type: 'raw', rows: buildBlockRows() }, ws, 1, false);

  for (let r = 1; r <= 8; r++) {
    const row = ws.getRow(r);
    assert.deepEqual(row.getCell(1).border || {}, {}, `linha ${r} não deveria ter borda`);
    assert.deepEqual(row.getCell(4).border || {}, {}, `linha ${r} não deveria ter borda`);
  }
});

test('applyStandardBlockStyle erases the internal "Comissao_*" marker row', async () => {
  const { copyBlock } = await loadModule();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comissões Gerais');
  copyBlock({ type: 'raw', rows: buildBlockRows() }, ws, 1, false);

  const markerRow = ws.getRow(8);
  assert.deepEqual(markerRow.values.filter(Boolean), []);
});

test('applyStandardBlockStyle keeps the header row and data grid borders', async () => {
  const { copyBlock } = await loadModule();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comissões Gerais');
  copyBlock({ type: 'raw', rows: buildBlockRows() }, ws, 1, false);

  // Topo do cabeçalho é a borda externa da tabela (mais grossa); a base do
  // cabeçalho é interna (linha 9 não é a última linha da tabela) e continua fina.
  const headerCell = ws.getRow(9).getCell(1);
  assert.equal(headerCell.border.top.style, 'medium');
  assert.equal(headerCell.border.bottom.style, 'thin');
  assert.equal(headerCell.fill.fgColor.argb, 'FFBFBFBF');

  const dataCell = ws.getRow(10).getCell(1);
  assert.equal(dataCell.border.top.style, 'thin');
  assert.equal(dataCell.border.top.color.argb, 'FFE5E7EB');
});

test('applyTableSectionBorders draws an outer border around the whole table', async () => {
  const { copyBlock } = await loadModule();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comissões Gerais');
  copyBlock({ type: 'raw', rows: buildBlockRows() }, ws, 1, false);

  // Perímetro (linha 9 = topo do cabeçalho, linha 10 = base dos dados,
  // colunas 1 e 4 = laterais) fica com borda grossa.
  assert.equal(ws.getRow(9).getCell(1).border.top.style, 'medium');
  assert.equal(ws.getRow(9).getCell(1).border.left.style, 'medium');
  assert.equal(ws.getRow(9).getCell(4).border.right.style, 'medium');
  assert.equal(ws.getRow(10).getCell(1).border.bottom.style, 'medium');
  assert.equal(ws.getRow(10).getCell(1).border.left.style, 'medium');
});

test('a genuinely blank row inside the info block that is not the internal marker is left alone', async () => {
  const { copyBlock } = await loadModule();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comissões Gerais');
  copyBlock({ type: 'raw', rows: buildBlockRows() }, ws, 1, false);

  assert.deepEqual(ws.getRow(4).values.filter(Boolean), []);
  assert.deepEqual(ws.getRow(6).values.filter(Boolean), []);
});
