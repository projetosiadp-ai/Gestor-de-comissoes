import React, { useState, useEffect } from 'react';
import { formatBRL } from '../App';

function HistoryTable({ reports, onDelete, isAdmin }) {
  if (!reports || !reports.length) {
    return <div className="empty-state">Nenhum relatório salvo ainda.</div>;
  }

  const handleOpenPath = async (path) => {
    if (window.api && window.api.openPath) {
      try {
        await window.api.openPath(path);
      } catch (err) {
        alert('Erro ao abrir pasta: ' + err.message);
      }
    }
  };

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>Relatório</th>
          <th>Vendedores</th>
          <th>Corretoras</th>
          <th>Valor total</th>
          <th>Arquivos</th>
          <th>Criado em</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id}>
            <td><strong>{report.label}</strong></td>
            <td>{Number(report.sellers || 0)}</td>
            <td>{Number(report.brokers || 0)}</td>
            <td>{formatBRL(report.totalValue)}</td>
            <td>{Number(report.inputFiles || 0)}</td>
            <td>{new Date(report.createdAt).toLocaleString('pt-BR')}</td>
            <td>
              <div className="history-row-actions">
                <button onClick={() => handleOpenPath(report.outputRoot)}>Abrir pasta</button>
                {isAdmin && <button className="delete" onClick={() => onDelete(report.id)}>Lixeira</button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SavedReports({ savedReports, refreshHistory, onNavigate, isAdmin, onTrashReport, onReportCreated }) {
  const [activeTabId, setActiveTabId] = useState(null);
  
  // States para importação de relatório pronto
  const [showImportForm, setShowImportForm] = useState(false);
  const [importMonth, setImportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedReadyFiles, setSelectedReadyFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Se o activeTabId sumir da lista de relatórios, resetar para null
  useEffect(() => {
    if (activeTabId && !savedReports.some(r => r.id === activeTabId)) {
      setActiveTabId(null);
    }
  }, [savedReports, activeTabId]);

  const handleDeleteReport = async (id) => {
    if (!confirm('Mover este registro para a lixeira por 30 dias? Os arquivos gerados não serão apagados.')) return;
    try {
      await onTrashReport(id);
      refreshHistory();
    } catch (err) {
      alert('Erro ao deletar registro: ' + err.message);
    }
  };

  const handleSelectReadyFiles = async () => {
    if (window.api && window.api.selectReadyFiles) {
      const paths = await window.api.selectReadyFiles();
      if (paths && paths.length > 0) {
        setSelectedReadyFiles(prev => [...new Set([...prev, ...paths])]);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (window.api && window.api.getDroppedFilePaths) {
      const paths = window.api.getDroppedFilePaths(e.dataTransfer.files);
      const xlsxPaths = (paths || []).filter(p => /\.xlsx$/i.test(p));
      if (xlsxPaths.length > 0) {
        setSelectedReadyFiles(prev => [...new Set([...prev, ...xlsxPaths])]);
      }
    }
  };

  const handleImport = async () => {
    if (!importMonth) {
      setImportError('Informe o mês de referência.');
      return;
    }
    if (selectedReadyFiles.length === 0) {
      setImportError('Selecione ao menos um arquivo consolidado.');
      return;
    }

    setImporting(true);
    setImportError('');

    try {
      if (window.api && window.api.importReadyReports) {
        const res = await window.api.importReadyReports({
          files: selectedReadyFiles,
          reportMonth: importMonth
        });

        if (res.success) {
          alert('Relatório(s) pronto(s) importado(s) com sucesso!');
          setSelectedReadyFiles([]);
          setShowImportForm(false);
          refreshHistory();
          onReportCreated?.(res.savedReport);
        }
        if (res.errors && res.errors.length > 0) {
          alert('Alguns relatórios apresentaram erro na importação:\n' + res.errors.join('\n'));
        }
      }
    } catch (err) {
      setImportError(err.message || 'Erro ao importar relatórios.');
    } finally {
      setImporting(false);
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="secondary" onClick={() => setShowImportForm(!showImportForm)}>
            {showImportForm ? '✕ Cancelar Importação' : '📥 Importar Relatório Pronto'}
          </button>
          <button className="primary" onClick={() => onNavigate('new-report')}>
            ＋ Novo relatório
          </button>
        </div>
      </div>

      {/* Formulário de Importação de Relatório Pronto */}
      {showImportForm && (
        <section className="panel" style={{ borderLeft: '4px solid #0c76e5', animation: 'fade 0.2s ease' }}>
          <div className="panel-head" style={{ marginBottom: '16px' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📥</span> Importar Relatórios Consolidados Prontos
              </h2>
              <p>Adicione planilhas prontas geradas fora do sistema para incluí-las nos gráficos e comparativos.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label>📅 Mês de referência</label>
              <input 
                type="month" 
                value={importMonth} 
                onChange={(e) => setImportMonth(e.target.value)} 
              />
              <p className="muted" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                Todas as planilhas selecionadas abaixo serão agrupadas sob o mês informado aqui.
              </p>
            </div>

            <div 
              className={`dropzone small ${dragOver ? 'dragover' : ''}`}
              onClick={handleSelectReadyFiles}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ padding: '16px' }}
            >
              <span style={{ fontSize: '24px' }}>📁</span>
              <strong>Selecione ou arraste os arquivos .XLSX já prontos</strong>
              <small>Apenas arquivos de relatórios consolidados gerados (.xlsx)</small>
            </div>
          </div>

          {selectedReadyFiles.length > 0 && (
            <div style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px' }}>Arquivos selecionados ({selectedReadyFiles.length})</strong>
                <button className="ghost danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setSelectedReadyFiles([])}>
                  Limpar lista
                </button>
              </div>
              <div className="file-list" style={{ maxHeight: '100px' }}>
                {selectedReadyFiles.map((file, idx) => (
                  <div key={idx} className="file-chip" title={file}>
                    {file.split(/[\\/]/).pop()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {importError && (
            <div className="status error" style={{ marginTop: '16px', marginBottom: '0px' }}>
              {importError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button className="ghost" onClick={() => setShowImportForm(false)}>
              Fechar
            </button>
            <button 
              className="primary" 
              onClick={handleImport}
              disabled={importing}
              style={{ minWidth: '150px' }}
            >
              {importing ? 'Importando...' : '📥 Confirmar Importação'}
            </button>
          </div>
        </section>
      )}

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
            <HistoryTable reports={filteredReports} onDelete={handleDeleteReport} isAdmin={isAdmin} />
          )}
        </div>
      </section>
    </div>
  );
}
