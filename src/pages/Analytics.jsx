import React, { useState, useMemo } from 'react';
import { formatBRL } from '../App';

export default function Analytics({ savedReports }) {
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isListExpanded, setIsListExpanded] = useState(false);

  // Extrair meses disponíveis
  const availableMonths = useMemo(() => {
    if (!savedReports || !savedReports.length) return [];
    const monthsMap = new Map();
    savedReports.forEach(r => {
      if (r.month && r.label) {
        monthsMap.set(r.month, r.label);
      }
    });
    return Array.from(monthsMap.entries())
      .map(([val, label]) => ({ val, label }))
      .sort((a, b) => b.val.localeCompare(a.val));
  }, [savedReports]);

  // Consolidar e rankear os vendedores
  const rawRanking = useMemo(() => {
    if (!savedReports || !savedReports.length) return [];

    const filteredReports = selectedMonth === 'all' 
      ? savedReports 
      : savedReports.filter(r => r.month === selectedMonth);

    const sellersMap = new Map();

    filteredReports.forEach(report => {
      if (!report.summary) return;
      report.summary.forEach(brokerData => {
        const corretoraName = brokerData.corretora || 'Corretora não identificada';
        
        if (brokerData.vendedoresDetalhes) {
          brokerData.vendedoresDetalhes.forEach(vendedor => {
            const nome = vendedor.nome || 'Vendedor Desconhecido';
            const valor = Number(vendedor.total || 0);
            
            if (!sellersMap.has(nome)) {
              sellersMap.set(nome, {
                nome,
                total: 0,
                corretoras: new Set()
              });
            }
            
            const sellerObj = sellersMap.get(nome);
            sellerObj.total += valor;
            sellerObj.corretoras.add(corretoraName);
          });
        }
      });
    });

    return Array.from(sellersMap.values())
      .map(seller => ({
        ...seller,
        corretorasArray: Array.from(seller.corretoras).sort()
      }))
      .sort((a, b) => b.total - a.total);

  }, [savedReports, selectedMonth]);

  // Aplicar busca se houver termo
  const ranking = useMemo(() => {
    if (!searchTerm.trim()) return rawRanking;
    const term = searchTerm.toLowerCase();
    return rawRanking.filter(s => s.nome.toLowerCase().includes(term));
  }, [rawRanking, searchTerm]);

  const top3 = useMemo(() => ranking.slice(0, 3), [ranking]);
  const others = useMemo(() => ranking.slice(3), [ranking]);

  if (!savedReports || savedReports.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">Nenhum relatório salvo no histórico para gerar a análise.</div>
      </div>
    );
  }

  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="analytics-page">
      <div className="analytics-filter-bar panel">
        <div className="filter-row">
          <div className="filter-item search-field-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar vendedor por nome..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="clear-search-btn" onClick={() => setSearchTerm('')}>✕</button>
            )}
          </div>
          
          <div className="filter-item">
            <label htmlFor="monthFilter">Período:</label>
            <select 
              id="monthFilter" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="period-select"
            >
              <option value="all">Tempo Geral (Todos os meses)</option>
              {availableMonths.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {ranking.length === 0 ? (
        <div className="panel">
          <div className="empty-state">Nenhum vendedor encontrado com os filtros selecionados.</div>
        </div>
      ) : (
        <>
          {/* Se estiver buscando, ocultamos o pódio para mostrar a lista unificada com as posições originais */}
          {!isSearching ? (
            <div className="podium-container">
              {/* Posição 2 */}
              {top3[1] && (
                <div className="podium-card place-2">
                  <div className="podium-card-content">
                    <div className="podium-medal">🥈 2º Lugar</div>
                    <div className="podium-name" title={top3[1].nome}>{top3[1].nome}</div>
                    <div className="podium-value">{formatBRL(top3[1].total)}</div>
                    <div className="podium-corretoras">
                      {top3[1].corretorasArray.map(c => <span key={c} className="badge-corretora" title={c}>{c}</span>)}
                    </div>
                  </div>
                  <div className="podium-step">
                    <span className="step-number">2</span>
                  </div>
                </div>
              )}

              {/* Posição 1 */}
              {top3[0] && (
                <div className="podium-card place-1">
                  <div className="podium-card-content">
                    <div className="podium-medal">🏆 1º Lugar</div>
                    <div className="podium-name" title={top3[0].nome}>{top3[0].nome}</div>
                    <div className="podium-value">{formatBRL(top3[0].total)}</div>
                    <div className="podium-corretoras">
                      {top3[0].corretorasArray.map(c => <span key={c} className="badge-corretora" title={c}>{c}</span>)}
                    </div>
                  </div>
                  <div className="podium-step">
                    <span className="step-number">1</span>
                  </div>
                </div>
              )}

              {/* Posição 3 */}
              {top3[2] && (
                <div className="podium-card place-3">
                  <div className="podium-card-content">
                    <div className="podium-medal">🥉 3º Lugar</div>
                    <div className="podium-name" title={top3[2].nome}>{top3[2].nome}</div>
                    <div className="podium-value">{formatBRL(top3[2].total)}</div>
                    <div className="podium-corretoras">
                      {top3[2].corretorasArray.map(c => <span key={c} className="badge-corretora" title={c}>{c}</span>)}
                    </div>
                  </div>
                  <div className="podium-step">
                    <span className="step-number">3</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="search-info-header">
              Exibindo resultados da busca por "<strong>{searchTerm}</strong>" ({ranking.length} encontrado{ranking.length !== 1 ? 's' : ''})
            </div>
          )}



          {/* Demais posições / Lista Geral quando busca estiver ativa */}
          {(others.length > 0 || isSearching) && (
            <div className="panel analytics-list-panel">
              <div 
                className={`list-accordion-trigger ${isListExpanded || isSearching ? 'expanded' : ''}`}
                onClick={() => !isSearching && setIsListExpanded(v => !v)}
                style={{ cursor: isSearching ? 'default' : 'pointer' }}
              >
                <div className="accordion-title">
                  <span className="list-icon">📊</span>
                  <h3>{isSearching ? 'Lista de Resultados' : 'Demais posições'}</h3>
                  {!isSearching && (
                    <span className="badge-count">{others.length} vendedores</span>
                  )}
                </div>
                {!isSearching && (
                  <span className="accordion-chevron">
                    {isListExpanded ? '▲ Recolher' : '▼ Expandir'}
                  </span>
                )}
              </div>

              {(isListExpanded || isSearching) && (
                <div className="analytics-list">
                  {(isSearching ? ranking : others).map((seller, index) => {
                    // Descobrir a posição real dele no ranking geral
                    const realIndex = rawRanking.findIndex(s => s.nome === seller.nome);
                    const position = realIndex !== -1 ? realIndex + 1 : index + 4;
                    const isTop3 = position <= 3;

                    return (
                      <div key={seller.nome} className={`analytics-list-item ${isTop3 ? 'highlight-top' : ''}`}>
                        <div className={`analytics-list-position pos-${position}`}>
                          {position}º
                        </div>
                        <div className="analytics-list-info">
                          <div className="analytics-list-name" title={seller.nome}>{seller.nome}</div>
                          <div className="analytics-list-corretoras">
                            {seller.corretorasArray.map(c => (
                              <span key={c} className="badge-corretora" title={c}>{c}</span>
                            ))}
                          </div>
                        </div>
                        <div className="analytics-list-value">{formatBRL(seller.total)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
