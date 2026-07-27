const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/core/commission-rules.mjs'));
  return import(moduleUrl.href);
}

const HEADER = ['Código', 'Responsável', 'Usuário', 'Contrato', 'CPF', 'Empresa', 'Plano',
  'Parcela', 'Vencimento', 'Pagamento', 'Regra', 'Recebido', 'Comissão', 'Mensalidade', 'Data de Adesão'];

function rowWith(parcela, regra, responsavel = 'FULANO DE TAL') {
  return ['5427074', responsavel, responsavel, '5427074', '040.423.934-03', 'EMPRESA X',
    'SENIOR PLUS', String(parcela), '10/06/2026', '10/06/2026', regra, '10,90', '4,36', '1952970', '21/05/2026'];
}

test('parseRulePercent understands the formats the Regra column arrives in', async () => {
  const { parseRulePercent } = await loadModule();
  assert.equal(parseRulePercent('40%'), 40);
  assert.equal(parseRulePercent('100%'), 100);
  assert.equal(parseRulePercent(0.4), 40);
  assert.equal(parseRulePercent(40), 40);
  assert.equal(parseRulePercent(1), 100);
  assert.equal(parseRulePercent('5%'), 5);
  assert.equal(parseRulePercent('2,5%'), 2.5);
  assert.equal(parseRulePercent(''), null);
  assert.equal(parseRulePercent(null), null);
  assert.equal(parseRulePercent('n/a'), null);
});

test('expectedPercentFor prefers the broker rule over the global default', async () => {
  const { expectedPercentFor } = await loadModule();
  const rules = { default: { '1': 100 }, brokers: { TJK: { '1': 50, '2': 40 } } };
  assert.equal(expectedPercentFor(rules, 'TJK', 1), 50);
  assert.equal(expectedPercentFor(rules, 'TJK', 2), 40);
  assert.equal(expectedPercentFor(rules, 'OUTRA', 1), 100);
  assert.equal(expectedPercentFor(rules, 'OUTRA', 2), null);
});

test('flags the real-world case: parcela 1 arriving at 40% when the rule says 100%', async () => {
  const { findCommissionRuleDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[
    ['MARANATHA COMERCIAL REP LTDA'],
    ['Período: 01/06/2026 até 30/06/2026'],
    [],
    HEADER,
    rowWith(1, '40%', 'FRANCISCO PEREIRA DE SOUSA'),
    rowWith(1, '40%', 'MARIA DE LOURDES BOLONHA SANTOS')
  ]];

  const found = findCommissionRuleDivergences(rawBlocks, 'MARANATHA', defaultCommissionRules());
  assert.equal(found.length, 2);
  assert.equal(found[0].parcela, 1);
  assert.equal(found[0].esperado, 100);
  assert.equal(found[0].encontrado, 40);
  assert.equal(found[0].responsavel, 'FRANCISCO PEREIRA DE SOUSA');
});

test('does not flag rows that match the rule, nor parcelas without any rule', async () => {
  const { findCommissionRuleDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[
    HEADER,
    rowWith(1, '100%'),
    rowWith(2, '40%'),
    rowWith(7, '10%')
  ]];
  assert.deepEqual(findCommissionRuleDivergences(rawBlocks, 'TJK', defaultCommissionRules()), []);
});

test('reads the numeric 0.4 form produced after the generator converts the column', async () => {
  const { findCommissionRuleDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[HEADER, rowWith(1, 0.4)]];
  const found = findCommissionRuleDivergences(rawBlocks, 'TJK', defaultCommissionRules());
  assert.equal(found.length, 1);
  assert.equal(found[0].encontrado, 40);
});

test('ignores the total row and any row without a numeric parcela', async () => {
  const { findCommissionRuleDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[
    HEADER,
    rowWith(1, '40%'),
    ['Total de Comissões a pagar: 35,00'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
  ]];
  assert.equal(findCommissionRuleDivergences(rawBlocks, 'TJK', defaultCommissionRules()).length, 1);
});

test('handles several blocks in one broker file, each with its own header', async () => {
  const { findCommissionRuleDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [
    [HEADER, rowWith(1, '40%')],
    [HEADER, rowWith(1, '100%'), rowWith(1, '50%')]
  ];
  const found = findCommissionRuleDivergences(rawBlocks, 'TJK', defaultCommissionRules());
  assert.equal(found.length, 2);
  assert.deepEqual(found.map(f => f.encontrado), [40, 50]);
});

test('summarizeDivergences groups repeated rows and counts occurrences', async () => {
  const { findCommissionRuleDivergences, summarizeDivergences, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[HEADER, rowWith(1, '40%', 'A'), rowWith(1, '40%', 'B'), rowWith(1, '50%', 'C')]];
  const summary = summarizeDivergences(findCommissionRuleDivergences(rawBlocks, 'TJK', defaultCommissionRules()));

  assert.equal(summary.length, 2);
  const at40 = summary.find(s => s.encontrado === 40);
  assert.equal(at40.ocorrencias, 2);
  assert.equal(at40.exemplo, 'A');
  assert.equal(summary.find(s => s.encontrado === 50).ocorrencias, 1);
});

test('applyCommissionRuleCorrections recalculates Comissao as Recebido x expected percent', async () => {
  const { applyCommissionRuleCorrections, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[
    ['MARANATHA COMERCIAL REP LTDA'],
    ['Total de Comissões a pagar: 8,72'],
    HEADER,
    rowWith(1, '40%', 'FRANCISCO'),
    rowWith(1, '40%', 'MARIA')
  ]];

  const { blocks, corrections } = applyCommissionRuleCorrections(rawBlocks, 'MARANATHA', defaultCommissionRules());

  assert.equal(corrections.length, 2);
  assert.equal(corrections[0].comissaoAnterior, 4.36);
  // Recebido 10,90 a 100% => 10,90
  assert.equal(corrections[0].comissaoNova, 10.9);

  const [linha1, linha2] = [blocks[0][3], blocks[0][4]];
  assert.equal(linha1[12], '10,90', 'coluna Comissão reescrita no formato original (texto BR)');
  assert.equal(linha1[10], '100%', 'coluna Regra passa a mostrar o percentual correto');
  assert.equal(linha2[12], '10,90');
});

test('applyCommissionRuleCorrections rewrites the block total to the sum of the corrected column', async () => {
  const { applyCommissionRuleCorrections, defaultCommissionRules } = await loadModule();
  const rawBlocks = [[
    ['Total de Comissões a pagar: 8,72'],
    HEADER,
    rowWith(1, '40%'),
    rowWith(1, '40%')
  ]];

  const { blocks } = applyCommissionRuleCorrections(rawBlocks, 'X', defaultCommissionRules());
  assert.equal(blocks[0][0][0], 'Total de Comissões a pagar: 21,80');
});

test('applyCommissionRuleCorrections preserves numeric cells as numbers', async () => {
  const { applyCommissionRuleCorrections, defaultCommissionRules } = await loadModule();
  const row = rowWith(1, 0.4);
  row[11] = 10.9;   // Recebido numérico
  row[12] = 4.36;   // Comissão numérica
  const { blocks, corrections } = applyCommissionRuleCorrections([[HEADER, row]], 'X', defaultCommissionRules());

  assert.equal(corrections.length, 1);
  assert.equal(typeof blocks[0][1][12], 'number');
  assert.equal(blocks[0][1][12], 10.9);
  assert.equal(blocks[0][1][10], 1, 'Regra numérica volta como fração (100% => 1)');
});

test('applyCommissionRuleCorrections leaves compliant rows and the source blocks untouched', async () => {
  const { applyCommissionRuleCorrections, defaultCommissionRules } = await loadModule();
  const original = [[HEADER, rowWith(1, '100%'), rowWith(3, '10%')]];
  const snapshot = JSON.stringify(original);

  const { blocks, corrections } = applyCommissionRuleCorrections(original, 'X', defaultCommissionRules());
  assert.equal(corrections.length, 0);
  assert.equal(JSON.stringify(original), snapshot, 'não altera o array recebido');
  assert.equal(blocks[0][1][12], '4,36');
});

test('applyCommissionRuleCorrections rounds to two decimals', async () => {
  const { applyCommissionRuleCorrections } = await loadModule();
  const row = rowWith(1, '40%');
  row[11] = '102,90';
  const rules = { default: { '1': 5 }, brokers: {} };
  const { corrections } = applyCommissionRuleCorrections([[HEADER, row]], 'X', rules);
  // 102,90 x 5% = 5,145 -> 5,15
  assert.equal(corrections[0].comissaoNova, 5.15);
});

test('isValidCommissionRules accepts the supported shape and rejects malformed input', async () => {
  const { isValidCommissionRules, defaultCommissionRules } = await loadModule();
  assert.equal(isValidCommissionRules(defaultCommissionRules()), true);
  assert.equal(isValidCommissionRules({ default: {}, brokers: {} }), true);
  assert.equal(isValidCommissionRules({ default: { '1': 100 }, brokers: { TJK: { '2': 40 } } }), true);

  assert.equal(isValidCommissionRules(null), false);
  assert.equal(isValidCommissionRules({ outroCampo: 1 }), false);
  assert.equal(isValidCommissionRules({ default: { '0': 100 } }), false, 'parcela 0 é inválida');
  assert.equal(isValidCommissionRules({ default: { '1': 120 } }), false, 'acima de 100% é inválido');
  assert.equal(isValidCommissionRules({ default: { '1': -1 } }), false);
  assert.equal(isValidCommissionRules({ default: { '1': '100' } }), false, 'percentual deve ser número');
  assert.equal(isValidCommissionRules({ default: { 'abc': 100 } }), false);
  assert.equal(isValidCommissionRules({ brokers: { '': { '1': 100 } } }), false);
});
