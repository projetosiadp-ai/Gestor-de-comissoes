import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sun, Moon, LayoutDashboard, PlusCircle, History, 
  FileDown, Table, Settings, Terminal, X, Copy, Check, Trash2,
  ChevronLeft, ChevronRight, AlertCircle, Info, CheckCircle2, UserCog, ArchiveRestore
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import NewReport from './pages/NewReport';
import SavedReports from './pages/SavedReports';
import PdfSummary from './pages/PdfSummary';
import GeneralReport from './pages/GeneralReport';
import ConfigCorretoras from './pages/ConfigCorretoras';
import AuthScreen from './auth/AuthScreen';
import { useAuth } from './auth/AuthContext';
import { subscribeReports, syncReport } from './services/cloudReports';
import { trashReport as trashCloudReport } from './services/cloudReports';
import UserManagement from './pages/UserManagement';
import Trash from './pages/Trash';
import dentalPlusLogo from '../assets/logo.png';

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
  const session = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [localReports, setLocalReports] = useState([]);
  const [cloudReports, setCloudReports] = useState([]);
  const [cloudState, setCloudState] = useState({ fromCache: true, hasPendingWrites: false });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Theme state
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  // Apply theme class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // States para logs e console
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [logSeverityFilter, setLogSeverityFilter] = useState('ALL'); // ALL, info, success, error
  const [copyFeedback, setCopyFeedback] = useState(false);
  const consoleBodyRef = React.useRef(null);

  const addLog = useCallback((type, message) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), timestamp, type, message }]);
  }, []);

  const savedReports = useMemo(() => {
    const merged = new Map(localReports.map(report => [report.id, report]));
    cloudReports.forEach(report => merged.set(report.id, { ...merged.get(report.id), ...report }));
    return Array.from(merged.values()).filter(report => !report.deletedAt);
  }, [localReports, cloudReports]);

  // Auto-scroll inside logs console
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
        setLocalReports(list || []);
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

  useEffect(() => {
    if (!session.configured || !session.user || session.profile?.status !== 'approved') {
      setCloudReports([]);
      return undefined;
    }
    return subscribeReports((reports, metadata) => {
      setCloudReports(reports);
      setCloudState(metadata);
    }, error => addLog('error', `Falha ao sincronizar histórico: ${error.message}`));
  }, [session.configured, session.user, session.profile?.status, addLog]);

  const handleReportCreated = useCallback(report => {
    if (!session.configured || !session.user || session.profile?.status !== 'approved') return;
    syncReport(report, session.user)
      .then(() => addLog('success', 'Metadados do relatório sincronizados com segurança.'))
      .catch(error => addLog('error', `Sincronização pendente: ${error.message}`));
  }, [session.configured, session.user, session.profile?.status, addLog]);

  const handleTrashReport = useCallback(async reportId => {
    if (!session.isAdmin) throw new Error('Somente Administradores podem mover relatórios para a lixeira.');
    await window.api.deleteSavedReport(reportId);
    if (session.configured && cloudReports.some(report => report.id === reportId)) {
      await trashCloudReport(reportId, session.user);
    }
    await refreshHistory();
  }, [session.isAdmin, session.configured, session.user, cloudReports, refreshHistory]);

  const pageSubtitles = {
    dashboard: 'Visão geral dos relatórios',
    'new-report': 'Importação e geração de relatórios',
    'saved-reports': 'Histórico mensal dos processamentos',
    'pdf-summary': 'Resumo único das comissões em PDF',
    'general-report': 'Consolidação de planilhas individuais em relatório geral',
    'config-corretoras': 'Mapeamentos e apelidos das corretoras',
    'users': 'Contas, perfis e aprovações',
    'trash': 'Registros excluídos nos últimos 30 dias'
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tooltip: 'Dashboard' },
    { id: 'new-report', label: 'Novo relatório', icon: PlusCircle, tooltip: 'Novo relatório' },
    { id: 'saved-reports', label: 'Relatórios salvos', icon: History, tooltip: 'Relatórios salvos' },
    { id: 'pdf-summary', label: 'PDF de resumo', icon: FileDown, tooltip: 'PDF de resumo' },
    { id: 'general-report', label: 'Relatório Geral', icon: Table, tooltip: 'Relatório Geral' },
    { id: 'config-corretoras', label: 'Configurar corretoras', icon: Settings, tooltip: 'Configurar corretoras', adminOnly: true },
    { id: 'users', label: 'Usuários', icon: UserCog, tooltip: 'Usuários e acessos', adminOnly: true },
    { id: 'trash', label: 'Lixeira', icon: ArchiveRestore, tooltip: 'Lixeira de 30 dias', adminOnly: true }
  ].filter(item => !item.adminOnly || session.isAdmin);

  // Filters and limits logs to last 150 items to prevent DOM lag (virtualization-like)
  const filteredLogs = useMemo(() => {
    const list = logSeverityFilter === 'ALL' 
      ? logs 
      : logs.filter(l => l.type === logSeverityFilter);
    return list.slice(-150); // limit render list
  }, [logs, logSeverityFilter]);

  const errorLogsCount = useMemo(() => logs.filter(l => l.type === 'error').length, [logs]);

  const handleCopyLogs = useCallback(() => {
    const logText = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [logs]);

  if (session.loading || (session.configured && (!session.user || session.profile?.status !== 'approved'))) {
    return <AuthScreen />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" style={{ position: 'relative', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            {!sidebarCollapsed ? (
              <img src={dentalPlusLogo} alt="Dental Plus" style={{ width: '135px' }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: '900', color: '#062a60', fontSize: '15px' }}>D</div>
            )}
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 0,
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          {!sidebarCollapsed && <span>Gestão de Comissões</span>}
        </div>

        <nav className="side-nav">
          {navItems.map(item => {
            const IconComponent = item.icon;
            const isActive = activePage === item.id;
            return (
              <button 
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`} 
                onClick={() => { 
                  setActivePage(item.id); 
                  if (item.id === 'dashboard' || item.id === 'saved-reports') {
                    refreshHistory();
                  }
                }}
                data-tooltip={item.tooltip}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeNavPill"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, #0766d8, #0e82ee)',
                      borderRadius: '9px',
                      zIndex: -1
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <IconComponent size={18} style={{ flexShrink: 0 }} />
                <span className="nav-text">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>Contabilizador de Comissões</strong>
          <span>Uso interno · v1.0</span>
          <small>Desenvolvido por<br /><b>glzn-comercial</b></small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <strong>Contabilizador de Comissões Dental Plus</strong>
            <span id="pageSubtitle">{pageSubtitles[activePage]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className={`sync-pill ${session.configured && !cloudState.fromCache ? 'online' : 'offline'}`}>
              {session.configured
                ? cloudState.hasPendingWrites ? 'Sincronizando' : cloudState.fromCache ? 'Offline' : 'Sincronizado'
                : 'Modo local'}
            </span>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              style={{
                background: 'transparent',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              {theme === 'light' ? 'Escuro' : 'Claro'}
            </button>
            <span className="alpha-pill">v1.0</span>
            <button className="user-pill" onClick={session.configured ? session.logout : undefined} title={session.configured ? 'Sair da conta' : 'Firebase não configurado'}>
              {session.profile?.displayName || session.user?.email || 'Usuário'} · {session.profile?.role === 'admin' ? 'Administrador' : 'Operador'}
            </button>
          </div>
        </header>

        <div className="content">
          {activePage === 'dashboard' && (
            <Dashboard 
              savedReports={savedReports} 
              onNavigate={setActivePage} 
              refreshHistory={refreshHistory}
              isAdmin={session.isAdmin}
              onTrashReport={handleTrashReport}
            />
          )}
          {activePage === 'new-report' && (
            <NewReport 
              refreshHistory={refreshHistory}
              addLog={addLog}
              onReportCreated={handleReportCreated}
              knownReports={savedReports}
            />
          )}
          {activePage === 'saved-reports' && (
            <SavedReports 
              savedReports={savedReports} 
              refreshHistory={refreshHistory}
              onNavigate={setActivePage}
              isAdmin={session.isAdmin}
              onTrashReport={handleTrashReport}
              onReportCreated={handleReportCreated}
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
          {activePage === 'config-corretoras' && (
            <ConfigCorretoras 
              addLog={addLog}
            />
          )}
          {activePage === 'users' && <UserManagement />}
          {activePage === 'trash' && <Trash cloudReports={cloudReports} refreshHistory={refreshHistory} />}
        </div>
      </main>

      {/* Console de Logs Flutuante */}
      <button className="log-console-trigger" onClick={() => setShowConsole(!showConsole)}>
        {showConsole ? <X size={20} /> : <Terminal size={20} />}
        {!showConsole && errorLogsCount > 0 && (
          <span className="badge">{errorLogsCount}</span>
        )}
      </button>

      <AnimatePresence>
        {showConsole && (
          <motion.div 
            className="log-console-panel"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="log-console-header">
              <h3><Terminal size={14} /> Console de Logs</h3>
              <div className="log-console-actions">
                <button onClick={handleCopyLogs} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {copyFeedback ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                  {copyFeedback ? 'Copiado!' : 'Copiar'}
                </button>
                <button onClick={() => setLogs([])} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Trash2 size={11} /> Limpar
                </button>
                <button className="close" onClick={() => setShowConsole(false)}><X size={14} /></button>
              </div>
            </div>
            
            {/* Filter buttons by severity */}
            <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', background: '#0f172a', borderBottom: '1px solid #334155', fontSize: '11px' }}>
              <button 
                onClick={() => setLogSeverityFilter('ALL')} 
                style={{
                  background: logSeverityFilter === 'ALL' ? '#334155' : 'transparent',
                  border: 0, padding: '3px 8px', borderRadius: '4px', color: '#e2e8f0', cursor: 'pointer'
                }}
              >
                TODOS ({logs.length})
              </button>
              <button 
                onClick={() => setLogSeverityFilter('info')} 
                style={{
                  background: logSeverityFilter === 'info' ? '#0369a1' : 'transparent',
                  border: 0, padding: '3px 8px', borderRadius: '4px', color: '#e0f2fe', cursor: 'pointer'
                }}
              >
                INFO ({logs.filter(l => l.type === 'info').length})
              </button>
              <button 
                onClick={() => setLogSeverityFilter('success')} 
                style={{
                  background: logSeverityFilter === 'success' ? '#15803d' : 'transparent',
                  border: 0, padding: '3px 8px', borderRadius: '4px', color: '#dcfce7', cursor: 'pointer'
                }}
              >
                SUCESSO ({logs.filter(l => l.type === 'success').length})
              </button>
              <button 
                onClick={() => setLogSeverityFilter('error')} 
                style={{
                  background: logSeverityFilter === 'error' ? '#b91c1c' : 'transparent',
                  border: 0, padding: '3px 8px', borderRadius: '4px', color: '#fee2e2', cursor: 'pointer'
                }}
              >
                ERRO ({logs.filter(l => l.type === 'error').length})
              </button>
            </div>

            <div className="log-console-body" ref={consoleBodyRef}>
              {filteredLogs.length === 0 ? (
                <div className="log-empty">Nenhum log registrado para este filtro.</div>
              ) : (
                filteredLogs.map(log => {
                  let LogIcon = Info;
                  if (log.type === 'success') LogIcon = CheckCircle2;
                  if (log.type === 'error') LogIcon = AlertCircle;
                  return (
                    <div key={log.id} className="log-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <span className="log-time">[{log.timestamp}]</span>
                      <span className={`log-type ${log.type}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <LogIcon size={10} />
                        {log.type.toUpperCase()}
                      </span>
                      <span className="log-text">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
