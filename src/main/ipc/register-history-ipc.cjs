function registerHistoryIpc({
  ipcMain, readSavedReports, writeSavedReports,
  activeReports, trashedReports, trashReport, restoreReport
}) {
  ipcMain.handle('list-saved-reports', async () =>
    activeReports(readSavedReports()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );
  ipcMain.handle('delete-saved-report', async (_, id) => {
    writeSavedReports(trashReport(readSavedReports(), String(id || '')));
    return true;
  });
  ipcMain.handle('list-trashed-reports', async () =>
    trashedReports(readSavedReports()).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
  );
  ipcMain.handle('restore-saved-report', async (_, id) => {
    writeSavedReports(restoreReport(readSavedReports(), String(id || '')));
    return true;
  });
}

module.exports = { registerHistoryIpc };
