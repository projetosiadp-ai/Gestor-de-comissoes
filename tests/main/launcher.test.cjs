const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the obvious launcher delegates to the architecture-aware launcher', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(projectRoot, 'ABRIR PROGRAMA.bat'), 'utf8');

  assert.match(source, /Iniciar\.bat/i);
  assert.match(source, /%~dp0/);
});
