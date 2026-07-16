const test = require('node:test');
const assert = require('node:assert/strict');

const { ProcessingJobs } = require('../../src/main/core/processing-jobs.cjs');

test('cancels only the requested active processing job', () => {
  const jobs = new ProcessingJobs();
  jobs.start('job-a');
  jobs.start('job-b');
  assert.equal(jobs.cancel('job-a'), true);
  assert.throws(() => jobs.assertActive('job-a'), /cancelado pelo usuário/i);
  assert.doesNotThrow(() => jobs.assertActive('job-b'));
  jobs.finish('job-a');
  assert.equal(jobs.cancel('job-a'), false);
});

test('rejects duplicate or malformed job identifiers', () => {
  const jobs = new ProcessingJobs();
  assert.throws(() => jobs.start('../invalid'), /identificador/i);
  jobs.start('job-20260716-abc');
  assert.throws(() => jobs.start('job-20260716-abc'), /já está em andamento/i);
});
