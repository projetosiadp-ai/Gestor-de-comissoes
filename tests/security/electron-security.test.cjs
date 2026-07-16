const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const { loadCurrentMain } = require('../helpers/electron-main-harness.cjs');

test('creates a sandboxed isolated renderer and blocks new windows', () => {
  const { windows } = loadCurrentMain({
    userDataPath: path.join(os.tmpdir(), 'commission-security-test'),
    autoReady: true
  });

  assert.equal(windows.length, 1);
  const window = windows[0];
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.deepEqual(window.windowOpenHandler(), { action: 'deny' });
});

test('rejects invalid paths received through IPC', async () => {
  const { handlers } = loadCurrentMain({
    userDataPath: path.join(os.tmpdir(), 'commission-security-test')
  });

  await assert.rejects(
    handlers.get('open-path')({}, 'https://example.com'),
    /caminho local válido/i
  );
  await assert.rejects(
    handlers.get('analyze-duplicates')({}, { files: ['relative.xls'] }),
    /caminho local válido/i
  );
});
