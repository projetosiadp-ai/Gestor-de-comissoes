import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Trash2, Percent, Building, Globe,
  HelpCircle, AlertCircle, CheckCircle, RefreshCw, Info
} from 'lucide-react';

import { getCorretorasConfig } from '../services/configService';
import { getCommissionRules, saveCommissionRules } from '../services/commissionRulesService';
import { MAX_PARCELA } from '../lib/core/commission-rules.mjs';

const GLOBAL_KEY = '__default__';

export default function CommissionRules({ addLog }) {
  const [rules, setRules] = useState({ default: {}, brokers: {} });
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(GLOBAL_KEY);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const [newParcela, setNewParcela] = useState('');
  const [newPercent, setNewPercent] = useState('');

  const log = (type, msg) => { if (addLog) addLog(type, msg); };

  useEffect(() => {
    (async () => {
      try {
        const [config, storedRules] = await Promise.all([getCorretorasConfig(), getCommissionRules()]);
        setBrokers(Object.keys(config || {}).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        setRules({ default: storedRules.default || {}, brokers: storedRules.brokers || {} });
      } catch (err) {
        log('error', 'Erro ao carregar regras de comissão: ' + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (updated) => {
    const previous = rules;
    setRules(updated);
    try {
      await saveCommissionRules(updated);
      setStatus({ type: 'success', message: 'Regras de comissão salvas com sucesso!' });
      log('success', 'Regras de comissão salvas.');
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setRules(previous);
      setStatus({ type: 'error', message: 'Erro ao salvar: ' + err.message });
      log('error', 'Falha ao salvar regras de comissão: ' + err.message);
    }
  };

  const currentRules = selected === GLOBAL_KEY
    ? (rules.default || {})
    : (rules.brokers?.[selected] || {});

  const updateCurrentRules = (nextRuleMap) => {
    if (selected === GLOBAL_KEY) {
      return persist({ ...rules, default: nextRuleMap });
    }
    const nextBrokers = { ...(rules.brokers || {}) };
    if (Object.keys(nextRuleMap).length === 0) delete nextBrokers[selected];
    else nextBrokers[selected] = nextRuleMap;
    return persist({ ...rules, brokers: nextBrokers });
  };

  const handleAddRule = () => {
    const parcela = String(newParcela).trim();
    const percentText = String(newPercent).trim().replace('%', '').replace(',', '.');

    if (!/^\d+$/.test(parcela) || Number(parcela) < 1 || Number(parcela) > MAX_PARCELA) {
      alert(`Informe um número de parcela entre 1 e ${MAX_PARCELA}.`);
      return;
    }
    const percent = Number(percentText);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      alert('Informe um percentual entre 0 e 100.');
      return;
    }

    setNewParcela('');
    setNewPercent('');
    updateCurrentRules({ ...currentRules, [parcela]: percent });
  };

  const handleDeleteRule = (parcela) => {
    const next = { ...currentRules };
    delete next[parcela];
    updateCurrentRules(next);
  };

  const filteredBrokers = useMemo(
    () => brokers.filter(b => b.toLowerCase().includes(searchQuery.toLowerCase())),
    [brokers, searchQuery]
  );

  const sortedRuleEntries = useMemo(
    () => Object.entries(currentRules).sort((a, b) => Number(a[0]) - Number(b[0])),
    [currentRules]
  );

  const brokerRuleCount = (broker) => Object.keys(rules.brokers?.[broker] || {}).length;

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'var(--panel)',
    color: 'var(--text)'
  };

  return (
    <div id="page-commission-rules" className="page active">
      <div className="page-title">
        <div>
          <h1>Regras de comissão</h1>
          <p>Defina o percentual esperado por parcela. O sistema avisa quando a planilha vier diferente — os valores do relatório nunca são alterados.</p>
        </div>
      </div>

      {status.message && (
        <div className={`status ${status.type}`} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{status.message}</span>
        </div>
      )}

      {loading ? (
        <div className="panel" style={{ textAlign: 'center', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <RefreshCw size={24} className="animate-spin text-blue" />
          <span className="muted">Carregando regras de comissão...</span>
        </div>
      ) : (
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: 24 }}>

          {/* Esquerda: padrão global + lista de corretoras */}
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2>Onde aplicar</h2>

            <div
              onClick={() => setSelected(GLOBAL_KEY)}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: selected === GLOBAL_KEY ? 'rgba(7, 102, 216, 0.12)' : 'var(--panel)',
                color: selected === GLOBAL_KEY ? 'var(--primary)' : 'var(--text)',
                fontWeight: selected === GLOBAL_KEY ? '700' : '500',
                border: selected === GLOBAL_KEY ? '1.5px solid var(--primary)' : '1px solid var(--line)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={14} /> Padrão (todas)
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {Object.keys(rules.default || {}).length} regra(s)
              </span>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Buscar corretora..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, width: '100%', paddingLeft: 36 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {filteredBrokers.length === 0 ? (
                <p className="muted" style={{ padding: 16, textAlign: 'center', fontSize: '13px' }}>
                  Nenhuma corretora localizada. Cadastre em "Configurar corretoras".
                </p>
              ) : (
                filteredBrokers.map(b => {
                  const count = brokerRuleCount(b);
                  const active = selected === b;
                  return (
                    <div
                      key={b}
                      onClick={() => setSelected(b)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: active ? 'rgba(7, 102, 216, 0.12)' : 'var(--panel)',
                        color: active ? 'var(--primary)' : 'var(--text)',
                        fontWeight: active ? '700' : '500',
                        border: active ? '1.5px solid var(--primary)' : '1px solid var(--line)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building size={14} style={{ opacity: active ? 1 : 0.6 }} />
                        {b}
                      </span>
                      {count > 0 && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: 'rgba(7, 102, 216, 0.15)',
                          color: 'var(--primary)'
                        }}>
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Direita: régua de parcelas */}
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>
                {selected === GLOBAL_KEY
                  ? 'Regras padrão (valem para todas as corretoras)'
                  : <>Regras de <strong>{selected}</strong></>}
              </h2>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {selected === GLOBAL_KEY
                  ? 'Aplicadas a qualquer corretora que não tenha uma regra própria para aquela parcela.'
                  : 'Estas regras têm prioridade sobre o padrão. Parcelas sem regra aqui seguem o padrão.'}
              </p>
            </div>

            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(7, 102, 216, 0.06)',
              border: '1px solid rgba(7, 102, 216, 0.25)',
              borderRadius: 8, padding: '10px 14px'
            }}>
              <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
              <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                Parcela sem regra cadastrada não é verificada. O relatório sempre mantém os valores
                originais da planilha — a divergência aparece só como aviso ao gerar.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min="1"
                max={MAX_PARCELA}
                placeholder="Parcela (ex: 1)"
                value={newParcela}
                onChange={e => setNewParcela(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRule(); }}
                style={{ ...inputStyle, width: 150 }}
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Percentual (ex: 100)"
                value={newPercent}
                onChange={e => setNewPercent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRule(); }}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                className="primary"
                onClick={handleAddRule}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> Adicionar regra
              </button>
            </div>

            <h3 style={{ fontSize: '14px', margin: '8px 0 0' }}>Régua de parcelas</h3>

            {sortedRuleEntries.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px' }} className="muted">
                <HelpCircle size={28} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: 13, textAlign: 'center' }}>
                  {selected === GLOBAL_KEY
                    ? 'Nenhuma regra padrão cadastrada.'
                    : <>Nenhuma regra própria para <strong>{selected}</strong>. Ela segue o padrão.</>}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <AnimatePresence>
                  {sortedRuleEntries.map(([parcela, percent]) => (
                    <motion.div
                      key={parcela}
                      initial={{ opacity: 0, scale: 0.85, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85, y: -5 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: '13px',
                        color: 'var(--text)'
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Parcela {parcela}</span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        fontWeight: 800, color: 'var(--primary)'
                      }}>
                        {percent}<Percent size={12} />
                      </span>
                      <button
                        className="ghost danger"
                        onClick={() => handleDeleteRule(parcela)}
                        style={{ padding: '2px 4px', borderRadius: 4, lineHeight: 0 }}
                        title="Remover regra"
                      >
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
