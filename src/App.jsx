import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, PlusCircle, History, FileDown, Table, Settings,
  UserCog, ArchiveRestore, ScrollText
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
import AuditLog from './pages/AuditLog';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import LogConsole from './components/layout/LogConsole';

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
    'trash': 'Registros excluídos nos últimos 30 dias',
    'audit': 'Eventos operacionais e administrativos'
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tooltip: 'Dashboard' },
    { id: 'new-report', label: 'Novo relatório', icon: PlusCircle, tooltip: 'Novo relatório' },
    { id: 'saved-reports', label: 'Relatórios salvos', icon: History, tooltip: 'Relatórios salvos' },
    { id: 'pdf-summary', label: 'PDF de resumo', icon: FileDown, tooltip: 'PDF de resumo' },
    { id: 'general-report', label: 'Relatório Geral', icon: Table, tooltip: 'Relatório Geral' },
    { id: 'config-corretoras', label: 'Configurar corretoras', icon: Settings, tooltip: 'Configurar corretoras', adminOnly: true },
    { id: 'users', label: 'Usuários', icon: UserCog, tooltip: 'Usuários e acessos', adminOnly: true },
    { id: 'audit', label: 'Auditoria', icon: ScrollText, tooltip: 'Auditoria compartilhada', adminOnly: true },
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
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(value => !value)}
        items={navItems}
        activePage={activePage}
        onNavigate={setActivePage}
        onRefresh={refreshHistory}
      />

      <main className="main-area">
        <Topbar
          subtitle={pageSubtitles[activePage]}
          theme={theme}
          onToggleTheme={() => setTheme(value => value === 'light' ? 'dark' : 'light')}
          session={session}
          cloudState={cloudState}
        />

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
          {activePage === 'audit' && <AuditLog />}
          {activePage === 'trash' && <Trash cloudReports={cloudReports} refreshHistory={refreshHistory} />}
        </div>
      </main>

      <LogConsole
        logs={logs}
        setLogs={setLogs}
        visible={showConsole}
        setVisible={setShowConsole}
        filter={logSeverityFilter}
        setFilter={setLogSeverityFilter}
        filteredLogs={filteredLogs}
        bodyRef={consoleBodyRef}
        copyFeedback={copyFeedback}
        onCopy={handleCopyLogs}
        errorCount={errorLogsCount}
      />
    </div>
  );
}
