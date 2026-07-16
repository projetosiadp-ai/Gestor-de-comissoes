import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Building, Users, DollarSign, FolderOpen, 
  ChevronRight, ChevronDown, Trash2, Calendar, FileText, ChevronLeft,
  FileDown, Table, History, PlusCircle
} from 'lucide-react';
import { formatBRL } from '../App';

/* ─────────────────────────────────────────────
   Gráfico de barras SVG animado — comparativo mensal
   • Barras crescem do zero ao carregar (CSS + transform)
   • Linha de tendência com gradiente
   • Tooltip flutuante personalizado
   • Grid horizontal sutil
────────────────────────────────────────────── */
function BarRect({ x, y, width, height, animated, onEnter, onLeave }) {
  const [hovered, setHovered] = useState(false);

  return (
    <rect
      x={x} y={y}
      width={width} height={height}
      rx={6} ry={6}
      fill={hovered ? 'url(#barGradHov)' : 'url(#barGrad)'}
      style={{
        transformBox: 'fill-box',
        transformOrigin: 'bottom center',
        transform: animated ? 'scaleY(1)' : 'scaleY(0)',
        transition: 'transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s',
        filter: hovered ? 'brightness(1.25)' : 'brightness(1)',
        cursor: 'pointer',
      }}
      onMouseEnter={() => { setHovered(true); onEnter(); }}
      onMouseLeave={() => { setHovered(false); onLeave(); }}
    />
  );
}

function MonthLineChart({ reports }) {
  const [animated, setAnimated] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { x, y, label, value }
  const containerRef = useRef(null);

  // Trigger animation shortly after mount
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  if (!reports || reports.length === 0) return null;

  const data = [...reports]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-9)
    .map(r => ({
      label: r.label.replace(/^(\w{3})\w+\//, '$1/'),
      value: Number(r.totalValue || 0),
    }));

  // SVG layout constants
  const W = 860;
  const H = 280;
  const padL = 80;
  const padR = 30;
  const padT = 30;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const steps = 5;
  const stepVal = Math.ceil(maxVal / steps / 1000) * 1000 || 1000;
  const gridMax = stepVal * steps;

  const barCount = data.length;
  const groupW = chartW / barCount;
  const barW = Math.min(groupW * 0.55, 56);

  // Bar x center
  const bx = (i) => padL + groupW * i + groupW / 2;
  // Bar height (0..chartH)
  const bh = (v) => (v / gridMax) * chartH;
  // Bar y top
  const by = (v) => padT + chartH - bh(v);

  // Line path through bar tops
  const linePts = data.map((d, i) => ({ x: bx(i), y: by(d.value) }));
  const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = [
    ...linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`),
    `L${linePts[linePts.length - 1].x},${padT + chartH}`,
    `L${linePts[0].x},${padT + chartH}`,
    'Z',
  ].join(' ');

  // Y-axis tick labels
  const yTicks = Array.from({ length: steps + 1 }, (_, i) => i * stepVal);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', overflowX: 'auto', position: 'relative', userSelect: 'none' }}
    >
      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -110%)',
            background: 'linear-gradient(135deg, #1a1f3c 0%, #0f1629 100%)',
            border: '1px solid rgba(99,160,255,0.35)',
            borderRadius: 10,
            padding: '8px 14px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: 11, color: '#8ba3d4', marginBottom: 3 }}>{tooltip.label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#63a0ff' }}>{formatBRL(tooltip.value)}</div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', minWidth: 420, display: 'block' }}
      >
        <defs>
          {/* Bar gradient */}
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#1a4fa8" stopOpacity="0.85" />
          </linearGradient>
          {/* Bar hover gradient */}
          <linearGradient id="barGradHov" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ab3ff" stopOpacity="1" />
            <stop offset="100%" stopColor="#2f67cc" stopOpacity="0.9" />
          </linearGradient>
          {/* Area gradient */}
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8fff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4f8fff" stopOpacity="0" />
          </linearGradient>
          {/* Glow filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Clip for bars (animation) */}
          <clipPath id="barClip">
            <rect x="0" y="0" width={W} height={padT + chartH} />
          </clipPath>

          {/* Animation keyframes via style */}
          <style>{`
            .bar-animated {
              transform-box: fill-box;
              transform-origin: bottom center;
              transform: scaleY(0);
              transition: transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .bar-animated.in {
              transform: scaleY(1);
            }
            .dot-animated {
              opacity: 0;
              transition: opacity 0.3s ease;
            }
            .dot-animated.in {
              opacity: 1;
            }
            .line-animated {
              stroke-dasharray: 2000;
              stroke-dashoffset: 2000;
              transition: stroke-dashoffset 1s ease 0.3s;
            }
            .line-animated.in {
              stroke-dashoffset: 0;
            }
          `}</style>
        </defs>

        {/* ── Background ── */}
        <rect x={padL} y={padT} width={chartW} height={chartH} rx={4}
          fill="rgba(255,255,255,0.02)" />

        {/* ── Horizontal grid lines ── */}
        {yTicks.map((tick) => {
          const yy = padT + chartH - (tick / gridMax) * chartH;
          return (
            <g key={tick}>
              <line
                x1={padL} y1={yy} x2={padL + chartW} y2={yy}
                stroke="rgba(255,255,255,0.07)" strokeWidth={1}
                strokeDasharray={tick === 0 ? '0' : '4 4'}
              />
              <text
                x={padL - 8} y={yy + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.35)"
                fontSize={11}
                fontFamily="'Segoe UI', Arial, sans-serif"
              >
                {tick === 0 ? 'R$ 0' : `${(tick / 1000).toFixed(0)}k`}
              </text>
            </g>
          );
        })}

        {/* ── Area fill (subtle) ── */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* ── Bars ── */}
        <g clipPath="url(#barClip)">
          {data.map((d, i) => {
            const x = bx(i) - barW / 2;
            const barHeight = Math.max(bh(d.value), 2);
            const y = padT + chartH - barHeight;
            return (
              <g key={i}>
                {/* Shadow bar (static, for depth) */}
                <rect
                  x={x + 3} y={y + 4}
                  width={barW} height={barHeight}
                  rx={6} ry={6}
                  fill="rgba(0,0,0,0.25)"
                />
                {/* Actual bar */}
                <BarRect
                  x={x} y={y} width={barW} height={barHeight}
                  animated={animated}
                  onEnter={() => {
                    const svgEl = containerRef.current?.querySelector('svg');
                    if (!svgEl) return;
                    const rect = svgEl.getBoundingClientRect();
                    const svgScale = rect.width / W;
                    setTooltip({
                      x: bx(i) * svgScale,
                      y: (y - 4) * svgScale,
                      label: d.label,
                      value: d.value,
                    });
                  }}
                  onLeave={() => setTooltip(null)}
                />
                {/* Value label on top of bar (if space) */}
                {barHeight > 28 && (
                  <text
                    x={bx(i)} y={y - 6}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                    fontWeight="600"
                    fontFamily="'Segoe UI', Arial, sans-serif"
                    style={{ opacity: animated ? 1 : 0, transition: 'opacity 0.5s ease 0.7s' }}
                  >
                    {`R$ ${(d.value / 1000).toFixed(1)}k`}
                  </text>
                )}
                {/* X-axis label */}
                <text
                  x={bx(i)} y={padT + chartH + 22}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize={11}
                  fontFamily="'Segoe UI', Arial, sans-serif"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* ── Line of trend ── */}
        <path
          d={linePath}
          fill="none"
          stroke="#63a0ff"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
          className={`line-animated${animated ? ' in' : ''}`}
        />

        {/* ── Dots on line ── */}
        {linePts.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={5}
            fill="#0f1629"
            stroke="#63a0ff"
            strokeWidth={2.5}
            filter="url(#glow)"
            style={{
              opacity: animated ? 1 : 0,
              transition: `opacity 0.3s ease ${0.6 + i * 0.07}s`,
              cursor: 'pointer',
            }}
          />
        ))}

        {/* ── Axis border ── */}
        <line
          x1={padL} y1={padT} x2={padL} y2={padT + chartH + 2}
          stroke="rgba(255,255,255,0.12)" strokeWidth={1}
        />
        <line
          x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH}
          stroke="rgba(255,255,255,0.12)" strokeWidth={1}
        />
      </svg>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   MonthComparison
   Compara dois meses lado a lado, corretora por corretora,
   vendedor por vendedor, e gera insights automáticos.
────────────────────────────────────────────────────────────── */
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

function MonthComparison({ reports }) {
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

  const maxTotal = canCompare
    ? Math.max(Number(baseReport.totalValue || 0), Number(cmpReport.totalValue || 0), 1)
    : 1;

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

      {open && (
        <div className={`cmp-panel ${entered ? 'in' : ''}`}>
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

                      <div className="cmp-broker-name-cell">
                        <span className="cmp-bname">{corretora}</span>
                        {isNew  && <span className="cmp-tag new">Nova</span>}
                        {isGone && <span className="cmp-tag gone">Ausente</span>}
                        {!isNew && !isGone && (
                          <Delta value={diff} percent={bVal ? (diff / bVal) * 100 : null} />
                        )}
                      </div>

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

/* ─────────────────────────────────────────────
   Card expansível de um relatório mensal
   • Substituídos ícones Unicode por lucide-react
   • Animações suaves de expandir/recolher
 ───────────────────────────────────────────────*/
function ReportCard({ report, onDelete, isAdmin, onTrashReport }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedBroker, setExpandedBroker] = useState(null);

  const handleOpenPath = async () => {
    if (window.api?.openPath) {
      try { await window.api.openPath(report.outputRoot); }
      catch (err) { alert('Erro ao abrir pasta: ' + err.message); }
    }
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
          <button className="ghost" onClick={handleOpenPath} title="Abrir pasta" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOpen size={12} /> Pasta
          </button>
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
              <small>Comissões ({kpis.monthLabel})</small>
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
