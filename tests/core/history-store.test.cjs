const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activeReports,
  trashReport,
  restoreReport,
  purgeExpiredReports
} = require('../../src/main/core/history-store.cjs');

const report = { id: 'report-1', createdAt: '2026-07-01T10:00:00.000Z' };

test('moves a report to trash without losing its metadata and restores it', () => {
  const trashed = trashReport([report], report.id, 'admin-1', new Date('2026-07-16T12:00:00.000Z'));
  assert.equal(activeReports(trashed).length, 0);
  assert.equal(trashed[0].deletedAt, '2026-07-16T12:00:00.000Z');
  assert.equal(trashed[0].deletedByUid, 'admin-1');

  const restored = restoreReport(trashed, report.id);
  assert.equal(activeReports(restored).length, 1);
  assert.equal(restored[0].deletedAt, null);
});

test('keeps recent trash and purges only items older than 30 days', () => {
  const reports = [
    { id: 'old', deletedAt: '2026-06-01T00:00:00.000Z' },
    { id: 'recent', deletedAt: '2026-07-10T00:00:00.000Z' },
    { id: 'active', deletedAt: null }
  ];
  const result = purgeExpiredReports(reports, new Date('2026-07-16T00:00:00.000Z'));
  assert.deepEqual(result.map(item => item.id), ['recent', 'active']);
});
