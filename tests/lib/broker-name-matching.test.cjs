const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/core/text.js'));
  return import(moduleUrl.href);
}

test('brokerNameCore reduces short name and full legal name to the same core', async () => {
  const { brokerNameCore } = await loadModule();
  assert.equal(brokerNameCore('TJK'), brokerNameCore('TJK Corretora de Seguros Ltda'));
  assert.equal(brokerNameCore('GEBARA'), brokerNameCore('GEBARA Corretora de Seguros LTDA'));
  assert.equal(brokerNameCore('VALORIZE'), brokerNameCore('VALORIZE Corretora'));
});

test('brokerNameCore does not collapse genuinely different brokers that share a prefix', async () => {
  const { brokerNameCore } = await loadModule();
  const health = brokerNameCore('HEALTH CORRETORA');
  const healthCorp = brokerNameCore('HEALTH CORP SOLUCOES EM SEGUROS E REP. COM. BRASIL');
  const health2b = brokerNameCore('HEALTH2B SAUDE CORPORATIVA CORRETORA DE SEGUROS LTDA');
  assert.notEqual(health, healthCorp);
  assert.notEqual(health, health2b);
  assert.notEqual(healthCorp, health2b);
});

test('brokerNameCore does not merge two names that only share a first word', async () => {
  const { brokerNameCore } = await loadModule();
  const a = brokerNameCore('THEO CORRETORA');
  const b = brokerNameCore('THEO GESTAO DE BENEFICIOS CORRETORA DE SEGUROS LTDA');
  assert.notEqual(a, b);
});

test('parseVendedorCorretora extracts corretora from "vendedor - corretora" title', async () => {
  const { parseVendedorCorretora } = await loadModule();
  const result = parseVendedorCorretora('ANA CARLA RIBEIRO - TJK');
  assert.equal(result.corretora, 'TJK');
  assert.equal(result.vendedor, 'ANA CARLA RIBEIRO');
  assert.equal(result.isPrincipalCorretora, false);
});

test('parseVendedorCorretora treats a bare company title as the broker itself', async () => {
  const { parseVendedorCorretora } = await loadModule();
  const result = parseVendedorCorretora('TJK CORRETORA DE SEGUROS LTDA');
  assert.equal(result.corretora, 'TJK CORRETORA DE SEGUROS LTDA');
  assert.equal(result.isPrincipalCorretora, true);
});

test('areLikelySameBroker flags an unlisted short name vs. its longer legal name', async () => {
  const { areLikelySameBroker } = await loadModule();
  assert.equal(areLikelySameBroker('THEO CORRETORA', 'THEO GESTAO DE BENEFICIOS CORRETORA DE SEGUROS LTDA'), true);
});

test('areLikelySameBroker does not flag brokers that only share a prefix without a word boundary', async () => {
  const { areLikelySameBroker } = await loadModule();
  assert.equal(areLikelySameBroker('HEALTH CORRETORA', 'HEALTH2B SAUDE CORPORATIVA CORRETORA DE SEGUROS LTDA'), false);
});

test('areLikelySameBroker returns false for names already unified to the same core', async () => {
  const { areLikelySameBroker } = await loadModule();
  assert.equal(areLikelySameBroker('TJK', 'TJK CORRETORA DE SEGUROS LTDA'), false);
});

test('areLikelySameBroker returns false for two unrelated broker names', async () => {
  const { areLikelySameBroker } = await loadModule();
  assert.equal(areLikelySameBroker('MJC', 'W3G CORRETORA'), false);
});
