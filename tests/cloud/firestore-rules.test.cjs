const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Firestore rules require approved roles and an explicit safe report field list', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  assert.match(rules, /function isApproved\(\)/);
  assert.match(rules, /function isAdmin\(\)/);
  assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /allow read, write: if false/);
  assert.doesNotMatch(rules, /\b(cpf|cliente|contrato|responsavel)\b/i);
});
