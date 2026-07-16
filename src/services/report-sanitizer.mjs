function text(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fingerprint(value) {
  const normalized = text(value, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : '';
}

export function sanitizeReportForCloud(report, user) {
  if (!user?.uid) throw new Error('Usuário autenticado obrigatório para sincronizar.');

  return {
    id: text(report.id, 120),
    month: text(report.month, 7),
    label: text(report.label, 80),
    createdAt: text(report.createdAt, 40),
    createdByUid: text(user.uid, 128),
    sellers: number(report.sellers),
    brokers: number(report.brokers),
    totalValue: number(report.totalValue),
    inputFiles: number(report.inputFiles),
    outputFiles: number(report.outputFiles),
    errors: number(report.errors),
    version: Math.max(1, Math.trunc(number(report.version) || 1)),
    batchFingerprint: fingerprint(report.batchFingerprint),
    fileFingerprints: Array.isArray(report.fileFingerprints)
      ? report.fileFingerprints.map(fingerprint).filter(Boolean).slice(0, 500)
      : [],
    outputRoot: text(report.outputRoot, 1000),
    deletedAt: null,
    deletedByUid: null
  };
}
