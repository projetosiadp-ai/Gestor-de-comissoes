import React, { useEffect, useState } from 'react';
import { FileClock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { subscribeAudit } from '../services/cloudReports';

const ACTION_LABELS = {
  'report.created': 'Relatório criado',
  'report.trashed': 'Relatório movido para a lixeira',
  'report.restored': 'Relatório restaurado',
  'report.purged': 'Registro removido definitivamente',
  'user.approved': 'Usuário aprovado',
  'user.pending': 'Usuário movido para pendente',
  'user.rejected': 'Usuário bloqueado'
};

export default function AuditLog() {
  const session = useAuth();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session.configured || !session.isAdmin) return undefined;
    return subscribeAudit(setEntries, failure => setError(failure.message));
  }, [session.configured, session.isAdmin]);

  if (!session.configured) {
    return <div className="page active"><div className="empty-state">Configure o Firebase para consultar a auditoria compartilhada.</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-title"><div><h1>Auditoria</h1><p>Registro imutável das ações administrativas e dos processamentos sincronizados.</p></div></div>
      {error && <div className="status error">{error}</div>}
      <section className="panel audit-list">
        {entries.length === 0 && <div className="empty-state">Nenhum evento de auditoria disponível.</div>}
        {entries.map(entry => (
          <article className="audit-row" key={entry.id}>
            <span className="audit-icon">{entry.action?.startsWith('user.') ? <ShieldCheck size={17} /> : <FileClock size={17} />}</span>
            <div><b>{ACTION_LABELS[entry.action] || entry.action}</b><small>{entry.actorName || entry.actorEmail || entry.actorUid}</small></div>
            <div><b>{entry.targetId}</b><small>{new Date(entry.createdAt).toLocaleString('pt-BR')}</small></div>
          </article>
        ))}
      </section>
    </div>
  );
}
