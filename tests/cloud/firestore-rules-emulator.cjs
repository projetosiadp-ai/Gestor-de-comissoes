const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let rulesTesting;
let testEnvironment;

function seedUser(uid, data) {
  return testEnvironment.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('users').doc(uid).set(data);
  });
}

function seedDoc(collectionName, docId, data) {
  return testEnvironment.withSecurityRulesDisabled(async context => {
    await context.firestore().collection(collectionName).doc(docId).set(data);
  });
}

const PENDING_UID = 'pending-user';
const OPERATOR_UID = 'operator-user';
const OTHER_OPERATOR_UID = 'other-operator-user';
const ADMIN_UID = 'admin-user';

const VALID_SAVED_REPORT = {
  id: 'saved-1', month: '2026-07', label: 'Julho/2026', createdAt: '2026-07-16T10:00:00.000Z',
  createdByUid: OPERATOR_UID, createdByName: 'Operador', brokers: 1, sellers: 3, totalValue: 100,
  inputFiles: 1, errors: 0, encryptedSellerData: 'aWZ2.Y2lwaGVy', deletedAt: null, deletedByUid: null
};

test.before(async () => {
  rulesTesting = require('@firebase/rules-unit-testing');
  testEnvironment = await rulesTesting.initializeTestEnvironment({
    projectId: 'comissoesdp-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

test.after(async () => {
  if (testEnvironment) await testEnvironment.cleanup();
});

test.beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seedUser(PENDING_UID, { displayName: 'Pendente', email: 'pendente@empresa.com', role: 'operator', status: 'pending', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(OPERATOR_UID, { displayName: 'Operador', email: 'operador@empresa.com', role: 'operator', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(OTHER_OPERATOR_UID, { displayName: 'Outro Operador', email: 'outro@empresa.com', role: 'operator', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(ADMIN_UID, { displayName: 'Admin', email: 'admin@empresa.com', role: 'admin', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
});

test('anonymous cannot read any protected collection', async () => {
  const context = testEnvironment.unauthenticatedContext();
  await rulesTesting.assertFails(context.firestore().collection('reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('audit').get());
  await rulesTesting.assertFails(context.firestore().collection('system_config').doc('corretoras_config').get());
});

test('pending user cannot read reports, saved_reports, audit or system_config', async () => {
  const context = testEnvironment.authenticatedContext(PENDING_UID, { email: 'pendente@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('audit').get());
  await rulesTesting.assertFails(context.firestore().collection('system_config').doc('corretoras_config').get());
});

test('pending user can create their own pending user doc but not approve themselves', async () => {
  const context = testEnvironment.authenticatedContext('new-uid', { email: 'novo@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('users').doc('new-uid').set({
    displayName: 'Novo', email: 'novo@empresa.com', role: 'operator', status: 'pending', createdAt: '2026-07-23T00:00:00.000Z'
  }));
  await rulesTesting.assertFails(context.firestore().collection('users').doc('new-uid').set({
    displayName: 'Novo', email: 'novo@empresa.com', role: 'admin', status: 'approved', createdAt: '2026-07-23T00:00:00.000Z'
  }));
});

test('approved operator can read saved_reports but cannot write outside the safe schema', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('bad-1').set({
    id: 'bad-1', month: '2026-07', vendedoresDetalhes: [{ nome: 'FULANO', total: 999 }]
  }));
});

test('approved operator can create a well-formed saved_report as themselves', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    date: new Date()
  }));
});

test('approved operator cannot create a saved_report claiming another creator', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    createdByUid: OTHER_OPERATOR_UID,
    date: new Date()
  }));
});

test('an operator cannot overwrite a saved_report created by someone else', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OTHER_OPERATOR_UID, { email: 'outro@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    createdByUid: OTHER_OPERATOR_UID,
    totalValue: 999999,
    date: new Date()
  }));
});

test('the creator can update their own saved_report', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    totalValue: 200,
    date: new Date()
  }));
});

test('an admin can overwrite any saved_report and delete it', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  // validSavedReport() requires the new createdByUid to equal the acting uid on every
  // write (create and update), so re-saving as admin re-stamps ownership to the admin
  // (see CLAUDE.md Task 4 Minor finding: "transferência de propriedade no update").
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    createdByUid: ADMIN_UID,
    totalValue: 300,
    date: new Date()
  }));
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').delete());
});

test('an operator cannot delete a saved_report', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').delete());
});

test('only an admin can write system_config, and only in the expected shape', async () => {
  const operatorContext = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(operatorContext.firestore().collection('system_config').doc('corretoras_config').set({ config: {} }));

  const adminContext = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('system_config').doc('corretoras_config').set({ config: { 'ACME': ['ACME'] } }));
  await rulesTesting.assertFails(adminContext.firestore().collection('system_config').doc('corretoras_config').set({ config: 'not-a-map' }));
  await rulesTesting.assertFails(adminContext.firestore().collection('system_config').doc('team_key').set({ key: 'abc', extraField: true, createdAt: '2026-07-23', createdByUid: ADMIN_UID }));
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('system_config').doc('team_key').set({ key: 'abc', createdAt: '2026-07-23', createdByUid: ADMIN_UID }));
});

test('approved users (not just admins) can read system_config once written', async () => {
  await seedDoc('system_config', 'team_key', { key: 'abc', createdAt: '2026-07-23', createdByUid: ADMIN_UID });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('system_config').doc('team_key').get());
});

test('only an admin can read audit, and audit entries cannot include unexpected detail keys', async () => {
  const operatorContext = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(operatorContext.firestore().collection('audit').get());
  await rulesTesting.assertSucceeds(operatorContext.firestore().collection('audit').add({
    action: 'user.approved', targetId: OTHER_OPERATOR_UID, actorUid: OPERATOR_UID,
    actorEmail: 'operador@empresa.com', actorName: 'Operador', createdAt: '2026-07-23T00:00:00.000Z',
    details: { previousRole: 'operator', newRole: 'admin' }
  }));
  await rulesTesting.assertFails(operatorContext.firestore().collection('audit').add({
    action: 'user.approved', targetId: OTHER_OPERATOR_UID, actorUid: OPERATOR_UID,
    actorEmail: 'operador@empresa.com', actorName: 'Operador', createdAt: '2026-07-23T00:00:00.000Z',
    details: { previousRole: 'operator', newRole: 'admin', secretNote: 'nao deveria existir' }
  }));

  const adminContext = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('audit').get());
});

test('an operator cannot self-promote by editing arbitrary user fields', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('users').doc(OPERATOR_UID).update({ role: 'admin', status: 'approved' }));
});
