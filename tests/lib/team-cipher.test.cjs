const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/crypto/teamCipher.mjs'));
  return import(moduleUrl.href);
}

test('generates a base64 256-bit key', async () => {
  const { generateTeamKeyBase64 } = await loadModule();
  const key = await generateTeamKeyBase64();
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
  const raw = Buffer.from(key, 'base64');
  assert.equal(raw.length, 32);
});

test('encrypts and decrypts round-trip data', async () => {
  const { generateTeamKeyBase64, encryptJson, decryptJson } = await loadModule();
  const key = await generateTeamKeyBase64();
  const original = [{ corretora: 'ACME', vendedoresDetalhes: [{ nome: 'FULANO', total: 123.45 }] }];

  const payload = await encryptJson(key, original);
  assert.equal(typeof payload, 'string');
  assert.doesNotMatch(payload, /FULANO|ACME/);

  const decrypted = await decryptJson(key, payload);
  assert.deepEqual(decrypted, original);
});

test('produces a different ciphertext each time (random IV)', async () => {
  const { generateTeamKeyBase64, encryptJson } = await loadModule();
  const key = await generateTeamKeyBase64();
  const payloadA = await encryptJson(key, { a: 1 });
  const payloadB = await encryptJson(key, { a: 1 });
  assert.notEqual(payloadA, payloadB);
});

test('rejects decryption with the wrong key', async () => {
  const { generateTeamKeyBase64, encryptJson, decryptJson } = await loadModule();
  const keyA = await generateTeamKeyBase64();
  const keyB = await generateTeamKeyBase64();
  const payload = await encryptJson(keyA, { secret: true });
  await assert.rejects(decryptJson(keyB, payload));
});
