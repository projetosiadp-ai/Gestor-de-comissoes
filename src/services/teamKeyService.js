import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { generateTeamKeyBase64 } from '../lib/crypto/teamCipher.mjs';

const CONFIG_DOC_ID = 'team_key';
let cachedKey = null;

export async function getTeamKey() {
  if (cachedKey) return cachedKey;
  if (!db) return null;
  const snapshot = await getDoc(doc(db, 'system_config', CONFIG_DOC_ID));
  cachedKey = snapshot.exists() ? (snapshot.data().key || null) : null;
  return cachedKey;
}

export async function hasTeamKey() {
  return Boolean(await getTeamKey());
}

export async function generateTeamKey(actor) {
  if (!db) throw new Error('Firebase ainda não foi configurado.');
  if (!actor?.uid) throw new Error('Usuário autenticado obrigatório.');
  const key = await generateTeamKeyBase64();
  await setDoc(doc(db, 'system_config', CONFIG_DOC_ID), {
    key,
    createdAt: new Date().toISOString(),
    createdByUid: actor.uid
  });
  cachedKey = key;
  return key;
}
