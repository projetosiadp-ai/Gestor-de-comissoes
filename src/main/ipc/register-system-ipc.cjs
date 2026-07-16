function registerSystemIpc({ ipcMain, dialog, shell, settings, processingJobs, assertLocalPath }) {
  ipcMain.handle('get-app-settings', async () => settings.get());
  ipcMain.handle('save-app-settings', async (_, value = {}) => settings.save(value));
  ipcMain.handle('cancel-processing', async (_, jobId) => processingJobs.cancel(String(jobId || '')));
  ipcMain.handle('open-path', async (_, targetPath) => {
    const safePath = assertLocalPath(targetPath, { label: 'abrir' });
    const error = await shell.openPath(safePath);
    if (error) throw new Error(error);
    return true;
  });

  const selectors = {
    'select-files': {
      title: 'Selecione as planilhas de comissão', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Planilhas/HTML do sistema', extensions: ['xls', 'xlsx', 'html', 'htm'] }]
    },
    'select-ready-files': {
      title: 'Selecione os relatórios consolidados já prontos (.xlsx)', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Relatórios consolidados', extensions: ['xlsx'] }]
    },
    'select-summary-files': {
      title: 'Selecione as planilhas prontas para gerar o PDF de resumo', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Planilhas de comissão', extensions: ['xls', 'xlsx', 'html', 'htm'] }]
    },
    'select-output-folder': {
      title: 'Selecione onde salvar os relatórios gerados', properties: ['openDirectory']
    },
    'select-general-files': {
      title: 'Selecione as planilhas consolidadas das corretoras (.xlsx)', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Planilhas Excel', extensions: ['xlsx'] }]
    }
  };

  for (const [channel, options] of Object.entries(selectors)) {
    ipcMain.handle(channel, async () => {
      const result = await dialog.showOpenDialog(options);
      if (result.canceled) return channel === 'select-output-folder' ? '' : [];
      return channel === 'select-output-folder' ? result.filePaths[0] : result.filePaths;
    });
  }
}

module.exports = { registerSystemIpc };
