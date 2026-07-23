import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Plus, Trash2, X, Tag, Settings, Building, 
  HelpCircle, AlertCircle, CheckCircle, RefreshCw
} from 'lucide-react';

import { getCorretorasConfig, saveCorretorasConfig } from '../services/configService';
import { useAuth } from '../auth/AuthContext';
import { hasTeamKey, generateTeamKey } from '../services/teamKeyService';

export default function ConfigCorretoras({ addLog }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBroker, setSelectedBroker] = useState('');
  const [newBrokerName, setNewBrokerName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });

  const session = useAuth();
  const [teamKeyReady, setTeamKeyReady] = useState(null);
  const [generatingKey, setGeneratingKey] = useState(false);

  useEffect(() => {
    hasTeamKey().then(setTeamKeyReady).catch(() => setTeamKeyReady(false));
  }, []);

  const handleGenerateTeamKey = async () => {
    setGeneratingKey(true);
    try {
      await generateTeamKey(session.actor);
      setTeamKeyReady(true);
      log('success', 'Chave de criptografia da equipe gerada com sucesso.');
    } catch (err) {
      log('error', 'Falha ao gerar chave de equipe: ' + err.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  // Debounced search query states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  // Debounce search input (200ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getCorretorasConfig();
      setConfig(data || {});
      
      // Select first broker if available
      const keys = Object.keys(data || {});
      if (keys.length > 0 && !selectedBroker) {
        setSelectedBroker(keys[0]);
      }
    } catch (err) {
      log('error', 'Erro ao carregar configurações de corretoras: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (updatedConfig) => {
    try {
      await saveCorretorasConfig(updatedConfig);
      setConfig(updatedConfig);
      setStatus({ type: 'success', message: 'Configurações de corretoras salvas com sucesso!' });
      log('success', 'Configurações de corretoras salvas e espelhadas para o sistema.');
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Erro ao salvar configurações: ' + err.message });
      log('error', 'Falha ao salvar corretoras: ' + err.message);
    }
  };

  const handleAddBroker = () => {
    const name = newBrokerName.trim().toUpperCase();
    if (!name) return;
    if (config[name]) {
      alert('Esta corretora já existe!');
      return;
    }
    const updated = { ...config, [name]: [name] };
    setNewBrokerName('');
    setSelectedBroker(name);
    handleSave(updated);
  };

  const handleDeleteBroker = (brokerToDelete) => {
    if (!confirm(`Excluir a corretora "${brokerToDelete}" e todas as suas regras de associação?`)) return;
    const updated = { ...config };
    delete updated[brokerToDelete];
    
    // Select another broker
    const remaining = Object.keys(updated);
    setSelectedBroker(remaining.length > 0 ? remaining[0] : '');
    handleSave(updated);
  };

  const handleAddAlias = () => {
    const alias = newAlias.trim();
    if (!alias || !selectedBroker) return;
    
    const aliases = config[selectedBroker] || [];
    // Case-insensitive check
    if (aliases.map(a => a.toUpperCase()).includes(alias.toUpperCase())) {
      alert('Esta associação já existe!');
      return;
    }
    
    const updated = {
      ...config,
      [selectedBroker]: [...aliases, alias]
    };
    setNewAlias('');
    handleSave(updated);
  };

  const handleDeleteAlias = (aliasToDelete) => {
    if (!selectedBroker) return;
    const aliases = config[selectedBroker] || [];
    const updatedAliases = aliases.filter(a => a !== aliasToDelete);
    const updated = {
      ...config,
      [selectedBroker]: updatedAliases
    };
    handleSave(updated);
  };

  const brokers = Object.keys(config);

  // Filter brokers dynamically with debounce
  const filteredBrokers = useMemo(() => {
    return brokers.filter(b => b.toLowerCase().includes(debouncedQuery.toLowerCase()));
  }, [brokers, debouncedQuery]);

  return (
    <div id="page-config-corretoras" className="page active">
      <div className="page-title">
        <div>
          <h1>Configurar Corretoras</h1>
          <p>Gerencie as corretoras parceiras e as regras de associação/apelidos para leitura automatizada.</p>
        </div>
      </div>

      {status.message && (
        <div className={`status ${status.type}`} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{status.message}</span>
        </div>
      )}

      {session.isAdmin && teamKeyReady === false && (
        <div className="panel" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <b>Chave de criptografia da equipe não configurada</b>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              Sem essa chave, novos relatórios não sincronizam o ranking de vendedores com a nuvem (ficam salvos só localmente).
              Gere a chave uma única vez.
            </p>
          </div>
          <button className="primary" disabled={generatingKey} onClick={handleGenerateTeamKey}>
            {generatingKey ? 'Gerando...' : 'Gerar chave de equipe'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel" style={{ textAlign: 'center', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <RefreshCw size={24} className="animate-spin text-blue" />
          <span className="muted">Carregando configurações de corretoras...</span>
        </div>
      ) : (
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: 24 }}>
          
          {/* Coluna da esquerda: Lista de Corretoras com Busca Debounce */}
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2>Lista de Corretoras</h2>
            
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Buscar corretora..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: 'var(--panel)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Nova corretora..."
                value={newBrokerName}
                onChange={e => setNewBrokerName(e.target.value)}
                style={{
                  flexGrow: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: 'var(--panel)',
                  color: 'var(--text)'
                }}
              />
              <button 
                className="primary" 
                onClick={handleAddBroker} 
                style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="broker-list-items" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {filteredBrokers.length === 0 ? (
                <p className="muted" style={{ padding: 16, textAlign: 'center', fontSize: '13px' }}>Nenhuma corretora localizada.</p>
              ) : (
                filteredBrokers.map(b => (
                  <div
                    key={b}
                    onClick={() => setSelectedBroker(b)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: selectedBroker === b ? 'rgba(7, 102, 216, 0.12)' : 'var(--panel)',
                      color: selectedBroker === b ? 'var(--primary)' : 'var(--text)',
                      fontWeight: selectedBroker === b ? '700' : '500',
                      border: selectedBroker === b ? '1.5px solid var(--primary)' : '1px solid var(--line)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={14} style={{ opacity: selectedBroker === b ? 1 : 0.6 }} />
                      {b}
                    </span>
                    <button
                      className="ghost danger"
                      onClick={(e) => { e.stopPropagation(); handleDeleteBroker(b); }}
                      style={{ padding: '4px', borderRadius: '4px' }}
                      title="Excluir Corretora"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Coluna da direita: Apelidos / Regras de Associação com Tags Animadas */}
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedBroker ? (
              <>
                <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: '16px' }}>Regras de Associação para <strong>{selectedBroker}</strong></h2>
                  <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Qualquer planilha com os nomes listados abaixo será consolidada sob a corretora <strong>{selectedBroker}</strong>.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Adicionar nome na planilha ou apelido..."
                    value={newAlias}
                    onChange={e => setNewAlias(e.target.value)}
                    style={{
                      flexGrow: 1,
                      padding: '8px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      background: 'var(--panel)',
                      color: 'var(--text)'
                    }}
                  />
                  <button 
                    className="primary" 
                    onClick={handleAddAlias} 
                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                </div>

                <h3 style={{ fontSize: '14px', margin: '8px 0 0' }}>Nomes e Apelidos Vinculados</h3>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <AnimatePresence>
                    {(config[selectedBroker] || []).length === 0 ? (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="muted" 
                        style={{ fontSize: '13px' }}
                      >
                        Nenhum nome de associação cadastrado. Adicione pelo menos um nome para que a leitura funcione.
                      </motion.p>
                    ) : (
                      (config[selectedBroker] || []).map(a => (
                        <motion.div
                          key={a}
                          initial={{ opacity: 0, scale: 0.85, y: 5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.85, y: -5 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            backgroundColor: 'var(--bg)',
                            border: '1px solid var(--line)',
                            borderRadius: '16px',
                            padding: '6px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: '12px',
                            fontWeight: '600',
                            color: 'var(--text)'
                          }}
                        >
                          <Tag size={11} className="text-muted" />
                          <span>{a}</span>
                          <span
                            onClick={() => handleDeleteAlias(a)}
                            style={{ 
                              cursor: 'pointer', 
                              color: 'var(--red)', 
                              fontWeight: 'bold', 
                              fontSize: 14, 
                              marginLeft: 4,
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title="Remover Associação"
                          >
                            <X size={12} />
                          </span>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300, gap: '10px' }} className="muted">
                <HelpCircle size={32} style={{ opacity: 0.5 }} />
                <span>Selecione ou crie uma corretora na coluna da esquerda para configurar suas regras.</span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
