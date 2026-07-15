import React, { useState, useEffect } from 'react';
import { formatBRL, escapeHtml } from '../App';

export default function NewReport({ refreshHistory, addLog }) {
  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  // Inicializa o mês de referência com o mês atual
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [outputFolder, setOutputFolder] = useState('');
  const [sortAlpha, setSortAlpha] = useState(true);
  const [convertNumbers, setConvertNumbers] = useState(true);
  
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  // Estados para detecção de duplicidades
  const [analysis, setAnalysis] = useState([]);
  const [correctedFiles, setCorrectedFiles] = useState(new Set());

  // Executa análise toda vez que a lista de arquivos mudar
  useEffect(() => {
    const analyze = async () => {
      if (selectedFiles.length > 0 && window.api && window.api.analyzeFiles) {
        try {
          const res = await window.api.analyzeFiles(selectedFiles);
          setAnalysis(res || []);
        } catch (err) {
          console.error("Erro ao analisar arquivos:", err);
        }
      } else {
        setAnalysis([]);
      }
    };
    analyze();
  }, [selectedFiles]);

  // Remove arquivos corrigidos se eles saírem da lista selecionada
  useEffect(() => {
    setCorrectedFiles(prev => {
      const next = new Set();
      prev.forEach(f => {
        if (selectedFiles.includes(f)) {
          next.add(f);
        }
      });
      return next;
    });
  }, [selectedFiles]);

  const [progress, setProgress] = useState({
    percent: 0,
    message: 'Selecione os arquivos para começar.',
    phase: 'aguardando',
    title: 'Aguardando processamento'
  });
  
  const [status, setStatus] = useState({
    type: '', // 'loading', 'success', 'error', ''
    message: ''
  });
  
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (window.api && window.api.onProgress) {
      window.api.onProgress((data) => {
        const labels = { 
          leitura: 'Lendo arquivos', 
          geracao: 'Gerando relatórios', 
          concluido: 'Concluído', 
          processando: 'Processando' 
        };
        setProgress({
          percent: Math.max(0, Math.min(100, Number(data.percent || 0))),
          message: data.message || '',
          phase: data.phase || 'processando',
          title: labels[data.phase] || 'Processando'
        });
        if (data.message) {
          if (data.phase === 'concluido') {
            log('success', data.message);
          } else {
            log('info', data.message);
          }
        }
      });
    }
  }, [addLog]);

  const addFiles = (paths) => {
    const allowed = /\.(xls|xlsx|html|htm)$/i;
    const filtered = (paths || []).filter(p => allowed.test(p));
    setSelectedFiles(prev => {
      const combined = [...prev, ...filtered];
      const next = [...new Set(combined)];
      log('info', `${filtered.length} arquivos válidos adicionados. Total na fila: ${next.length}`);
      return next;
    });
  };

  const handleSelectFiles = async () => {
    if (window.api && window.api.selectFiles) {
      const paths = await window.api.selectFiles();
      addFiles(paths);
    }
  };

  const handleSelectFolder = async () => {
    if (window.api && window.api.selectOutputFolder) {
      const folder = await window.api.selectOutputFolder();
      if (folder) {
        setOutputFolder(folder);
        log('info', `Pasta de destino selecionada: ${folder}`);
      }
    }
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    log('info', 'Fila de arquivos selecionados limpa.');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (window.api && window.api.getDroppedFilePaths) {
      const paths = window.api.getDroppedFilePaths(e.dataTransfer.files);
      addFiles(paths);
    }
  };

  const uncorrectedDuplicates = analysis.filter(f => f.hasDuplicates && !correctedFiles.has(f.filePath));
  const correctedDuplicates = analysis.filter(f => f.hasDuplicates && correctedFiles.has(f.filePath));

  const handleCorrectAll = () => {
    setCorrectedFiles(prev => {
      const next = new Set(prev);
      analysis.forEach(f => {
        if (f.hasDuplicates) {
          next.add(f.filePath);
        }
      });
      return next;
    });
    log('success', 'Duplicidades de comissão corrigidas com sucesso!');
  };

  const monthLabel = (value) => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return '';
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1))
      .replace(/^./, c => c.toUpperCase());
  };

  const handleGenerate = async () => {
    if (!reportMonth) {
      setStatus({ type: 'error', message: 'Informe o mês de referência do relatório.' });
      log('error', 'Tentativa de geração sem informar o mês de referência.');
      return;
    }
    if (!selectedFiles.length) {
      setStatus({ type: 'error', message: 'Selecione ou arraste as planilhas de comissão.' });
      log('error', 'Tentativa de geração sem selecionar arquivos de entrada.');
      return;
    }
    if (!outputFolder) {
      setStatus({ type: 'error', message: 'Escolha a pasta onde os relatórios serão salvos.' });
      log('error', 'Tentativa de geração sem pasta de destino selecionada.');
      return;
    }

    setProcessing(true);
    setResult(null);
    setProgress({
      percent: 0,
      message: 'Preparando...',
      phase: 'processando',
      title: 'Processando'
    });
    setStatus({
      type: 'loading',
      message: `Processando o relatório de ${monthLabel(reportMonth)}...`
    });
    log('info', `Iniciando geração de relatórios para ${monthLabel(reportMonth)}. Destino: ${outputFolder}`);

    try {
      if (window.api && window.api.generateReports) {
        const filesToDeduplicate = Array.from(correctedFiles);
        const filesToSkip = analysis.filter(f => f.hasDuplicates && !correctedFiles.has(f.filePath)).map(f => f.filePath);

        const res = await window.api.generateReports({
          files: selectedFiles,
          outputFolder,
          sortAlpha,
          convertNumbers,
          reportMonth,
          filesToDeduplicate,
          filesToSkip
        });

        setResult(res);
        const errorCount = res.errors?.length ? `\nArquivos com erro: ${res.errors.length}` : '';
        setStatus({
          type: 'success',
          message: `Relatório de ${monthLabel(reportMonth)} gerado e salvo no histórico.\nPasta: ${res.outputRoot}${errorCount}`
        });

        log('success', `Processamento concluído com sucesso. ${res.totalFiles} arquivos gerados.`);
        if (res.errors && res.errors.length > 0) {
          log('error', `${res.errors.length} erro(s) de leitura durante o processamento.`);
          res.errors.forEach(err => log('error', `Erro na planilha: ${err}`));
        }

        refreshHistory();
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Erro ao gerar os relatórios.'
      });
      log('error', `Erro crítico no processamento: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Cálculo das métricas de resultado, se houver
  const summary = result?.summary || [];
  const resultSellers = summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
  const resultTotalValue = summary.reduce((sum, item) => sum + Number(item.totalConsolidado || 0), 0);

  return (
    <div id="page-new-report" className="page active">
      <div className="page-title">
        <div>
          <h1>Novo relatório</h1>
          <p>Informe o mês, arraste as planilhas e gere os arquivos separados por corretora.</p>
        </div>
      </div>

      {uncorrectedDuplicates.length > 0 && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <strong style={{ color: '#991b1b', fontSize: '15px' }}>Comissão Duplicada Detectada!</strong>
          </div>
          <div style={{ color: '#7f1d1d', fontSize: '13px', lineHeight: '1.6' }}>
            Identificamos vendas PF e PJ simultâneas para as seguintes corretoras. 
            Elas <strong>não serão geradas</strong> até que a duplicidade seja corrigida para manter o total consolidado correto:
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              {uncorrectedDuplicates.map((file, idx) => (
                <li key={idx}>
                  <strong>{file.brokerName || file.fileName}</strong>: {file.duplicateCompanies.join(', ')} (Duplicado em PF e PJ)
                </li>
              ))}
            </ul>
          </div>
          <div>
            <button 
              onClick={handleCorrectAll}
              className="primary"
              style={{
                background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)',
                border: 'none',
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '6px',
                fontWeight: 'bold',
                color: '#fff'
              }}
            >
              Corrigir Duplicidades
            </button>
          </div>
        </div>
      )}

      {correctedDuplicates.length > 0 && uncorrectedDuplicates.length === 0 && (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)'
        }}>
          <span style={{ fontSize: '20px' }}>✓</span>
          <span style={{ color: '#065f46', fontSize: '13px' }}>
            <strong>Duplicidades corrigidas com sucesso!</strong> Os relatórios serão gerados mantendo apenas os registros PJ e removendo as redundâncias do PF.
          </span>
        </div>
      )}

      <section className="panel report-setup">
        <div className="date-column">
          <label htmlFor="reportMonth">Mês de referência</label>
          <input 
            id="reportMonth" 
            type="month" 
            value={reportMonth} 
            onChange={(e) => setReportMonth(e.target.value)} 
          />
          <p>O mês será usado para nomear e salvar o relatório no histórico.</p>
        </div>

        <div 
          id="reportDropzone" 
          className={`dropzone ${dragOver ? 'dragover' : ''}`}
          onClick={handleSelectFiles}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          tabIndex="0"
        >
          <div className="upload-icon">⇧</div>
          <strong>Arraste as comissões para esta área</strong>
          <span>ou clique para selecionar os arquivos</span>
          <small>.XLS · .XLSX · .HTML</small>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="selection-head">
          <div>
            <h2>Arquivos selecionados</h2>
            <p id="fileCount">
              {selectedFiles.length ? `${selectedFiles.length} arquivo(s) selecionado(s).` : 'Nenhum arquivo selecionado.'}
            </p>
          </div>
          <button id="clearFiles" className="ghost danger" onClick={handleClearFiles}>
            Limpar
          </button>
        </div>
        <div id="fileList" className="file-list">
          {selectedFiles.slice(0, 120).map((file, idx) => {
            const name = file.split(/[\\/]/).pop();
            const fileAnal = analysis.find(f => f.filePath === file);
            const hasDup = fileAnal?.hasDuplicates;
            const isCorr = correctedFiles.has(file);

            let chipStyle = {};
            let statusText = null;

            if (hasDup) {
              if (isCorr) {
                chipStyle = { border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46' };
                statusText = <span style={{ color: '#059669', fontWeight: 'bold', marginLeft: '6px' }}>[Duplicidade corrigida]</span>;
              } else {
                chipStyle = { border: '1px solid #ef4444', background: '#fef2f2', color: '#991b1b' };
                statusText = <span style={{ color: '#dc2626', fontWeight: 'bold', marginLeft: '6px' }}>[Comissão duplicada]</span>;
              }
            }

            return (
              <div key={idx} className="file-chip" style={{ ...chipStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title={file}>
                <span>{name}</span>
                {statusText}
              </div>
            );
          })}
          {selectedFiles.length > 120 && (
            <div className="file-chip">... e mais {selectedFiles.length - 120}</div>
          )}
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="output-row">
          <div className="field-grow">
            <label>Pasta para salvar</label>
            <input 
              id="outputFolder" 
              placeholder="Selecione a pasta de destino" 
              value={outputFolder} 
              readOnly 
            />
          </div>
          <button id="btnOutput" className="secondary" onClick={handleSelectFolder}>
            Escolher pasta
          </button>
        </div>
        <div className="options-row">
          <label>
            <input 
              id="sortAlpha" 
              type="checkbox" 
              checked={sortAlpha} 
              onChange={(e) => setSortAlpha(e.target.checked)} 
            /> Organizar vendedores em ordem alfabética
          </label>
          <label>
            <input 
              id="convertNumbers" 
              type="checkbox" 
              checked={convertNumbers} 
              onChange={(e) => setConvertNumbers(e.target.checked)} 
            /> Converter textos numéricos em números
          </label>
        </div>
      </section>

      <section className="panel progress-panel">
        <div className="progress-head">
          <strong id="progressTitle">{progress.title}</strong>
          <b id="progressPercent">{progress.percent}%</b>
        </div>
        <div className="progress-track">
          <div id="progressFill" className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
        </div>
        <p id="progressText">{progress.message}</p>
      </section>

      <div className="action-row">
        <button 
          id="btnGenerate" 
          className="primary large" 
          onClick={handleGenerate}
          disabled={processing}
        >
          ▶ Processar arquivos
        </button>
      </div>

      {status.type && (
        <div id="status" className={`status ${status.type}`}>
          {status.message}
        </div>
      )}

      {result && (
        <section id="resultSection" className="panel">
          <div className="panel-head">
            <div>
              <h2>Resultado do relatório</h2>
              <p>Estatísticas claras do processamento concluído.</p>
            </div>
          </div>
          <div className="metric-grid result-metrics">
            <article class="metric">
              <span class="metric-icon cyan">♟</span>
              <div>
                <small>Vendedores</small>
                <strong id="resultSellers">{resultSellers}</strong>
              </div>
            </article>
            <article class="metric">
              <span class="metric-icon green">✓</span>
              <div>
                <small>Corretoras</small>
                <strong id="resultBrokers">{summary.length}</strong>
              </div>
            </article>
            <article class="metric">
              <span class="metric-icon amber">$</span>
              <div>
                <small>Valor total</small>
                <strong id="resultValue">{formatBRL(resultTotalValue)}</strong>
              </div>
            </article>
            <article class="metric">
              <span class="metric-icon blue">▣</span>
              <div>
                <small>Arquivos de saída</small>
                <strong id="resultFiles">{result.totalFiles || 0}</strong>
              </div>
            </article>
          </div>
          <div id="summary" className="summary-table">
            <table>
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th>Quantidade de vendedores</th>
                  <th>Valor total</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.corretora}</td>
                    <td>{Number(item.vendedores || 0)}</td>
                    <td>{formatBRL(item.totalConsolidado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
