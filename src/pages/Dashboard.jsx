import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Building, Users, DollarSign, FolderOpen, 
  ChevronRight, ChevronDown, Trash2, Calendar, FileText, ChevronLeft,
  FileDown, Table, History, PlusCircle
} from 'lucide-react';
import { formatBRL } from '../App';

import MonthLineChart from '../components/MonthLineChart';
import MonthComparison from '../components/MonthComparison';

/* ─────────────────────────────────────────────
   Card expansível de um relatório mensal
   • Substituídos ícones Unicode por lucide-react
   • Animações suaves de expandir/recolher
 ───────────────────────────────────────────────*/
function ReportCard({ report, onDelete, isAdmin, onTrashReport }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedBroker, setExpandedBroker] = useState(null);

  const handleOpenPath = async () => {
    // Web environment: no local path opening
  };

  const handleDelete = async () => {
    if (!confirm('Mover este registro para a lixeira por 30 dias? Os arquivos gerados não serão apagados.')) return;
    try {
      await onTrashReport(report.id);
      onDelete();
    } catch (err) { alert('Erro ao excluir: ' + err.message); }
  };

  const summary = report.summary || [];
  const totalValue = Number(report.totalValue || 0);

  return (
    <div className="report-card">
      {/* ── Header do card ── */}
      <div className="report-card-header">
        <div className="report-card-meta">
          <span className="report-card-month" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} className="text-blue" />
            {report.label}
          </span>
          <div className="report-card-stats">
            <span className="rc-stat">
              <span className="rc-stat-icon blue" style={{ background: 'transparent' }}><Building size={14} /></span>
              {Number(report.brokers ?? summary.length)} corretora{Number(report.brokers ?? summary.length) !== 1 ? 's' : ''}
            </span>
            <span className="rc-stat">
              <span className="rc-stat-icon cyan" style={{ background: 'transparent' }}><Users size={14} /></span>
              {Number(report.sellers || 0)} vend.
            </span>
            <span className="rc-stat rc-stat-value">
              <span className="rc-stat-icon amber" style={{ background: 'transparent' }}><DollarSign size={14} /></span>
              {formatBRL(totalValue)}
            </span>
          </div>
        </div>
        <div className="report-card-actions">

          <button
            className={`ghost ${expanded ? 'active' : ''}`}
            onClick={() => setExpanded(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {expanded ? <ChevronDown size={12} style={{ transform: 'rotate(180deg)' }} /> : <ChevronDown size={12} />}
            Detalhes
          </button>
          {isAdmin && <button className="ghost danger" onClick={handleDelete} title="Mover para a lixeira"><Trash2 size={12} /></button>}
        </div>
      </div>

      {/* ── Detalhes expansíveis ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div 
            className="report-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
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
                          <span className="broker-chevron">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          {item.corretora}
                        </div>
                        <div className="broker-right">
                          <span className="broker-count">{Number(item.vendedores || 0)} vend.</span>
                          <span className="broker-total">{formatBRL(item.totalConsolidado)}</span>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div 
                            className="vendor-list"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{ overflow: 'hidden' }}
                          >
                            {vendedores.length === 0 ? (
                              <p className="muted vendor-empty">Nenhum vendedor individual registrado para esta corretora.</p>
                            ) : (
                              vendedores.map((v, vi) => (
                                <div key={vi} className="vendor-row" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                  <div className="vendor-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="vendor-icon"><Users size={12} /></span>
                                    <span className="vendor-name">{v.nome}</span>
                                  </div>
                                  {v.total !== null && v.total !== undefined && (
                                    <span className="vendor-total-val" style={{ fontWeight: '600', color: 'var(--primary)', fontSize: '12px' }}>
                                      {formatBRL(v.total)}
                                    </span>
                                  )}
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Página principal do Dashboard
   • Grid de 4 KPIs no topo com Deltas comparativos
   • Layout de 2 colunas responsivo
 ───────────────────────────────────────────────*/
export default function Dashboard({ savedReports, onNavigate, refreshHistory, isAdmin, onTrashReport }) {
  const handleDelete = () => refreshHistory();

  // Ordena os relatórios por data de forma decrescente
  const sortedReports = useMemo(() => {
    return [...savedReports].sort((a, b) => b.month.localeCompare(a.month));
  }, [savedReports]);

  // Cálculos das métricas agregadas do topo
  const kpis = useMemo(() => {
    if (sortedReports.length === 0) return null;
    const latest = sortedReports[0];
    const prev = sortedReports[1];

    const comissoes = Number(latest.totalValue || 0);
    const prevComissoes = prev ? Number(prev.totalValue || 0) : 0;
    const diffComissoes = prevComissoes ? ((comissoes - prevComissoes) / prevComissoes) * 100 : null;

    const corretoras = Number(latest.brokers ?? latest.summary?.length ?? 0);
    const prevCorretoras = prev ? Number(prev.brokers ?? prev.summary?.length ?? 0) : 0;
    const diffCorretoras = prev ? corretoras - prevCorretoras : null;

    const vendedores = Number(latest.sellers || 0);
    const prevVendedores = prev ? Number(prev.sellers || 0) : 0;
    const diffVendedores = prev ? vendedores - prevVendedores : null;

    const media = corretoras ? comissoes / corretoras : 0;
    const prevMedia = prevCorretoras ? prevComissoes / prevCorretoras : 0;
    const diffMedia = prevMedia ? ((media - prevMedia) / prevMedia) * 100 : null;

    return {
      comissoes, diffComissoes,
      corretoras, diffCorretoras,
      vendedores, diffVendedores,
      media, diffMedia,
      monthLabel: latest.label
    };
  }, [sortedReports]);

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

      <div className="quick-actions" aria-label="Ações rápidas">
        <button onClick={() => onNavigate('new-report')}><PlusCircle size={18} /><span><b>Processar lote</b><small>Analisar e gerar relatórios</small></span></button>
        <button onClick={() => onNavigate('saved-reports')}><History size={18} /><span><b>Abrir histórico</b><small>Consultar versões anteriores</small></span></button>
        <button onClick={() => onNavigate('pdf-summary')}><FileDown size={18} /><span><b>Gerar resumo PDF</b><small>Compilar planilhas prontas</small></span></button>
        <button onClick={() => onNavigate('general-report')}><Table size={18} /><span><b>Relatório geral</b><small>Consolidar corretoras</small></span></button>
      </div>

      {/* ── Cards de KPI no Topo ── */}
      {kpis && (
        <div className="metric-grid" style={{ marginBottom: '24px' }}>
          {/* Card 1: Comissões */}
          <div className="metric">
            <div className="metric-icon blue"><TrendingUp size={24} /></div>
            <div>
              <small title={`Comissões (${kpis.monthLabel})`}>Comissões ({kpis.monthLabel})</small>
              <strong>{formatBRL(kpis.comissoes)}</strong>
              {kpis.diffComissoes !== null && (
                <span style={{ fontSize: '11px', fontWeight: '700', color: kpis.diffComissoes >= 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  {kpis.diffComissoes >= 0 ? '▲' : '▼'} {Math.abs(kpis.diffComissoes).toFixed(1)}% vs anterior
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Corretoras */}
          <div className="metric">
            <div className="metric-icon cyan"><Building size={24} /></div>
            <div>
              <small>Corretoras Ativas</small>
              <strong>{kpis.corretoras}</strong>
              {kpis.diffCorretoras !== null && (
                <span style={{ fontSize: '11px', fontWeight: '700', color: kpis.diffCorretoras >= 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  {kpis.diffCorretoras >= 0 ? '▲' : '▼'} {Math.abs(kpis.diffCorretoras)} corretora{Math.abs(kpis.diffCorretoras) !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Vendedores */}
          <div className="metric">
            <div className="metric-icon green"><Users size={24} /></div>
            <div>
              <small>Vendedores Ativos</small>
              <strong>{kpis.vendedores}</strong>
              {kpis.diffVendedores !== null && (
                <span style={{ fontSize: '11px', fontWeight: '700', color: kpis.diffVendedores >= 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  {kpis.diffVendedores >= 0 ? '▲' : '▼'} {Math.abs(kpis.diffVendedores)} vendedor{Math.abs(kpis.diffVendedores) !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Card 4: Média por Corretora */}
          <div className="metric">
            <div className="metric-icon amber"><DollarSign size={24} /></div>
            <div>
              <small>Média por Corretora</small>
              <strong>{formatBRL(kpis.media)}</strong>
              {kpis.diffMedia !== null && (
                <span style={{ fontSize: '11px', fontWeight: '700', color: kpis.diffMedia >= 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  {kpis.diffMedia >= 0 ? '▲' : '▼'} {Math.abs(kpis.diffMedia).toFixed(1)}% vs anterior
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Layout de Duas Colunas Responsivo para Gráficos e Detalhes ── */}
      {savedReports.length > 0 ? (
        <div className="dashboard-grid">
          {/* Coluna da Esquerda: Gráfico comparativo e análise detalhada */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
          </div>

          {/* Coluna da Direita: Lista de relatórios por mês */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section className="panel">
              <div className="panel-head" style={{ marginBottom: 16 }}>
                <div>
                  <h2>Relatórios por mês</h2>
                  <p>Clique em "Detalhes" para expandir os dados de cada mês.</p>
                </div>
              </div>

              <div className="report-card-list">
                {savedReports.map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onDelete={handleDelete}
                    isAdmin={isAdmin}
                    onTrashReport={onTrashReport}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          Nenhum relatório salvo ainda. Crie um novo para começar!
        </div>
      )}
    </div>
  );
}
