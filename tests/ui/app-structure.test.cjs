const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('application shell is split into focused layout components', () => {
  const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const expected = ['Sidebar.jsx', 'Topbar.jsx'];

  for (const file of expected) {
    assert.equal(fs.existsSync(path.join(root, 'src', 'components', 'layout', file)), true, `${file} deve existir`);
  }

  assert.match(appSource, /<Sidebar\b/);
  assert.match(appSource, /<Topbar\b/);
  assert.doesNotMatch(appSource, /<aside\b/);
  assert.equal(fs.existsSync(path.join(root, 'src', 'components', 'layout', 'LogConsole.jsx')), false, 'LogConsole.jsx foi removido (console de logs descontinuado)');
});
