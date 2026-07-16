import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { purgeReport, restoreReport as restoreCloudReport } from '../services/cloudReports';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default function Trash({ cloudReports, refreshHistory }) {
  const session = useAuth();
  const [localReports, setLocalReports] = useState([]);
  const [error, setError] = useState('');

  const refresh = async () => {
    const local = await window.api.listTrashedReports();
    setLocalReports(local || []);
  };

  useEffect(() => { refresh().catch(failure => setError(failure.message)); }, []);

  const reports = useMemo(() => {
    const merged = new Map(localReports.map(item => [item.id, item]));
    cloudReports.filter(item => item.deletedAt).forEach(item => merged.set(item.id, { ...merged.get(item.id), ...item }));
    return Array.from(merged.values()).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  }, [localReports, cloudReports]);

  const restore = async report => {
    try {
      await window.api.restoreSavedReport(report.id);
      if (session.configured && cloudReports.some(item => item.id === report.id)) {
        await restoreCloudReport(report.id, session.user);
      }
      await refresh();
      refreshHistory();
    } catch (failure) { setError(failure.message); }
  };

  const purge = async report => {
    try {
      await purgeReport(report.id, session.user);
    } catch (failure) { setError(failure.message); }
  };

  return (
    <div className="page active">
      <div className="page-title"><div><h1>Lixeira</h1><p>Registros excluídos ficam disponíveis para restauração por 30 dias. Os arquivos gerados não são apagados.</p></div></div>
      {error && <div className="status error">{error}</div>}
      <section className="panel trash-list">
        {reports.length === 0 && <div className="empty-state">A lixeira está vazia.</div>}
        {reports.map(report => {
          const age = Date.now() - new Date(report.deletedAt).getTime();
          const remaining = Math.max(0, Math.ceil((RETENTION_MS - age) / (24 * 60 * 60 * 1000)));
          return (
            <article className="trash-row" key={report.id}>
              <Trash2 size={19} />
              <div><b>{report.label}</b><small>Excluído em {new Date(report.deletedAt).toLocaleString('pt-BR')} · {remaining} dia(s) restante(s)</small></div>
              <button className="secondary" onClick={() => restore(report)}><RotateCcw size={14} /> Restaurar</button>
              {report.outputRoot && <button className="ghost" onClick={() => window.api.openPath(report.outputRoot)}><FolderOpen size={14} /> Pasta</button>}
              {remaining === 0 && session.configured && <button className="ghost danger" onClick={() => purge(report)}>Remover registro</button>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
