import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function parseValue(value) {
  if (!value) return null;
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return null;
  return { year: y, month: m - 1 };
}

/**
 * Seletor de mês customizado (substitui o <input type="month"> nativo do navegador,
 * cujo popover não é estilizável). Mesmo contrato de valor: string "YYYY-MM" ou "".
 */
export default function MonthPicker({ id, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(value);
  const [viewYear, setViewYear] = useState(selected?.year || new Date().getFullYear());
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (selected) setViewYear(selected.year);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = event => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    };
    const handleEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const pick = monthIndex => {
    onChange(`${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  const label = selected ? `${MONTHS_FULL[selected.month]} de ${selected.year}` : 'Selecionar mês…';

  return (
    <div className="month-picker" ref={wrapperRef}>
      <button
        type="button"
        id={id}
        className="month-picker-trigger"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
      >
        <Calendar size={16} />
        <span>{label}</span>
      </button>

      {open && (
        <div className="month-picker-panel">
          <div className="month-picker-year">
            <button type="button" onClick={() => setViewYear(y => y - 1)} aria-label="Ano anterior"><ChevronLeft size={15} /></button>
            <strong>{viewYear}</strong>
            <button type="button" onClick={() => setViewYear(y => y + 1)} aria-label="Próximo ano"><ChevronRight size={15} /></button>
          </div>

          <div className="month-picker-grid">
            {MONTHS.map((m, idx) => {
              const isSelected = selected && selected.year === viewYear && selected.month === idx;
              return (
                <button
                  type="button"
                  key={m}
                  className={`month-picker-cell ${isSelected ? 'selected' : ''}`}
                  onClick={() => pick(idx)}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="month-picker-footer">
            <button type="button" className="month-picker-link" onClick={() => { onChange(''); setOpen(false); }}>Limpar</button>
            <button
              type="button"
              className="month-picker-link"
              onClick={() => {
                const now = new Date();
                onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                setOpen(false);
              }}
            >
              Este mês
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
