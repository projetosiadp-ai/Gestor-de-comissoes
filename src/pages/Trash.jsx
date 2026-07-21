import React, { useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { purgeReport, restoreReport as restoreCloudReport } from '../services/cloudReports';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default function Trash({ cloudReports, refreshHistory }) {
  const session = useAuth();
  const [error, setError] = useState('');

  const reports = useMemo(() => {
    return cloudReports
      .filter(item => item.deletedAt)
      .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  }, [cloudReports]);

  const restore = async report => {
    try {
      if (session.configured) {
        await restoreCloudReport(report.id, session.actor);
      }
      refreshHistory();
    } catch (failure) { setError(failure.message); }
  };

  const purge = async report => {
    try {
      await purgeReport(report.id, session.actor);
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
              {remaining === 0 && session.configured && <button className="ghost danger" onClick={() => purge(report)}>Remover registro</button>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
