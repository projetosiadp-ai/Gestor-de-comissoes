function registerDuplicatesIpc({
  ipcMain, assertInputFiles, fingerprintFiles, readDuplicateRecords,
  analyzeDuplicateRecords, readSavedReports, path
}) {
  ipcMain.handle('analyze-duplicates', async (_, { files } = {}) => {
    const safeFiles = assertInputFiles(files);
    const fingerprints = await fingerprintFiles(safeFiles);
    const records = [];
    const errors = [];
    for (const filePath of safeFiles) {
      try {
        records.push(...await readDuplicateRecords(filePath));
      } catch (error) {
        errors.push({ fileName: path.basename(String(filePath || '')), message: error.message });
      }
    }

    const previousProcesses = readSavedReports()
      .filter(item => item.batchFingerprint === fingerprints.batchFingerprint)
      .map(item => ({
        id: item.id, label: item.label, createdAt: item.createdAt,
        version: item.version || 1, outputRoot: item.outputRoot
      }));
    const analysis = analyzeDuplicateRecords(records);
    return {
      ...analysis,
      errors,
      batchFingerprint: fingerprints.batchFingerprint,
      previousProcesses,
      requiresConfirmation: analysis.requiresConfirmation || previousProcesses.length > 0
    };
  });
}

module.exports = { registerDuplicatesIpc };
