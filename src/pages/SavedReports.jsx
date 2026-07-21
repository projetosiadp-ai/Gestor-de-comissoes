import React, { useState, useEffect } from 'react';
import { FolderOpen, Download, Trash2, FileSpreadsheet, ChevronDown, ChevronRight, Eye, Archive } from 'lucide-react';
import { formatBRL } from '../App';
import { 
  exportSavedReportWorkbooks, 
  exportSingleBrokerWorkbook,
  exportSavedReportZip
} from '../services/exportSavedReport';

function HistoryTable({ reports, onDelete, isAdmin }) {
  const [expandedReportId, setExpandedReportId] = useState(null);

  if (!reports || !reports.length) {
    return <div className="empty-state">Nenhum relatório salvo ainda.</div>;
  }

  return (
    <div className="history-table-container">
      <table className="history-table">
        <thead>
          <tr>
            <th>Relatório</th>
            <th>Vendedores</th>
            <th>Corretoras</th>
            <th>Valor total</th>
            <th>Arquivos</th>
            <th>Criado em</th>
            <th>Criado por</th>
            <th style={{ textAlign: 'right' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const isExpanded = expandedReportId === report.id;
            const summary = report.summary || [];

            return (
              <React.Fragment key={report.id}>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        className="ghost" 
                        onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                        style={{ padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}
                        title="Ver corretoras e planilhas individuais"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <strong>{report.label}</strong>
                    </div>
                  </td>
                  <td>{Number(report.sellers || 0)}</td>
                  <td>{Number(report.brokers || summary.length || 0)}</td>
                  <td>{formatBRL(report.totalValue || report.totalGeral || 0)}</td>
                  <td>{Number(report.inputFiles || report.totalFiles || 0)}</td>
                  <td>{new Date(report.createdAt).toLocaleString('pt-BR')}</td>
                  <td>{report.createdByName || '—'}</td>
                  <td>
                    <div className="history-row-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button 
                        className="primary" 
                        onClick={() => exportSavedReportWorkbooks(report, { chooseFolder: true })}
                        title="Escolher a pasta no seu computador e salvar todas as planilhas individuais (.xlsx) diretamente nela de uma vez"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                      >
                        <FolderOpen size={14} /> Salvar direto na pasta...
                      </button>

                      <button 
                        className="secondary" 
                        onClick={() => exportSavedReportZip(report)}
                        title="Baixar todas as planilhas individuais (.xlsx) juntas dentro de 1 único arquivo ZIP (Zero janelas pop-up repetidas!)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                      >
                        <Archive size={14} /> Baixar todas em ZIP
                      </button>

                      <button 
                        className={`ghost ${isExpanded ? 'active' : ''}`} 
                        onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                        title="Ver lista de corretoras e baixar individualmente"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '6px 10px' }}
                      >
                        <Eye size={13} /> Corretoras ({summary.length})
                      </button>

                      {isAdmin && (
                        <button 
                          className="delete" 
                          onClick={() => onDelete(report.id)} 
                          title="Mover para lixeira"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Sub-tabela expansível com as planilhas individuais por corretora */}
                {isExpanded && (
                  <tr>
                    <td colSpan={8} style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))', padding: '16px 24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>
                            Planilhas individuais por corretora - {report.label}
                          </strong>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                            Você pode salvar todas as planilhas individuais em uma pasta do computador, baixar um pacote ZIP único com todas dentro ou baixar cada uma separadamente.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button 
                            className="primary" 
                            onClick={() => exportSavedReportWorkbooks(report, { chooseFolder: true })}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                          >
                            <FolderOpen size={14} /> Salvar direto na pasta do Windows...
                          </button>

                          <button 
                            className="secondary" 
                            onClick={() => exportSavedReportZip(report)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                          >
                            <Archive size={14} /> Baixar todas em 1 pacote ZIP
                          </button>
                        </div>
                      </div>

                      {summary.length === 0 ? (
                        <div className="empty-state">Sem dados de corretoras gravados neste relatório.</div>
                      ) : (
                        <table className="sub-summary-table" style={{ width: '100%', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                          <thead>
                            <tr style={{ background: 'var(--header-bg, rgba(0,0,0,0.04))' }}>
                              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px' }}>Corretora / Planilha</th>
                              <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: '12px' }}>Vendedores</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px' }}>Valor total</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px' }}>Download Individual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.map((item, sIdx) => (
                              <tr key={sIdx} style={{ borderBottom: '1px solid var(--line)' }}>
                                <td style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '500' }}>
                                  <FileSpreadsheet size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--primary)' }} />
                                  {item.corretora}.xlsx
                                </td>
                                <td style={{ textAlign: 'center', padding: '8px 12px', fontSize: '12px' }}>
                                  {Number(item.vendedores || 0)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '8px 12px', fontSize: '13px', fontWeight: '600' }}>
                                  {formatBRL(item.totalConsolidado ?? item.total ?? 0)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                                  <button 
                                    className="ghost" 
                                    onClick={() => exportSingleBrokerWorkbook(report, item)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }}
                                    title={`Baixar planilha .xlsx individual da corretora ${item.corretora}`}
                                  >
                                    <Download size={12} /> Baixar {item.corretora}.xlsx
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SavedReports({ savedReports, refreshHistory, onNavigate, isAdmin, onTrashReport }) {
  const [activeTabId, setActiveTabId] = useState(null);

  useEffect(() => {
    if (activeTabId && !savedReports.some(r => r.id === activeTabId)) {
      setActiveTabId(null);
    }
  }, [savedReports, activeTabId]);

  const handleDeleteReport = async (id) => {
    if (!confirm('Mover este registro para a lixeira por 30 dias?')) return;
    try {
      await onTrashReport(id);
      refreshHistory();
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
          <p>Escolha a pasta do seu computador/rede para salvar todas as planilhas individuais (.xlsx) do mês ou baixe um arquivo ZIP único com todas elas.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="primary" onClick={() => onNavigate('new-report')}>
            ＋ Novo relatório
          </button>
        </div>
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
            <HistoryTable reports={filteredReports} onDelete={handleDeleteReport} isAdmin={isAdmin} />
          )}
        </div>
      </section>
    </div>
  );
}
