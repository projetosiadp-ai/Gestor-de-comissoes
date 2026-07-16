const Module = require('node:module');
const path = require('node:path');

function loadCurrentMain({ userDataPath, autoReady = false } = {}) {
  const handlers = new Map();
  const windows = [];
  const originalLoad = Module._load;
  class BrowserWindowMock {
    static getAllWindows() { return windows; }
    constructor(options) {
      this.options = options;
      this.loaded = null;
      this.windowOpenHandler = null;
      this.webContentsListeners = new Map();
      this.webContents = {
        openDevTools() {},
        setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler; },
        on: (event, handler) => { this.webContentsListeners.set(event, handler); }
      };
      windows.push(this);
    }
    loadURL(url) { this.loaded = { type: 'url', value: url }; }
    loadFile(filePath) { this.loaded = { type: 'file', value: filePath }; }
  }
  const electronMock = {
    app: {
      whenReady: () => ({ then(callback) { if (autoReady) callback(); } }),
      on() {},
      quit() {},
      getPath(name) {
        if (name !== 'userData') throw new Error(`Unexpected app path in test: ${name}`);
        return userDataPath;
      }
    },
    BrowserWindow: BrowserWindowMock,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '' }
  };

  Module._load = function loadWithElectronMock(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  const mainPath = path.resolve(__dirname, '../../main.js');
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
  return { handlers, windows };
}

module.exports = { loadCurrentMain };
