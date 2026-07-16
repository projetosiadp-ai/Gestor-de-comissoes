import React from 'react';
import { Moon, Sun } from 'lucide-react';

export default function Topbar({ subtitle, theme, onToggleTheme, session, cloudState }) {
  const syncLabel = session.configured
    ? cloudState.hasPendingWrites ? 'Sincronizando' : cloudState.fromCache ? 'Offline' : 'Sincronizado'
    : 'Modo local';

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
        <button className="user-pill" onClick={session.configured ? session.logout : undefined} title={session.configured ? 'Sair da conta' : 'Firebase não configurado'}>
          {session.profile?.displayName || session.user?.email || 'Usuário'} · {session.profile?.role === 'admin' ? 'Administrador' : 'Operador'}
        </button>
      </div>
    </header>
  );
}
