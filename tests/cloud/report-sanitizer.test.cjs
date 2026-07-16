const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('cloud report contains operational metadata but no client or detailed seller data', async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/report-sanitizer.mjs'));
  const { sanitizeReportForCloud } = await import(moduleUrl.href);
  const sanitized = sanitizeReportForCloud({
    id: '2026-07-1', month: '2026-07', label: 'Julho/2026', createdAt: '2026-07-16T10:00:00.000Z',
    sellers: 3, brokers: 1, totalValue: 123.45, inputFiles: 2, outputFiles: 1, errors: 0,
    version: 2, batchFingerprint: 'a'.repeat(64), fileFingerprints: ['b'.repeat(64)],
    outputRoot: '\\\\servidor\\Financeiro\\Relatorios',
    cpf: '111.111.111-11', cliente: 'CLIENTE SENSÍVEL', contrato: '123',
    summary: [{ corretora: 'CORRETORA A', vendedores: 3, totalConsolidado: 123.45,
      vendedoresDetalhes: [{ nome: 'VENDEDOR', total: 123.45 }], arquivo: 'C:\\sensivel.xlsx' }]
  }, { uid: 'user-1', email: 'operador@empresa.com' });

  assert.equal(sanitized.createdByUid, 'user-1');
  assert.equal(sanitized.outputRoot, '\\\\servidor\\Financeiro\\Relatorios');
  assert.equal(sanitized.summary, undefined);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /CLIENTE SENSÍVEL|111\.111|contrato|vendedoresDetalhes|sensivel\.xlsx|summary/i);
});
