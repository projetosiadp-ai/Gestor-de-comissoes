const fs = require('fs');
const path = require('path');

function assertLocalPath(value, options = {}) {
  const {
    mustExist = true,
    extensions = [],
    label = 'caminho'
  } = options;

  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || !path.isAbsolute(value)) {
    throw new Error(`Informe um caminho local válido para ${label}.`);
  }

  const normalized = path.normalize(value);
  if (mustExist && !fs.existsSync(normalized)) {
    throw new Error(`O caminho local informado para ${label} não existe.`);
  }

  if (extensions.length) {
    const extension = path.extname(normalized).toLowerCase();
    if (!extensions.includes(extension)) {
      throw new Error(`O arquivo informado para ${label} possui uma extensão não permitida.`);
    }
  }

  return normalized;
}

function assertInputFiles(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Selecione ao menos um arquivo para continuar.');
  }
  if (files.length > (options.maxFiles || 500)) {
    throw new Error('A quantidade de arquivos selecionados excede o limite permitido.');
  }

  return files.map(filePath => assertLocalPath(filePath, {
    label: 'o arquivo de entrada',
    extensions: options.extensions || ['.xls', '.xlsx', '.html', '.htm']
  }));
}

module.exports = { assertLocalPath, assertInputFiles };
