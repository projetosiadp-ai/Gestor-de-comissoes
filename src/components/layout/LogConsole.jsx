import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, CheckCircle2, Copy, Info, Terminal, Trash2, X } from 'lucide-react';

const FILTERS = [
  ['ALL', 'TODOS'], ['info', 'INFO'], ['success', 'SUCESSO'], ['error', 'ERRO']
];

export default function LogConsole({ logs, setLogs, visible, setVisible, filter, setFilter, filteredLogs, bodyRef, copyFeedback, onCopy, errorCount }) {
  const count = type => type === 'ALL' ? logs.length : logs.filter(log => log.type === type).length;

  return (
    <>
      <button className="log-console-trigger" onClick={() => setVisible(!visible)}>
        {visible ? <X size={20} /> : <Terminal size={20} />}
        {!visible && errorCount > 0 && <span className="badge">{errorCount}</span>}
      </button>

      <AnimatePresence>
        {visible && (
          <motion.div className="log-console-panel" initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ duration: 0.2 }}>
            <div className="log-console-header">
              <h3><Terminal size={14} /> Console de Logs</h3>
              <div className="log-console-actions">
                <button onClick={onCopy}>{copyFeedback ? <Check size={11} /> : <Copy size={11} />}{copyFeedback ? 'Copiado!' : 'Copiar'}</button>
                <button onClick={() => setLogs([])}><Trash2 size={11} /> Limpar</button>
                <button className="close" onClick={() => setVisible(false)}><X size={14} /></button>
              </div>
            </div>

            <div className="log-console-filters">
              {FILTERS.map(([type, label]) => (
                <button key={type} className={`log-filter ${type} ${filter === type ? 'active' : ''}`} onClick={() => setFilter(type)}>
                  {label} ({count(type)})
                </button>
              ))}
            </div>

            <div className="log-console-body" ref={bodyRef}>
              {filteredLogs.length === 0 ? <div className="log-empty">Nenhum log registrado para este filtro.</div> : filteredLogs.map(log => {
                const Icon = log.type === 'success' ? CheckCircle2 : log.type === 'error' ? AlertCircle : Info;
                return (
                  <div key={log.id} className="log-item">
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className={`log-type ${log.type}`}><Icon size={10} />{log.type.toUpperCase()}</span>
                    <span className="log-text">{log.message}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
