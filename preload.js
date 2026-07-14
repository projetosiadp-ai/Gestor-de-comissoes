const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectReadyFiles: () => ipcRenderer.invoke('select-ready-files'),
  selectGeneralFiles: () => ipcRenderer.invoke('select-general-files'),
  selectSummaryFiles: () => ipcRenderer.invoke('select-summary-files'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  generateReports: (payload) => ipcRenderer.invoke('generate-reports', payload),
  importReadyReports: (payload) => ipcRenderer.invoke('import-ready-reports', payload),
  generateSummaryPdf: (payload) => ipcRenderer.invoke('generate-summary-pdf', payload),
  parseGeneralInputs: (payload) => ipcRenderer.invoke('parse-general-inputs', payload),
  generateGeneralReport: (payload) => ipcRenderer.invoke('generate-general-report', payload),
  listSavedReports: () => ipcRenderer.invoke('list-saved-reports'),
  deleteSavedReport: (id) => ipcRenderer.invoke('delete-saved-report', id),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  getDroppedFilePaths: (files) => Array.from(files || []).map(file => webUtils.getPathForFile(file)).filter(Boolean),
  onProgress: (callback) => {
    ipcRenderer.removeAllListeners('progress-update');
    ipcRenderer.on('progress-update', (_, data) => callback(data));
  },
  onSummaryProgress: (callback) => {
    ipcRenderer.removeAllListeners('summary-progress-update');
    ipcRenderer.on('summary-progress-update', (_, data) => callback(data));
  }
});
