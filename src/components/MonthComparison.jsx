import React, { useState, useEffect } from 'react';
import { formatBRL } from '../App';

/* ──────────────────────────────────────────────────────────────
   MonthComparison
   Compara dois meses lado a lado, corretora por corretora,
   vendedor por vendedor, e gera insights automáticos.
────────────────────────────────────────────────────────────── */

/* Delta badge — verde se subiu, vermelho se caiu */
function Delta({ value, percent }) {
  if (value === 0) return <span className="cmp-delta neutral">→ sem alteração</span>;
  const up = value > 0;
  return (
    <span className={`cmp-delta ${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {formatBRL(Math.abs(value))}
      {percent !== null && ` (${Math.abs(percent).toFixed(1)}%)`}
    </span>
  );
}

/* Barra de progresso horizontal para exibir valor relativo */
function Bar({ ratio, color }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(Math.max(ratio, 0), 1) * 100), 80);
    return () => clearTimeout(t);
  }, [ratio]);
  return (
    <div className="cmp-bar-track">
      <div
        className="cmp-bar-fill"
        style={{
          width: `${w}%`,
          background: color,
          transition: 'width 0.7s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      />
    </div>
  );
}

/* Gera os insights automáticos baseados na diff entre dois relatórios */
function generateInsights(baseReport, cmpReport) {
  const insights = [];
  const baseSummary = baseReport.summary || [];
  const cmpSummary  = cmpReport.summary  || [];

  const baseMap = new Map(baseSummary.map(i => [i.corretora, i]));
  const cmpMap  = new Map(cmpSummary.map(i => [i.corretora, i]));

  const totalBase = Number(baseReport.totalValue || 0);
  const totalCmp  = Number(cmpReport.totalValue  || 0);
  const totalDiff = totalCmp - totalBase;

  // 1) Resumo global
  if (totalDiff > 0) {
    insights.push({
      type: 'up',
      text: `O total de comissões cresceu ${formatBRL(totalDiff)} (${((totalDiff / (totalBase || 1)) * 100).toFixed(1)}%) em relação ao mês anterior.`,
    });
  } else if (totalDiff < 0) {
    insights.push({
      type: 'down',
      text: `O total de comissões caiu ${formatBRL(Math.abs(totalDiff))} (${(Math.abs(totalDiff) / (totalBase || 1) * 100).toFixed(1)}%) em relação ao mês anterior.`,
    });
  } else {
    insights.push({ type: 'neutral', text: 'O total de comissões permaneceu igual entre os dois meses.' });
  }

  // 2) Novas corretoras
  const novas = [...cmpMap.keys()].filter(k => !baseMap.has(k));
  if (novas.length > 0) {
    insights.push({
      type: 'up',
      text: `Nova${novas.length > 1 ? 's' : ''} corretora${novas.length > 1 ? 's' : ''} em ${cmpReport.label}: ${novas.join(', ')}. Isso contribuiu com ${formatBRL(novas.reduce((s, k) => s + Number(cmpMap.get(k)?.totalConsolidado || 0), 0))}.`,
    });
  }

  // 3) Corretoras que sumiram
  const sumidas = [...baseMap.keys()].filter(k => !cmpMap.has(k));
  if (sumidas.length > 0) {
    insights.push({
      type: 'down',
      text: `A${sumidas.length > 1 ? 's' : ''} corretora${sumidas.length > 1 ? 's' : ''} ${sumidas.join(', ')} não aparece${sumidas.length > 1 ? 'm' : ''} em ${cmpReport.label}, representando uma redução de ${formatBRL(sumidas.reduce((s, k) => s + Number(baseMap.get(k)?.totalConsolidado || 0), 0))}.`,
    });
  }

  // 4) Maiores aumentos e quedas por corretora
  const diffs = [];
  for (const [corretora, cmpItem] of cmpMap.entries()) {
    const baseItem = baseMap.get(corretora);
    if (!baseItem) continue;
    const diff = Number(cmpItem.totalConsolidado || 0) - Number(baseItem.totalConsolidado || 0);
    if (diff !== 0) diffs.push({ corretora, diff, cmpItem, baseItem });
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  for (const { corretora, diff, cmpItem, baseItem } of diffs.slice(0, 4)) {
    if (diff > 0) {
      // Verifica novos vendedores que apareceram
      const baseVends = new Map((baseItem.vendedoresDetalhes || []).map(v => [v.nome, v.total]));
      const novosVends = (cmpItem.vendedoresDetalhes || []).filter(v => !baseVends.has(v.nome));
      const aumentouVend = (cmpItem.vendedoresDetalhes || [])
        .filter(v => baseVends.has(v.nome) && v.total > baseVends.get(v.nome))
        .sort((a, b) => (b.total - baseVends.get(b.nome)) - (a.total - baseVends.get(a.nome)));

      let detalhe = '';
      if (novosVends.length > 0) {
        detalhe += ` Novos vendedores: ${novosVends.map(v => `${v.nome} (${formatBRL(v.total)})`).join(', ')}.`;
      }
      if (aumentouVend.length > 0) {
        const top = aumentouVend[0];
        detalhe += ` ${top.nome} aumentou ${formatBRL(top.total - baseVends.get(top.nome))}.`;
      }
      insights.push({
        type: 'up',
        text: `${corretora} cresceu ${formatBRL(diff)}.${detalhe}`,
      });
    } else {
      // Queda
      const cmpVends = new Map((cmpItem.vendedoresDetalhes || []).map(v => [v.nome, v.total]));
      const saidosVends = (baseItem.vendedoresDetalhes || []).filter(v => !cmpVends.has(v.nome));
      const cairamVend = (cmpItem.vendedoresDetalhes || [])
        .filter(v => {
          const prev = (baseItem.vendedoresDetalhes || []).find(b => b.nome === v.nome);
          return prev && v.total < prev.total;
        })
        .sort((a, b) => {
          const prevA = (baseItem.vendedoresDetalhes || []).find(x => x.nome === a.nome)?.total || 0;
          const prevB = (baseItem.vendedoresDetalhes || []).find(x => x.nome === b.nome)?.total || 0;
          return (a.total - prevA) - (b.total - prevB);
        });

      let detalhe = '';
      if (saidosVends.length > 0) {
        detalhe += ` Vendedor${saidosVends.length > 1 ? 'es' : ''} ausente${saidosVends.length > 1 ? 's' : ''}: ${saidosVends.map(v => v.nome).join(', ')}.`;
      }
      if (cairamVend.length > 0) {
        const top = cairamVend[0];
        const prev = (baseItem.vendedoresDetalhes || []).find(x => x.nome === top.nome)?.total || 0;
        detalhe += ` ${top.nome} caiu ${formatBRL(Math.abs(top.total - prev))}.`;
      }
      insights.push({
        type: 'down',
        text: `${corretora} caiu ${formatBRL(Math.abs(diff))}.${detalhe}`,
      });
    }
  }

  return insights;
}

/* ── Componente principal ── */
export default function MonthComparison({ reports }) {
  const [open, setOpen] = useState(false);
  const [baseId, setBaseId] = useState('');
  const [cmpId,  setCmpId]  = useState('');
  const [entered, setEntered] = useState(false);

  const sorted = [...reports].sort((a, b) => b.month.localeCompare(a.month));

  useEffect(() => {
    if (sorted.length >= 2 && !baseId && !cmpId) {
      setBaseId(sorted[1].id);
      setCmpId(sorted[0].id);
    }
  }, [reports]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setEntered(true), 60);
      return () => clearTimeout(t);
    } else {
      setEntered(false);
    }
  }, [open]);

  const baseReport = reports.find(r => r.id === baseId);
  const cmpReport  = reports.find(r => r.id === cmpId);

  const canCompare = baseReport && cmpReport && baseReport.id !== cmpReport.id;

  // Calcula max total para normalizar as barras
  const maxTotal = canCompare
    ? Math.max(Number(baseReport.totalValue || 0), Number(cmpReport.totalValue || 0), 1)
    : 1;

  // Mescla corretoras dos dois meses
  const allCorretoras = canCompare
    ? [...new Set([
        ...(baseReport.summary || []).map(i => i.corretora),
        ...(cmpReport.summary  || []).map(i => i.corretora),
      ])].sort()
    : [];

  const baseMap = canCompare ? new Map((baseReport.summary || []).map(i => [i.corretora, i])) : new Map();
  const cmpMap  = canCompare ? new Map((cmpReport.summary  || []).map(i => [i.corretora, i])) : new Map();

  const insights = canCompare ? generateInsights(baseReport, cmpReport) : [];

  const iconFor = type => type === 'up' ? '▲' : type === 'down' ? '▼' : '→';

  return (
    <div className="cmp-wrapper">
      {/* ── Trigger ── */}
      <button
        className={`cmp-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="cmp-toggle-icon">{open ? '▲' : '🔍'}</span>
        {open ? 'Fechar análise comparativa' : 'Ver análise comparativa entre meses'}
        {!open && reports.length >= 2 && (
          <span className="cmp-toggle-badge">{reports.length} meses disponíveis</span>
        )}
      </button>

      {/* ── Painel ── */}
      {open && (
        <div className={`cmp-panel ${entered ? 'in' : ''}`}>

          {/* Seletores de mês */}
          <div className="cmp-selectors">
            <div className="cmp-sel-group">
              <label className="cmp-sel-label">📅 Mês base (anterior)</label>
              <select
                className="cmp-select"
                value={baseId}
                onChange={e => setBaseId(e.target.value)}
              >
                <option value="">Selecionar mês…</option>
                {sorted.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="cmp-arrow-sep">→</div>

            <div className="cmp-sel-group">
              <label className="cmp-sel-label">📅 Mês de comparação</label>
              <select
                className="cmp-select"
                value={cmpId}
                onChange={e => setCmpId(e.target.value)}
              >
                <option value="">Selecionar mês…</option>
                {sorted.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!canCompare && (
            <p className="cmp-hint">Selecione dois meses diferentes para ver a comparação.</p>
          )}

          {canCompare && (
            <>
              {/* ── Totais gerais ── */}
              <div className="cmp-totals">
                <div className="cmp-total-card base">
                  <span className="cmp-total-label">{baseReport.label}</span>
                  <span className="cmp-total-value">{formatBRL(Number(baseReport.totalValue || 0))}</span>
                  <Bar ratio={Number(baseReport.totalValue || 0) / maxTotal} color="rgba(99,160,255,0.7)" />
                </div>

                <div className="cmp-total-middle">
                  <Delta
                    value={Number(cmpReport.totalValue || 0) - Number(baseReport.totalValue || 0)}
                    percent={
                      baseReport.totalValue
                        ? ((Number(cmpReport.totalValue || 0) - Number(baseReport.totalValue || 0)) / Number(baseReport.totalValue)) * 100
                        : null
                    }
                  />
                </div>

                <div className="cmp-total-card cmp">
                  <span className="cmp-total-label">{cmpReport.label}</span>
                  <span className="cmp-total-value">{formatBRL(Number(cmpReport.totalValue || 0))}</span>
                  <Bar ratio={Number(cmpReport.totalValue || 0) / maxTotal} color="rgba(56,215,150,0.7)" />
                </div>
              </div>

              {/* ── Corretoras lado a lado ── */}
              <div className="cmp-section-title">Corretoras</div>
              <div className="cmp-broker-table">
                <div className="cmp-broker-head">
                  <span>{baseReport.label}</span>
                  <span className="cmp-broker-name-col">Corretora</span>
                  <span>{cmpReport.label}</span>
                </div>

                {allCorretoras.map(corretora => {
                  const b = baseMap.get(corretora);
                  const c = cmpMap.get(corretora);
                  const bVal = Number(b?.totalConsolidado || 0);
                  const cVal = Number(c?.totalConsolidado || 0);
                  const diff = cVal - bVal;
                  const maxRow = Math.max(bVal, cVal, 1);
                  const isNew  = !b && !!c;
                  const isGone = !!b && !c;

                  return (
                    <div key={corretora} className={`cmp-broker-row ${isNew ? 'is-new' : ''} ${isGone ? 'is-gone' : ''}`}>
                      {/* Base */}
                      <div className="cmp-broker-cell left">
                        {b ? (
                          <>
                            <Bar ratio={bVal / maxRow} color="rgba(99,160,255,0.55)" />
                            <span className="cmp-cell-val">{formatBRL(bVal)}</span>
                          </>
                        ) : (
                          <span className="cmp-cell-absent">—</span>
                        )}
                      </div>

                      {/* Nome + delta */}
                      <div className="cmp-broker-name-cell">
                        <span className="cmp-bname">{corretora}</span>
                        {isNew  && <span className="cmp-tag new">Nova</span>}
                        {isGone && <span className="cmp-tag gone">Ausente</span>}
                        {!isNew && !isGone && (
                          <Delta value={diff} percent={bVal ? (diff / bVal) * 100 : null} />
                        )}
                      </div>

                      {/* Comparação */}
                      <div className="cmp-broker-cell right">
                        {c ? (
                          <>
                            <span className="cmp-cell-val">{formatBRL(cVal)}</span>
                            <Bar ratio={cVal / maxRow} color="rgba(56,215,150,0.55)" />
                          </>
                        ) : (
                          <span className="cmp-cell-absent">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Insights automáticos ── */}
              {insights.length > 0 && (
                <>
                  <div className="cmp-section-title" style={{ marginTop: 24 }}>
                    💡 Análise automática
                  </div>
                  <div className="cmp-insights">
                    {insights.map((ins, i) => (
                      <div
                        key={i}
                        className={`cmp-insight ${ins.type}`}
                        style={{
                          opacity: entered ? 1 : 0,
                          transform: entered ? 'none' : 'translateY(8px)',
                          transition: `opacity 0.4s ease ${0.15 + i * 0.07}s, transform 0.4s ease ${0.15 + i * 0.07}s`,
                        }}
                      >
                        <span className="cmp-insight-icon">{iconFor(ins.type)}</span>
                        <span>{ins.text}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
