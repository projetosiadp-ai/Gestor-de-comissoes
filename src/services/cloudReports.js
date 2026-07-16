import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db, firebaseConfigured } from './firebaseClient';
import { sanitizeReportForCloud } from './report-sanitizer.mjs';

function requireCloud() {
  if (!firebaseConfigured || !db) throw new Error('Firebase ainda não foi configurado.');
}

export async function syncReport(report, user) {
  requireCloud();
  const safeReport = sanitizeReportForCloud(report, user);
  await setDoc(doc(db, 'reports', safeReport.id), safeReport, { merge: false });
  await addAudit('report.created', safeReport.id, user, {
    month: safeReport.month,
    version: safeReport.version,
    batchFingerprint: safeReport.batchFingerprint
  });
}

export function subscribeReports(onChange, onError) {
  requireCloud();
  return onSnapshot(collection(db, 'reports'), { includeMetadataChanges: true }, snapshot => {
    const reports = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    onChange(reports, {
      fromCache: snapshot.metadata.fromCache,
      hasPendingWrites: snapshot.metadata.hasPendingWrites
    });
  }, onError);
}

export async function trashReport(reportId, user) {
  requireCloud();
  const deletedAt = new Date().toISOString();
  await updateDoc(doc(db, 'reports', reportId), { deletedAt, deletedByUid: user.uid });
  await addAudit('report.trashed', reportId, user, { deletedAt });
}

export async function restoreReport(reportId, user) {
  requireCloud();
  await updateDoc(doc(db, 'reports', reportId), { deletedAt: null, deletedByUid: null });
  await addAudit('report.restored', reportId, user);
}

export async function purgeReport(reportId, user) {
  requireCloud();
  await deleteDoc(doc(db, 'reports', reportId));
  await addAudit('report.purged', reportId, user);
}

export async function addAudit(action, targetId, user, details = {}) {
  requireCloud();
  await addDoc(collection(db, 'audit'), {
    action,
    targetId: String(targetId || '').slice(0, 150),
    actorUid: user.uid,
    actorEmail: String(user.email || '').slice(0, 200),
    createdAt: new Date().toISOString(),
    details
  });
}
