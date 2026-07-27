import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import {
  sanitizeSavedReportForCloud,
  sanitizeBrokerDetailForCloud,
  MAX_ENCRYPTED_BROKER_DETAIL_LENGTH
} from './report-sanitizer.mjs';
import { encryptJson, decryptJson } from '../lib/crypto/teamCipher.mjs';
import { normalizeBaseText } from '../lib/core/text.js';
import { getTeamKey } from './teamKeyService';

const LOCAL_STORAGE_KEY = 'dp_saved_reports_v2';

function slugifyBrokerId(name) {
  const slug = normalizeBaseText(name).toLowerCase().replace(/ /g, '-').slice(0, 200);
  return slug || 'corretora';
}

function getLocalReports() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error reading local reports:', err);
    return [];
  }
}

function saveLocalReports(reports) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    console.error('Error writing local reports:', err);
  }
}

export async function getSavedReports() {
  let reports = [];
  if (db) {
    try {
      const q = query(collection(db, 'saved_reports'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const teamKey = await getTeamKey();
      reports = await Promise.all(snapshot.docs.map(async d => {
        const data = d.data();
        const { encryptedSellerData, ...rest } = data;
        const result = {
          id: d.id,
          ...rest,
          date: data.date?.toDate()?.toISOString() || data.createdAt
        };
        if (encryptedSellerData && teamKey) {
          try {
            result.summary = await decryptJson(teamKey, encryptedSellerData);
          } catch (err) {
            console.error('Erro ao decifrar dados de vendedores do relatório', d.id, err);
          }
        }
        return result;
      }));
    } catch (err) {
      console.error('Error fetching reports from Firestore:', err);
    }
  }

  const local = getLocalReports();
  const mergedMap = new Map();
  local.forEach(r => mergedMap.set(r.id || r.month || r.key, r));
  reports.forEach(r => mergedMap.set(r.id || r.month || r.key, { ...mergedMap.get(r.id || r.month || r.key), ...r }));

  const mergedList = Array.from(mergedMap.values());
  mergedList.sort((a, b) => (b.month || b.createdAt || '').localeCompare(a.month || a.createdAt || ''));
  return mergedList;
}

export async function saveReport(reportData, actor) {
  const reportId = reportData.id || `${reportData.month || reportData.key}_${Date.now()}`;
  const completeReport = {
    ...reportData,
    id: reportId
  };

  const current = getLocalReports();
  const filtered = current.filter(r => r.id !== reportId && r.month !== completeReport.month);
  const updated = [completeReport, ...filtered];
  saveLocalReports(updated);

  if (db && actor?.uid) {
    try {
      const teamKey = await getTeamKey();
      if (teamKey) {
        const summary = completeReport.summary || [];
        // O documento principal guarda só o resumo agregado (nome do vendedor + total),
        // igual antes. As linhas brutas (CPF, contrato, parcela etc.) vão numa
        // subcoleção separada, uma corretora por documento, pra não estourar o
        // limite de tamanho de documento do Firestore em relatórios com muitas corretoras.
        const summaryForCloud = summary.map(({ rawBlocks, ...rest }) => rest);
        const encryptedSellerData = await encryptJson(teamKey, summaryForCloud);
        const safeReport = sanitizeSavedReportForCloud(completeReport, actor, encryptedSellerData);
        const reportRef = doc(collection(db, 'saved_reports'), reportId);
        await setDoc(reportRef, { ...safeReport, date: Timestamp.now() });

        await saveBrokerDetails(reportId, summary, teamKey, actor);
      } else {
        console.warn('Chave de equipe ainda não configurada. Peça a um Administrador para gerá-la em "Configurar corretoras". Relatório salvo apenas localmente.');
      }
    } catch (err) {
      console.error('Error saving report to Firestore:', err);
    }
  }
}

async function saveBrokerDetails(reportId, summary, teamKey, actor) {
  for (const item of summary) {
    if (!item.rawBlocks || !item.rawBlocks.length) continue;
    try {
      const encryptedRows = await encryptJson(teamKey, item.rawBlocks);
      if (encryptedRows.length > MAX_ENCRYPTED_BROKER_DETAIL_LENGTH) {
        console.warn(`Detalhe completo de "${item.corretora}" é grande demais e não será salvo na nuvem (ficará só o resumo agregado nesse relatório). Considere dividir o envio em lotes menores.`);
        continue;
      }
      const safeDetail = sanitizeBrokerDetailForCloud(item.corretora, encryptedRows, actor);
      const brokerId = slugifyBrokerId(item.corretora);
      const detailRef = doc(db, 'saved_reports', reportId, 'broker_details', brokerId);
      await setDoc(detailRef, safeDetail);
    } catch (err) {
      console.error(`Erro ao salvar detalhe completo da corretora "${item.corretora}":`, err);
    }
  }
}

// Busca as linhas completas (CPF, contrato, parcela etc.) de cada corretora de um
// relatório salvo, para reconstruir o arquivo detalhado (ex: ao baixar de novo pelo
// histórico). Retorna [] se a chave de equipe não estiver disponível ou não houver
// detalhe salvo (relatórios salvos antes desta funcionalidade existir).
export async function getSavedReportBrokerDetails(reportId) {
  if (!db) return [];
  const teamKey = await getTeamKey();
  if (!teamKey) return [];

  try {
    const snapshot = await getDocs(collection(db, 'saved_reports', reportId, 'broker_details'));
    const results = [];
    for (const d of snapshot.docs) {
      const data = d.data();
      try {
        const rawBlocks = await decryptJson(teamKey, data.encryptedRows);
        results.push({ corretora: data.corretora, rawBlocks });
      } catch (err) {
        console.error(`Erro ao decifrar detalhe completo da corretora (${d.id}):`, err);
      }
    }
    return results;
  } catch (err) {
    console.error('Erro ao buscar detalhe completo das corretoras:', err);
    return [];
  }
}

export async function deleteReport(id) {
  const current = getLocalReports();
  const updated = current.filter(r => r.id !== id && r.month !== id && r.key !== id);
  saveLocalReports(updated);

  if (db) {
    try {
      // O Firestore não apaga subcoleções sozinho ao apagar o documento pai:
      // sem isso, o detalhe completo (CPF, contrato, parcela) de cada corretora
      // ficaria órfão no banco para sempre.
      const detailsSnapshot = await getDocs(collection(db, 'saved_reports', id, 'broker_details'));
      await Promise.all(detailsSnapshot.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'saved_reports', id));
    } catch (err) {
      console.error('Error deleting report from Firestore:', err);
    }
  }
}
