import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import NewReport from './pages/NewReport';
import SavedReports from './pages/SavedReports';
import PdfSummary from './pages/PdfSummary';
import GeneralReport from './pages/GeneralReport';

export function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [savedReports, setSavedReports] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // States para logs e exibição do console
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const consoleBodyRef = React.useRef(null);

  const addLog = useCallback((type, message) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), timestamp, type, message }]);
  }, []);

  // Rolagem automática para o fim do log console
  useEffect(() => {
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [logs, showConsole]);

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      if (window.api && window.api.listSavedReports) {
        const list = await window.api.listSavedReports();
        setSavedReports(list || []);
      }
    } catch (err) {
      console.error('Erro ao listar relatórios salvos:', err);
      addLog('error', `Falha ao carregar histórico: ${err.message}`);
    } finally {
      setLoadingHistory(false);
    }
  }, [addLog]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const pageSubtitles = {
    dashboard: 'Visão geral dos relatórios',
    'new-report': 'Importação e geração de relatórios',
    'saved-reports': 'Histórico mensal dos processamentos',
    'pdf-summary': 'Resumo único das comissões em PDF',
    'general-report': 'Consolidação de planilhas individuais em relatório geral'
  };

  const pageTitles = {
    dashboard: 'Dashboard',
    'new-report': 'Novo relatório',
    'saved-reports': 'Relatórios salvos',
    'pdf-summary': 'PDF de resumo',
    'general-report': 'Relatório Geral'
  };

  const errorLogsCount = logs.filter(l => l.type === 'error').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="assets/logo.png" alt="Dental Plus" />
          <span>Gestão de Comissões</span>
        </div>

        <nav className="side-nav">
          <button 
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} 
            onClick={() => { setActivePage('dashboard'); refreshHistory(); }}
          >
            <span>⌂</span> Dashboard
          </button>
          <button 
            className={`nav-item ${activePage === 'new-report' ? 'active' : ''}`} 
            onClick={() => setActivePage('new-report')}
          >
            <span>＋</span> Novo relatório
          </button>
          <button 
            className={`nav-item ${activePage === 'saved-reports' ? 'active' : ''}`} 
            onClick={() => { setActivePage('saved-reports'); refreshHistory(); }}
          >
            <span>▣</span> Relatórios salvos
          </button>
          <button 
            className={`nav-item ${activePage === 'pdf-summary' ? 'active' : ''}`} 
            onClick={() => setActivePage('pdf-summary')}
          >
            <span>▤</span> PDF de resumo
          </button>
          <button 
            className={`nav-item ${activePage === 'general-report' ? 'active' : ''}`} 
            onClick={() => setActivePage('general-report')}
          >
            <span>田</span> Relatório Geral
          </button>
        </nav>

        <div className="sidebar-footer">
          <strong>Juntador de Comissões</strong>
          <span>Alpha</span>
          <small>Desenvolvido por<br /><b>glzn-comercial</b></small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <strong>Juntador de Comissões Dental Plus</strong>
            <span id="pageSubtitle">{pageSubtitles[activePage]}</span>
          </div>
          <span className="alpha-pill">ALPHA</span>
        </header>

        <div className="content">
          {activePage === 'dashboard' && (
            <Dashboard 
              savedReports={savedReports} 
              onNavigate={setActivePage} 
              refreshHistory={refreshHistory}
            />
          )}
          {activePage === 'new-report' && (
            <NewReport 
              refreshHistory={refreshHistory}
              addLog={addLog}
            />
          )}
          {activePage === 'saved-reports' && (
            <SavedReports 
              savedReports={savedReports} 
              refreshHistory={refreshHistory}
              onNavigate={setActivePage}
            />
          )}
          {activePage === 'pdf-summary' && (
            <PdfSummary 
              addLog={addLog}
            />
          )}
          {activePage === 'general-report' && (
            <GeneralReport 
              refreshHistory={refreshHistory}
              addLog={addLog}
            />
          )}
        </div>
      </main>

      {/* Botão flutuante do console de logs */}
      <button className="log-console-trigger" onClick={() => setShowConsole(!showConsole)}>
        <span>{showConsole ? '✕' : '⧵_'}</span>
        {!showConsole && errorLogsCount > 0 && (
          <span className="badge">{errorLogsCount}</span>
        )}
      </button>

      {/* Painel do console de logs */}
      {showConsole && (
        <div className="log-console-panel">
          <div className="log-console-header">
            <h3><span>⚙</span> Console de Logs</h3>
            <div className="log-console-actions">
              <button onClick={() => setLogs([])}>Limpar</button>
              <button className="close" onClick={() => setShowConsole(false)}>Fechar</button>
            </div>
          </div>
          <div className="log-console-body" ref={consoleBodyRef}>
            {logs.length === 0 ? (
              <div className="log-empty">Nenhum log registrado ainda.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="log-item">
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-type ${log.type}`}>{log.type.toUpperCase()}</span>
                  <span className="log-text">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
