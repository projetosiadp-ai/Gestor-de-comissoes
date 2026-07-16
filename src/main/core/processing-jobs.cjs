class ProcessingCanceledError extends Error {
  constructor() {
    super('Processamento cancelado pelo usuário. Você pode ajustar os arquivos e tentar novamente.');
    this.name = 'ProcessingCanceledError';
    this.code = 'PROCESSING_CANCELED';
  }
}

class ProcessingJobs {
  constructor() {
    this.jobs = new Map();
  }

  validateId(jobId) {
    if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) {
      throw new Error('Identificador de processamento inválido.');
    }
  }

  start(jobId) {
    this.validateId(jobId);
    if (this.jobs.has(jobId)) throw new Error('Este processamento já está em andamento.');
    this.jobs.set(jobId, { canceled: false });
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.canceled = true;
    return true;
  }

  assertActive(jobId) {
    const job = this.jobs.get(jobId);
    if (job?.canceled) throw new ProcessingCanceledError();
  }

  finish(jobId) {
    this.jobs.delete(jobId);
  }
}

module.exports = { ProcessingJobs, ProcessingCanceledError };
