import React, { useState, useEffect, useRef } from 'react';
import { formatBRL } from '../App';

/* ─────────────────────────────────────────────
   Gráfico de barras SVG animado — comparativo mensal
   • Barras crescem do zero ao carregar (CSS + transform)
   • Linha de tendência com gradiente
   • Tooltip flutuante personalizado
   • Grid horizontal sutil
────────────────────────────────────────────── */
export default function MonthLineChart({ reports }) {
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

/* ── Helper: animated bar rect with hover effect ── */
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
