import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from './firebaseClient';
import { addAudit } from './cloudReports';

function requireCloud() {
  if (!firebaseConfigured || !db) throw new Error('Firebase ainda não foi configurado.');
}

export function subscribeUsers(onChange, onError) {
  requireCloud();
  return onSnapshot(collection(db, 'users'), snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function updateUserAccess(userId, { role, status }, adminUser) {
  requireCloud();
  if (!['admin', 'operator'].includes(role)) throw new Error('Perfil inválido.');
  if (!['approved', 'pending', 'rejected'].includes(status)) throw new Error('Status inválido.');
  await updateDoc(doc(db, 'users', userId), {
    role,
    status,
    approvedAt: status === 'approved' ? new Date().toISOString() : null,
    approvedByUid: status === 'approved' ? adminUser.uid : null
  });
  await addAudit(`user.${status}`, userId, adminUser);
}
