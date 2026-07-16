const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fingerprintFiles(files) {
  const fileFingerprints = [];
  for (const filePath of files) fileFingerprints.push(await hashFile(filePath));
  const stableBatch = [...fileFingerprints].sort().join('|');
  const batchFingerprint = crypto.createHash('sha256').update(stableBatch).digest('hex');
  return { batchFingerprint, fileFingerprints };
}

function resolveVersionedFolder(basePath) {
  if (!fs.existsSync(basePath)) return { outputPath: basePath, version: 1 };
  let version = 2;
  while (fs.existsSync(`${basePath}_v${version}`)) version += 1;
  return { outputPath: `${basePath}_v${version}`, version };
}

function resolveVersionedFile(basePath) {
  if (!fs.existsSync(basePath)) return { outputPath: basePath, version: 1 };
  const extension = path.extname(basePath);
  const name = basePath.slice(0, -extension.length);
  let version = 2;
  while (fs.existsSync(`${name}_v${version}${extension}`)) version += 1;
  return { outputPath: `${name}_v${version}${extension}`, version };
}

function reserveVersionedFolder(basePath) {
  let version = 1;
  while (true) {
    const outputPath = version === 1 ? basePath : `${basePath}_v${version}`;
    try {
      fs.mkdirSync(outputPath);
      return { outputPath, version };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      version += 1;
    }
  }
}

async function writeFileAtomically(destination, writer) {
  const temporaryPath = `${destination}.${crypto.randomUUID()}.partial`;
  try {
    await writer(temporaryPath);
    await fs.promises.copyFile(temporaryPath, destination, fs.constants.COPYFILE_EXCL);
    await fs.promises.rm(temporaryPath, { force: true });
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  fingerprintFiles,
  resolveVersionedFolder,
  resolveVersionedFile,
  reserveVersionedFolder,
  writeFileAtomically
};
