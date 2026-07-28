import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { defaultCommissionRules, isValidCommissionRules } from '../lib/core/commission-rules.mjs';

const CONFIG_DOC_ID = 'commission_rules';

export async function getCommissionRules() {
  if (!db) return defaultCommissionRules();

  try {
    const snapshot = await getDoc(doc(db, 'system_config', CONFIG_DOC_ID));
    if (!snapshot.exists()) return defaultCommissionRules();

    const stored = snapshot.data().rules;
    if (!isValidCommissionRules(stored)) {
      console.warn('Regras de comissão salvas em formato inesperado; usando o padrão.');
      return defaultCommissionRules();
    }
    return {
      default: stored.default || defaultCommissionRules().default,
      brokers: stored.brokers || {}
    };
  } catch (error) {
    console.error('Erro ao buscar regras de comissão:', error);
    return defaultCommissionRules();
  }
}

export async function saveCommissionRules(rules) {
  if (!db) throw new Error('Firebase ainda não foi configurado.');
  if (!isValidCommissionRules(rules)) throw new Error('Formato de regras de comissão inválido.');

  await setDoc(doc(db, 'system_config', CONFIG_DOC_ID), { rules }, { merge: false });
}
