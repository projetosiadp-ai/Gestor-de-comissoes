import React, { useEffect, useState } from 'react';
import { CheckCircle, Clock3, ShieldCheck, UserCog, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { subscribeUsers, updateUserAccess } from '../services/cloudUsers';

export default function UserManagement() {
  const session = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!session.configured || !session.isAdmin) return undefined;
    return subscribeUsers(setUsers, failure => setError(failure.message));
  }, [session.configured, session.isAdmin]);

  const changeAccess = async (userId, role, status) => {
    setBusyId(userId);
    setError('');
    try {
      await updateUserAccess(userId, { role, status }, session.user);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  };

  if (!session.configured) {
    return <div className="page active"><div className="empty-state">Configure o Firebase para gerenciar contas compartilhadas.</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-title"><div><h1>Usuários e acessos</h1><p>Aprove solicitações e defina o perfil de cada pessoa.</p></div></div>
      {error && <div className="status error">{error}</div>}
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
              <button disabled={busyId === user.id} onClick={() => changeAccess(user.id, 'operator', 'approved')}>Aprovar Operador</button>
              <button disabled={busyId === user.id} onClick={() => changeAccess(user.id, 'admin', 'approved')}>Tornar Admin</button>
              <button className="ghost danger" disabled={busyId === user.id || user.id === session.user.uid} onClick={() => changeAccess(user.id, user.role || 'operator', 'rejected')}>Bloquear</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
