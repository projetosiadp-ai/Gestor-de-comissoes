const CHANNELS = Object.freeze({
  generateSummaryPdf: 'generate-summary-pdf',
  generateReports: 'generate-reports',
  importReadyReports: 'import-ready-reports',
  parseGeneralInputs: 'parse-general-inputs',
  generateGeneralReport: 'generate-general-report',
  getCorretorasConfig: 'get-corretoras-config',
  saveCorretorasConfig: 'save-corretoras-config'
});

function registerReportIpc({ ipcMain, handlers }) {
  for (const [handlerName, channel] of Object.entries(CHANNELS)) {
    const handler = handlers[handlerName];
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler ausente para o canal ${channel}.`);
    }
    ipcMain.handle(channel, handler);
  }
}

module.exports = { CHANNELS, registerReportIpc };
