const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/corretoras-config-validator.mjs'));
  return import(moduleUrl.href);
}

test('accepts a well-formed broker alias map', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': ['AS PRIME', 'ASSURE'] }), true);
});

test('accepts an empty map', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({}), true);
});

test('rejects a non-object payload', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig('not-an-object'), false);
  assert.equal(isValidCorretorasConfig(null), false);
  assert.equal(isValidCorretorasConfig(['a', 'b']), false);
});

test('rejects aliases that are not strings', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': [123, 'ASSURE'] }), false);
});

test('rejects an alias list that is not an array', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': 'ASSURE' }), false);
});

test('rejects a config with more than 500 broker entries', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  const config = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`B${i}`, [`B${i}`]]));
  assert.equal(isValidCorretorasConfig(config), false);
});

test('accepts a config with exactly 500 broker entries', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  const config = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`B${i}`, [`B${i}`]]));
  assert.equal(isValidCorretorasConfig(config), true);
});

test('rejects a broker with more than 100 aliases', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  const aliases = Array.from({ length: 101 }, (_, i) => `ALIAS${i}`);
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': aliases }), false);
});

test('rejects a broker name longer than 200 characters', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  const longName = 'A'.repeat(201);
  assert.equal(isValidCorretorasConfig({ [longName]: ['ASSURE'] }), false);
});
