import React from 'react';
import { Moon, Sun } from 'lucide-react';

function initialsFor(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

export default function Topbar({ subtitle, theme, onToggleTheme, session, cloudState }) {
  const syncLabel = session.configured
    ? cloudState.hasPendingWrites ? 'Sincronizando' : cloudState.fromCache ? 'Offline' : 'Sincronizado'
    : 'Modo local';
  const displayName = session.profile?.displayName || session.user?.email || 'Usuário';

  return (
    <header className="topbar">
      <div>
        <strong>Contabilizador de Comissões Dental Plus</strong>
        <span id="pageSubtitle">{subtitle}</span>
      </div>
      <div className="topbar-actions">
        <span className={`sync-pill ${session.configured && !cloudState.fromCache ? 'online' : 'offline'}`}>{syncLabel}</span>
        <button className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          {theme === 'light' ? 'Escuro' : 'Claro'}
        </button>
        <span className="alpha-pill">v1.0</span>
        <div className="topbar-divider" />
        <button className="user-pill" onClick={session.configured ? session.logout : undefined} title={session.configured ? 'Sair da conta' : 'Firebase não configurado'}>
          <span className="user-avatar">{initialsFor(displayName)}</span>
          {displayName} · {session.profile?.role === 'admin' ? 'Administrador' : 'Operador'}
        </button>
      </div>
    </header>
  );
}
