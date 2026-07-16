const fs = require('fs');
const path = require('path');

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function activeReports(items) {
  return (items || []).filter(item => !item.deletedAt);
}

function trashedReports(items) {
  return (items || []).filter(item => item.deletedAt);
}

function trashReport(items, id, actorUid = 'local-admin', now = new Date()) {
  return (items || []).map(item => item.id === id
    ? { ...item, deletedAt: now.toISOString(), deletedByUid: actorUid }
    : item);
}

function restoreReport(items, id) {
  return (items || []).map(item => item.id === id
    ? { ...item, deletedAt: null, deletedByUid: null }
    : item);
}

function purgeExpiredReports(items, now = new Date()) {
  const cutoff = now.getTime() - TRASH_RETENTION_MS;
  return (items || []).filter(item => {
    if (!item.deletedAt) return true;
    const deletedTime = new Date(item.deletedAt).getTime();
    return !Number.isFinite(deletedTime) || deletedTime > cutoff;
  });
}

function readHistoryFile(historyPath) {
  try {
    if (!fs.existsSync(historyPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeHistoryFile(historyPath, items) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  const temporaryPath = `${historyPath}.${process.pid}.partial`;
  fs.writeFileSync(temporaryPath, JSON.stringify(items, null, 2), 'utf8');
  try {
    fs.renameSync(temporaryPath, historyPath);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
    fs.copyFileSync(temporaryPath, historyPath);
    fs.rmSync(temporaryPath, { force: true });
  }
}

module.exports = {
  TRASH_RETENTION_MS,
  activeReports,
  trashedReports,
  trashReport,
  restoreReport,
  purgeExpiredReports,
  readHistoryFile,
  writeHistoryFile
};
