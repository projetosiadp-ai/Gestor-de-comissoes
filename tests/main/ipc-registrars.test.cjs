const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSystemIpc } = require('../../src/main/ipc/register-system-ipc.cjs');
const { registerHistoryIpc } = require('../../src/main/ipc/register-history-ipc.cjs');
const { registerDuplicatesIpc } = require('../../src/main/ipc/register-duplicates-ipc.cjs');

function ipcRecorder() {
  const handlers = new Map();
  return { handlers, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } };
}

test('system registrar owns settings, dialogs, path opening and cancellation', () => {
  const { handlers, ipcMain } = ipcRecorder();
  registerSystemIpc({
    ipcMain,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '' },
    settings: { get: () => ({}), save: value => value },
    processingJobs: { cancel: () => false },
    assertLocalPath: value => value
  });
  assert.deepEqual([...handlers.keys()].sort(), [
    'cancel-processing', 'get-app-settings', 'open-path', 'save-app-settings',
    'select-files', 'select-general-files', 'select-output-folder', 'select-ready-files', 'select-summary-files'
  ].sort());
});

test('history and duplicate registrars keep their bounded channel sets', () => {
  const history = ipcRecorder();
  registerHistoryIpc({
    ipcMain: history.ipcMain,
    readSavedReports: () => [], writeSavedReports() {},
    activeReports: value => value, trashedReports: value => value,
    trashReport: value => value, restoreReport: value => value
  });
  assert.deepEqual([...history.handlers.keys()].sort(), [
    'delete-saved-report', 'list-saved-reports', 'list-trashed-reports', 'restore-saved-report'
  ].sort());

  const duplicates = ipcRecorder();
  registerDuplicatesIpc({
    ipcMain: duplicates.ipcMain,
    assertInputFiles: value => value,
    fingerprintFiles: async () => ({ batchFingerprint: 'a'.repeat(64) }),
    readDuplicateRecords: async () => [],
    analyzeDuplicateRecords: () => ({ requiresConfirmation: false }),
    readSavedReports: () => [], path: require('node:path')
  });
  assert.deepEqual([...duplicates.handlers.keys()], ['analyze-duplicates']);
});
