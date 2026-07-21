import React, { useState, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, FileCode, File, X, Trash2, 
  Settings, FolderOpen, Play, CheckCircle, AlertCircle, RefreshCw,
  Users, DollarSign, Search, ShieldAlert, FileDown, Download
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { formatBRL } from '../App';
import { generateIndividualReports } from '../services/reportGenerator';
import { analyzeFile } from '../lib/reports/input-reader';
import { saveReport } from '../services/historyService';
import { useAuth } from '../auth/AuthContext';

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function NewReport({ refreshHistory, addLog, onReportCreated, knownReports = [] }) {
  const session = useAuth();
  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  // Inicializa o mês de referência com o mês atual
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sortAlpha, setSortAlpha] = useState(true);
  const [convertNumbers, setConvertNumbers] = useState(true);
  
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
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
  const [analysis, setAnalysis] = useState([]);
  const [correctedFiles, setCorrectedFiles] = useState(new Set());
  const activeJobRef = React.useRef(null);

  useEffect(() => {
    const analyze = async () => {
      if (selectedFiles.length > 0) {
        try {
          const res = [];
          for (const f of selectedFiles) {
            res.push(await analyzeFile(f.file));
          }
          setAnalysis(res);
        } catch (err) {
          console.error("Erro ao analisar arquivos:", err);
        }
      } else {
        setAnalysis([]);
      }
    };
    analyze();
  }, [selectedFiles]);

  useEffect(() => {
    setCorrectedFiles(prev => {
      const next = new Set();
      prev.forEach(f => {
        if (selectedFiles.some(file => file.path === f)) {
          next.add(f);
        }
      });
      return next;
    });
  }, [selectedFiles]);

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



  const onProgress = (current, total, message, phase) => {
    const labels = { 
      leitura: 'Lendo arquivos', 
      geracao: 'Gerando relatórios', 
      concluido: 'Concluído', 
      processando: 'Processando' 
    };
    const percent = total ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
    setProgress({
      percent,
      message: message || '',
      phase: phase || 'processando',
      title: labels[phase] || 'Processando'
    });
    if (message) {
      if (phase === 'concluido') {
        log('success', message);
      } else {
        log('info', message);
      }
    }
  };

  // Validação e adição de arquivos
  const addFiles = (files) => {
    const allowedExts = /\.(xls|xlsx|html|htm)$/i;
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB
    const validFiles = [];
    let rejectedCount = 0;

    files.forEach(file => {
      const name = file.name || file.path.split(/[\\/]/).pop();
      const ext = name.split('.').pop().toLowerCase();
      const isValidExt = allowedExts.test(name);
      const isSizeValid = !file.size || file.size <= maxSizeBytes;

      if (isValidExt && isSizeValid) {
        validFiles.push({
          file: file,
          path: file.name,
          name,
          size: file.size || null,
          ext
        });
      } else {
        rejectedCount++;
        if (!isValidExt) {
          log('error', `Arquivo rejeitado (extensão inválida): ${name}`);
        } else {
          log('error', `Arquivo rejeitado (tamanho excede 50MB): ${name}`);
        }
      }
    });

    if (rejectedCount > 0) {
      alert(`${rejectedCount} arquivo(s) foram rejeitados. Verifique extensões (.xls, .xlsx, .html) e tamanho limite (50MB).`);
    }

    setSelectedFiles(prev => {
      // Remover duplicatas por path
      const combined = [...prev, ...validFiles];
      const unique = [];
      const pathsSeen = new Set();
      for (const f of combined) {
        if (!pathsSeen.has(f.path)) {
          pathsSeen.add(f.path);
          unique.push(f);
        }
      }
      log('info', `${validFiles.length} arquivos válidos adicionados. Total na fila: ${unique.length}`);
      return unique;
    });
  };

  const handleSelectFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      addFiles(files);
    }
  };



  const handleClearFiles = () => {
    setSelectedFiles([]);
    log('info', 'Fila de arquivos selecionados limpa.');
  };

  const handleRemoveFile = (pathToRemove) => {
    setSelectedFiles(prev => prev.filter(f => f.path !== pathToRemove));
    log('info', 'Arquivo removido individualmente da fila.');
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
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      addFiles(filesArray);
    }
  };

  const monthLabel = (value) => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return '';
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1))
      .replace(/^./, c => c.toUpperCase());
  };

  // Lógica de análise em lote original removida para restaurar as validações antigas de PF/PJ.

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

    if (uncorrectedDuplicates.length > 0) {
      setStatus({
        type: 'error',
        message: 'Processamento pausado. Corrija as duplicidades detectadas antes de gerar os relatórios para garantir que os totais estejam corretos.'
      });
      log('error', 'Geração interrompida. Duplicidades de comissão requerem correção (PJ e PF simultâneos).');
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
    log('info', `Iniciando geração de relatórios para ${monthLabel(reportMonth)}.`);

    try {
      const filesArray = selectedFiles.map(f => f.file);
      const res = await generateIndividualReports(
        filesArray,
        sortAlpha,
        convertNumbers,
        correctedDuplicates.map(f => f.filePath),
        [],
        onProgress
      );

      const sellersCount = res.summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
      const totalValue = res.summary.reduce((acc, item) => acc + Number(item.totalConsolidado ?? item.total ?? 0), 0);

      const savedReport = {
        id: `${reportMonth}_${Date.now()}`,
        month: reportMonth,
        key: reportMonth,
        label: monthLabel(reportMonth),
        folderName: `Relatório_${monthLabel(reportMonth).replace(/\s+/g, '_')}`,
        createdAt: new Date().toISOString(),
        summary: res.summary,
        brokers: res.summary.length,
        sellers: sellersCount,
        totalValue: totalValue,
        totalGeral: totalValue,
        inputFiles: filesArray.length,
        totalFiles: res.summary.length,
        errors: res.errors,
        createdByUid: session.actor?.uid || 'local',
        createdByName: session.actor?.displayName || session.actor?.email || 'Usuário'
      };

      await saveReport(savedReport);

      setResult({ ...res, totalFiles: res.summary.length });
      const errorCount = res.errors?.length ? `\nArquivos com erro: ${res.errors.length}` : '';
      setStatus({
        type: 'success',
        message: `Relatório de ${monthLabel(reportMonth)} gerado e salvo no histórico.${errorCount}`
      });

      log('success', `Processamento concluído com sucesso. ${res.summary.length} relatórios gerados.`);
      if (res.errors && res.errors.length > 0) {
        log('error', `${res.errors.length} erro(s) de leitura durante o processamento.`);
        res.errors.forEach(err => log('error', `Erro na planilha: ${err}`));
      }

      refreshHistory();
      onReportCreated?.(savedReport);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Erro ao gerar os relatórios.'
      });
      log('error', `Erro crítico no processamento: ${err.message}`);
    } finally {
      activeJobRef.current = null;
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    window.location.reload();
  };

  const handleSaveToFolder = async () => {
    if (!result?.generatedFiles || result.generatedFiles.length === 0) return;

    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        let count = 0;
        for (const fileObj of result.generatedFiles) {
          const fileHandle = await dirHandle.getFileHandle(fileObj.fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(fileObj.blob);
          await writable.close();
          count++;
        }
        alert(`${count} arquivo(s) salvos com sucesso na pasta escolhida!`);
        log('success', `${count} arquivo(s) salvos na pasta escolhida.`);
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Erro ao salvar na pasta: ' + err.message);
        }
      }
    } else {
      result.generatedFiles.forEach(f => saveAs(f.blob, f.fileName));
    }
  };

  const handleDownloadAll = () => {
    if (!result?.generatedFiles || result.generatedFiles.length === 0) return;
    result.generatedFiles.forEach(f => saveAs(f.blob, f.fileName));
  };

  // Cálculo das métricas de resultado, se houver
  const summary = result?.summary || [];
  const resultSellers = summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
  const resultTotalValue = summary.reduce((sum, item) => sum + Number(item.totalConsolidado ?? item.total ?? 0), 0);

  return (
    <div id="page-new-report" className="page active">
      <div className="page-title">
        <div>
          <h1>Novo relatório</h1>
          <p>Informe o mês, arraste as planilhas e gere os arquivos separados por corretora.</p>
        </div>
      </div>

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
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          tabIndex="0"
          style={{ position: 'relative' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', cursor: 'pointer', margin: 0 }}>
            <div className="upload-icon"><Upload size={24} /></div>
            <strong>Arraste as comissões para esta área</strong>
            <span>ou clique para selecionar os arquivos</span>
            <small>.XLS · .XLSX · .HTML</small>
            <input type="file" multiple accept=".xlsx,.xls,.html,.htm" style={{ display: 'none' }} onChange={handleSelectFiles} />
          </label>
        </div>
      </section>

      {/* Lista de Arquivos Selecionados */}
      <section className="panel compact-panel">
        <div className="selection-head">
          <div>
            <h2>Arquivos selecionados</h2>
            <p id="fileCount" className="muted" style={{ margin: 0, fontSize: '13px' }}>
              {selectedFiles.length ? `${selectedFiles.length} arquivo(s) selecionado(s).` : 'Nenhum arquivo selecionado.'}
            </p>
          </div>
          {selectedFiles.length > 0 && (
            <button id="clearFiles" className="ghost danger" onClick={handleClearFiles} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={13} /> Limpar Tudo
            </button>
          )}
        </div>
        
        <div id="fileList" className="file-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {selectedFiles.slice(0, 150).map((file, idx) => {
            const isExcel = ['xls', 'xlsx'].includes(file.ext);
            const isHtml = ['html', 'htm'].includes(file.ext);
            
            return (
              <div 
                key={file.path} 
                className="file-chip" 
                title={file.path}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  gap: '10px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  padding: '8px 12px',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {isExcel ? (
                    <FileSpreadsheet size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  ) : isHtml ? (
                    <FileCode size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  ) : (
                    <File size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{file.name}</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{formatBytes(file.size)}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleRemoveFile(file.path)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--red)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Remover arquivo"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {selectedFiles.length > 150 && (
            <div className="file-chip" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic' }}>
              ... e mais {selectedFiles.length - 150} arquivos.
            </div>
          )}
        </div>
      </section>

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
              {uncorrectedDuplicates.map((f, idx) => (
                <li key={idx}>
                  {f.brokerName} ({f.duplicateCompanies.join(', ')} - consta na PF e PJ)
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

      <section className="panel compact-panel">
        <div className="options-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              id="sortAlpha" 
              type="checkbox" 
              checked={sortAlpha} 
              onChange={(e) => setSortAlpha(e.target.checked)} 
            /> Organizar vendedores em ordem alfabética
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
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
          <strong id="progressTitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} className={processing ? 'animate-spin' : ''} />
            {progress.title}
          </strong>
          <b id="progressPercent">{progress.percent}%</b>
        </div>
        <div className="progress-track">
          <div id="progressFill" className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
        </div>
        <p id="progressText" className="muted" style={{ margin: 0, fontSize: '12px' }}>{progress.message}</p>
      </section>

      <div className="action-row">
        <button 
          id="btnGenerate" 
          className="primary large" 
          onClick={handleGenerate}
          disabled={processing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
        >
          {status.type === 'error' ? <RefreshCw size={16} /> : <Play size={16} />}
          {status.type === 'error' ? 'Tentar novamente' : 'Processar arquivos'}
        </button>
        {processing && (
          <button className="secondary danger" onClick={handleCancel}>
            <X size={16} /> Cancelar com segurança
          </button>
        )}
      </div>

      {status.type && (
        <div id="status" className={`status ${status.type}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {status.type === 'loading' ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : status.type === 'success' ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{status.message}</span>
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
            <article className="metric">
              <span className="metric-icon cyan"><Users size={20} /></span>
              <div>
                <small>Vendedores</small>
                <strong id="resultSellers">{resultSellers}</strong>
              </div>
            </article>
            <article className="metric">
              <span className="metric-icon green"><CheckCircle size={20} /></span>
              <div>
                <small>Corretoras</small>
                <strong id="resultBrokers">{summary.length}</strong>
              </div>
            </article>
            <article className="metric">
              <span className="metric-icon amber"><DollarSign size={20} /></span>
              <div>
                <small>Valor total</small>
                <strong id="resultValue">{formatBRL(resultTotalValue)}</strong>
              </div>
            </article>
            <article className="metric">
              <span className="metric-icon blue"><FileSpreadsheet size={20} /></span>
              <div>
                <small>Arquivos de saída</small>
                <strong id="resultFiles">{result.totalFiles || 0}</strong>
              </div>
            </article>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '20px 0 15px 0' }}>
            <button className="primary" onClick={handleSaveToFolder} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderOpen size={16} /> Salvar planilhas individuais na pasta...
            </button>
            <button className="secondary" onClick={handleDownloadAll} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={16} /> Baixar todas as planilhas (.xlsx)
            </button>
          </div>

          <div id="summary" className="summary-table">
            <table>
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th>Quantidade de vendedores</th>
                  <th>Valor total</th>
                  <th style={{ textAlign: 'right' }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item, idx) => {
                  const generatedFile = result.generatedFiles?.find(f => f.corretora === item.corretora);
                  return (
                    <tr key={idx}>
                      <td>{item.corretora}</td>
                      <td>{Number(item.vendedores || 0)}</td>
                      <td>{formatBRL(item.totalConsolidado ?? item.total ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {generatedFile && (
                          <button 
                            className="ghost" 
                            onClick={() => saveAs(generatedFile.blob, generatedFile.fileName)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 8px' }}
                            title="Baixar planilha desta corretora"
                          >
                            <Download size={12} /> Excel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
