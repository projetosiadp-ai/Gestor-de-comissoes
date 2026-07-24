import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock3, ShieldCheck, UserCog, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { subscribeUsers, updateUserAccess } from '../services/cloudUsers';

export default function UserManagement() {
  const session = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [promotionTarget, setPromotionTarget] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState('');

  useEffect(() => {
    if (!session.configured || !session.isAdmin) return undefined;
    return subscribeUsers(setUsers, failure => setError(failure.message));
  }, [session.configured, session.isAdmin]);

  const changeAccess = async (userId, role, status, previousRole) => {
    setBusyId(userId);
    setError('');
    try {
      await updateUserAccess(userId, { role, status }, session.actor, previousRole);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  };

  const requestPromotion = user => {
    setPromotionTarget(user);
    setConfirmEmail('');
  };

  const cancelPromotion = () => {
    setPromotionTarget(null);
    setConfirmEmail('');
  };

  const confirmPromotion = async () => {
    if (!promotionTarget) return;
    if (!promotionTarget.email || confirmEmail.trim().toLowerCase() !== String(promotionTarget.email).toLowerCase()) return;
    await changeAccess(promotionTarget.id, 'admin', 'approved', promotionTarget.role);
    cancelPromotion();
  };

  if (!session.configured) {
    return <div className="page active"><div className="empty-state">Configure o Firebase para gerenciar contas compartilhadas.</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-title"><div><h1>Usuários e acessos</h1><p>Aprove solicitações e defina o perfil de cada pessoa.</p></div></div>
      {error && <div className="status error">{error}</div>}
      {promotionTarget && (
        <section className="panel" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} />
            <b>Confirmar promoção a Administrador</b>
          </div>
          <p style={{ margin: 0 }}>
            Para promover <b>{promotionTarget.displayName || promotionTarget.email}</b> a Administrador,
            digite o e-mail da conta para confirmar: <b>{promotionTarget.email}</b>
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={event => setConfirmEmail(event.target.value)}
            placeholder="Digite o e-mail para confirmar"
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--panel)', color: 'var(--text)' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              disabled={busyId === promotionTarget.id || !promotionTarget.email || confirmEmail.trim().toLowerCase() !== String(promotionTarget.email).toLowerCase()}
              onClick={confirmPromotion}
            >
              Confirmar promoção
            </button>
            <button className="ghost" onClick={cancelPromotion}>Cancelar</button>
          </div>
        </section>
      )}
      <section className="panel user-access-list">
        {users.length === 0 && <div className="empty-state">Nenhuma conta encontrada.</div>}
        {users.sort((a, b) => String(a.status).localeCompare(String(b.status))).map(user => (
          <article className="user-access-row" key={user.id}>
            <span className={`user-status ${user.status}`}>
              {user.status === 'approved' ? <CheckCircle size={16} /> : user.status === 'rejected' ? <XCircle size={16} /> : <Clock3 size={16} />}
            </span>
            <div><b>{user.displayName || user.email}</b><small>{user.email}</small></div>
            <span className="role-badge">{user.role === 'admin' ? <ShieldCheck size={14} /> : <UserCog size={14} />}{user.role === 'admin' ? 'Administrador' : 'Operador'}</span>
            <div className="user-access-actions">
              <button disabled={busyId === user.id} onClick={() => changeAccess(user.id, 'operator', 'approved', user.role)}>Aprovar Operador</button>
              <button disabled={busyId === user.id || user.role === 'admin'} onClick={() => requestPromotion(user)}>Tornar Admin</button>
              <button className="ghost danger" disabled={busyId === user.id || user.id === session.user.uid} onClick={() => changeAccess(user.id, user.role || 'operator', 'rejected', user.role)}>Bloquear</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
