const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  fingerprintFiles,
  resolveVersionedFolder,
  resolveVersionedFile,
  reserveVersionedFolder,
  writeFileAtomically
} = require('../../src/main/core/process-safety.cjs');

test('fingerprints file contents independent of names and selection order', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-fingerprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const a = path.join(root, 'a.xls');
  const renamed = path.join(root, 'renamed.xls');
  const b = path.join(root, 'b.xls');
  fs.writeFileSync(a, 'same export');
  fs.writeFileSync(renamed, 'same export');
  fs.writeFileSync(b, 'other export');

  const first = await fingerprintFiles([a, b]);
  const reordered = await fingerprintFiles([b, renamed]);

  assert.equal(first.batchFingerprint, reordered.batchFingerprint);
  assert.equal(first.fileFingerprints[0].length, 64);
  assert.equal(first.fileFingerprints.every(item => !item.includes(root)), true);
});

test('versions a repeated output file name before its extension', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-file-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'Resumo.pdf');
  fs.writeFileSync(base, 'v1');
  fs.writeFileSync(path.join(root, 'Resumo_v2.pdf'), 'v2');
  assert.deepEqual(resolveVersionedFile(base), {
    outputPath: path.join(root, 'Resumo_v3.pdf'),
    version: 3
  });
});

test('creates an identified version instead of overwriting an existing report folder', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'Relatorio_Julho_2026');

  assert.deepEqual(resolveVersionedFolder(base), { outputPath: base, version: 1 });
  fs.mkdirSync(base);
  fs.mkdirSync(`${base}_v2`);
  assert.deepEqual(resolveVersionedFolder(base), { outputPath: `${base}_v3`, version: 3 });
});

test('reserves a version folder immediately to prevent concurrent users from choosing the same path', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-reserve-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'Relatorio_Julho_2026');

  const first = reserveVersionedFolder(base);
  const second = reserveVersionedFolder(base);

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(fs.existsSync(first.outputPath), true);
  assert.equal(fs.existsSync(second.outputPath), true);
});

test('publishes generated files only after the writer finishes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-atomic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'final.xlsx');
  let temporaryPath;

  await writeFileAtomically(destination, async (candidate) => {
    temporaryPath = candidate;
    assert.equal(fs.existsSync(destination), false);
    fs.writeFileSync(candidate, 'complete workbook');
  });

  assert.equal(fs.readFileSync(destination, 'utf8'), 'complete workbook');
  assert.equal(fs.existsSync(temporaryPath), false);
});

test('atomic publication never replaces an existing file', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-no-overwrite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'existing.xlsx');
  fs.writeFileSync(destination, 'original');

  await assert.rejects(writeFileAtomically(destination, async candidate => {
    fs.writeFileSync(candidate, 'replacement');
  }), error => error.code === 'EEXIST');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'original');
});
