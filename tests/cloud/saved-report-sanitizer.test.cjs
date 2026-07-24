const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('saved report contains only aggregate metadata plus an opaque encrypted blob', async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/report-sanitizer.mjs'));
  const { sanitizeSavedReportForCloud } = await import(moduleUrl.href);

  const sanitized = sanitizeSavedReportForCloud({
    id: '2026-07_123', month: '2026-07', label: 'Julho/2026', createdAt: '2026-07-16T10:00:00.000Z',
    createdByName: 'Operador Teste', brokers: 1, sellers: 3, totalValue: 123.45, inputFiles: 2,
    errors: ['arquivo1.xlsx: erro'],
    summary: [{ corretora: 'CORRETORA A', vendedoresDetalhes: [{ nome: 'VENDEDOR SENSÍVEL', total: 123.45 }] }]
  }, { uid: 'user-1', email: 'operador@empresa.com' }, 'aWZ2.Y2lwaGVy');

  assert.equal(sanitized.createdByUid, 'user-1');
  assert.equal(sanitized.encryptedSellerData, 'aWZ2.Y2lwaGVy');
  assert.equal(sanitized.errors, 1);
  assert.equal(sanitized.summary, undefined);
  assert.equal(sanitized.deletedAt, null);
  assert.equal(sanitized.deletedByUid, null);

  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /VENDEDOR SENSÍVEL|vendedoresDetalhes|summary/i);
});

test('throws without an authenticated user', async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/report-sanitizer.mjs'));
  const { sanitizeSavedReportForCloud } = await import(moduleUrl.href);
  assert.throws(() => sanitizeSavedReportForCloud({ id: 'x' }, {}, 'blob'));
});
