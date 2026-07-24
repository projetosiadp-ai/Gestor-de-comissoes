import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import defaultCorretoras from '../../corretoras.json';
import { isValidCorretorasConfig } from './corretoras-config-validator.mjs';

const CONFIG_DOC_ID = 'corretoras_config';

export async function getCorretorasConfig() {
  let loaded = null;
  if (db) {
    try {
      const docRef = doc(db, 'system_config', CONFIG_DOC_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && Object.keys(docSnap.data().config || {}).length > 0) {
        loaded = docSnap.data().config;
      }
    } catch (error) {
      console.error('Erro ao buscar configuração de corretoras:', error);
    }
  }

  const merged = { ...defaultCorretoras };
  if (loaded) {
    for (const [key, aliases] of Object.entries(loaded)) {
      const defaultAliases = merged[key] || [];
      const combined = Array.from(new Set([...defaultAliases, ...(Array.isArray(aliases) ? aliases : [])]));
      merged[key] = combined;
    }
  }

  return merged;
}

export async function saveCorretorasConfig(config) {
  if (!db) {
    console.warn('Firebase DB não inicializado. Não foi possível salvar.');
    return;
  }

  if (!isValidCorretorasConfig(config)) {
    throw new Error('Formato de configuração de corretoras inválido.');
  }

  try {
    const docRef = doc(db, 'system_config', CONFIG_DOC_ID);
    await setDoc(docRef, { config }, { merge: true });
  } catch (error) {
    console.error('Erro ao salvar configuração de corretoras:', error);
    throw error;
  }
}
