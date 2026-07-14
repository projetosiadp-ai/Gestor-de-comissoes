import React, { useState, useEffect } from 'react';
import HistoryTable from '../components/HistoryTable';

export default function SavedReports({ savedReports, refreshHistory, onNavigate }) {
  const [activeTabId, setActiveTabId] = useState(null);

  // Se o activeTabId sumir da lista de relatórios, resetar para null
  useEffect(() => {
    if (activeTabId && !savedReports.some(r => r.id === activeTabId)) {
      setActiveTabId(null);
    }
  }, [savedReports, activeTabId]);

  const handleDeleteReport = async (id) => {
    if (!confirm('Excluir este registro do histórico? Os arquivos gerados não serão apagados.')) return;
    try {
      if (window.api && window.api.deleteSavedReport) {
        await window.api.deleteSavedReport(id);
        refreshHistory();
      }
    } catch (err) {
      alert('Erro ao deletar registro: ' + err.message);
    }
  };

  const filteredReports = activeTabId 
    ? savedReports.filter(r => r.id === activeTabId) 
    : savedReports;

  return (
    <div id="page-saved-reports" className="page active">
      <div className="page-title">
        <div>
          <h1>Relatórios salvos</h1>
          <p>Cada processamento fica registrado por mês para consulta posterior.</p>
        </div>
        <button className="primary" onClick={() => onNavigate('new-report')}>
          ＋ Novo relatório
        </button>
      </div>

      {savedReports.length > 0 && (
        <div id="savedTabs" className="saved-tabs">
          <button 
            className={`saved-tab ${activeTabId === null ? 'active' : ''}`}
            onClick={() => setActiveTabId(null)}
          >
            Todos
          </button>
          {savedReports.map((report) => (
            <button
              key={report.id}
              className={`saved-tab ${report.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(report.id)}
            >
              {report.label}
            </button>
          ))}
        </div>
      )}

      <section className="panel">
        <div id="savedReportsList">
          {savedReports.length === 0 ? (
            <div className="empty-state">Nenhum relatório salvo ainda.</div>
          ) : (
            <HistoryTable reports={filteredReports} onDelete={handleDeleteReport} />
          )}
        </div>
      </section>
    </div>
  );
}
