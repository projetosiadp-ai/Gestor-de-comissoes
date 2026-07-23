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
