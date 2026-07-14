import React, { useState } from 'react';
import { formatBRL } from '../App';
import MonthLineChart from '../components/MonthLineChart';
import MonthComparison from '../components/MonthComparison';

/* ─────────────────────────────────────────────
   Card expansível de um relatório mensal
───────────────────────────────────────────────*/
function ReportCard({ report, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedBroker, setExpandedBroker] = useState(null);

  const handleOpenPath = async () => {
    if (window.api?.openPath) {
      try { await window.api.openPath(report.outputRoot); }
      catch (err) { alert('Erro ao abrir pasta: ' + err.message); }
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir este registro do histórico? Os arquivos gerados não serão apagados.')) return;
    try {
      if (window.api?.deleteSavedReport) {
        await window.api.deleteSavedReport(report.id);
        onDelete();
      }
    } catch (err) { alert('Erro ao excluir: ' + err.message); }
  };

  const summary = report.summary || [];
  const totalValue = Number(report.totalValue || 0);

  return (
    <div className="report-card">
      {/* ── Header do card ── */}
      <div className="report-card-header">
        <div className="report-card-meta">
          <span className="report-card-month">{report.label}</span>
          <div className="report-card-stats">
            <span className="rc-stat"><span className="rc-stat-icon blue">▣</span>{summary.length} corretora{summary.length !== 1 ? 's' : ''}</span>
            <span className="rc-stat"><span className="rc-stat-icon cyan">♟</span>{Number(report.sellers || 0)} vendedor{Number(report.sellers || 0) !== 1 ? 'es' : ''}</span>
            <span className="rc-stat rc-stat-value"><span className="rc-stat-icon amber">$</span>{formatBRL(totalValue)}</span>
          </div>
        </div>
        <div className="report-card-actions">
          <button className="ghost" onClick={handleOpenPath} title="Abrir pasta">📁 Pasta</button>
          <button
            className={`ghost ${expanded ? 'active' : ''}`}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? '▲ Recolher' : '▼ Ver detalhes'}
          </button>
          <button className="ghost danger" onClick={handleDelete} title="Excluir">✕</button>
        </div>
      </div>

      {/* ── Detalhes expansíveis ── */}
      {expanded && (
        <div className="report-card-body">
          {summary.length === 0 ? (
            <p className="muted" style={{ padding: '16px 0' }}>Sem dados de detalhe disponíveis.</p>
          ) : (
            <div className="broker-list">
              {summary.map((item, idx) => {
                const isOpen = expandedBroker === idx;
                const vendedores = item.vendedoresDetalhes || 
                                   (item.nomesVendedores || []).map(n => ({ nome: n, total: null }));
                return (
                  <div key={idx} className="broker-item">
                    <div
                      className="broker-row"
                      onClick={() => setExpandedBroker(isOpen ? null : idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setExpandedBroker(isOpen ? null : idx)}
                    >
                      <div className="broker-name">
                        <span className="broker-chevron">{isOpen ? '▾' : '▸'}</span>
                        {item.corretora}
                      </div>
                      <div className="broker-right">
                        <span className="broker-count">{Number(item.vendedores || 0)} vend.</span>
                        <span className="broker-total">{formatBRL(item.totalConsolidado)}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="vendor-list">
                        {vendedores.length === 0 ? (
                          <p className="muted vendor-empty">Nenhum vendedor individual registrado para esta corretora.</p>
                        ) : (
                          vendedores.map((v, vi) => (
                            <div key={vi} className="vendor-row" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <div className="vendor-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="vendor-icon">♟</span>
                                <span className="vendor-name">{v.nome}</span>
                              </div>
                              {v.total !== null && v.total !== undefined && (
                                <span className="vendor-total-val" style={{ fontWeight: '600', color: '#0564d8', fontSize: '12px' }}>
                                  {formatBRL(v.total)}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Rodapé do detalhe */}
          <div className="report-card-footer">
            <span className="muted" style={{ fontSize: 11 }}>
              Gerado em {new Date(report.createdAt).toLocaleString('pt-BR')} · {Number(report.inputFiles || 0)} arquivo(s) de entrada
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Página principal do Dashboard
───────────────────────────────────────────────*/
export default function Dashboard({ savedReports, onNavigate, refreshHistory }) {
  const handleDelete = () => refreshHistory();

  return (
    <div id="page-dashboard" className="page active">
      <div className="page-title">
        <div>
          <h1>Dashboard</h1>
          <p>Acompanhe os relatórios gerados mês a mês.</p>
        </div>
        <button className="primary" onClick={() => onNavigate('new-report')}>
          ＋ Novo relatório
        </button>
      </div>

      {/* ── Gráfico comparativo ── */}
      {savedReports.length > 0 && (
        <section className="panel">
          <div className="panel-head" style={{ marginBottom: 16 }}>
            <div>
              <h2>Comparativo mensal</h2>
              <p>Valor total de comissões processadas por mês.</p>
            </div>
          </div>
          <MonthLineChart reports={savedReports} />
          <div style={{ marginTop: 24 }}>
            <MonthComparison reports={savedReports} />
          </div>
        </section>
      )}

      {/* ── Lista de relatórios ── */}
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: 16 }}>
          <div>
            <h2>Relatórios por mês</h2>
            <p>Clique em "Ver detalhes" para expandir os dados de cada mês.</p>
          </div>
        </div>

        {savedReports.length === 0 ? (
          <div className="empty-state">Nenhum relatório salvo ainda. Crie um novo para começar!</div>
        ) : (
          <div className="report-card-list">
            {savedReports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
