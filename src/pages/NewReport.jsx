import React, { useState, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, FileCode, File, X, Trash2, 
  Settings, FolderOpen, Play, CheckCircle, AlertCircle, RefreshCw,
  Users, DollarSign, Search, ShieldAlert
} from 'lucide-react';
import { formatBRL } from '../App';

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function NewReport({ refreshHistory, addLog, onReportCreated, knownReports = [] }) {
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
  const [analyzingDuplicates, setAnalyzingDuplicates] = useState(false);
  const [duplicateAnalysis, setDuplicateAnalysis] = useState(null);
  const [duplicateReviewAccepted, setDuplicateReviewAccepted] = useState(false);
  const activeJobRef = React.useRef(null);

  useEffect(() => {
    setDuplicateAnalysis(null);
    setDuplicateReviewAccepted(false);
  }, [selectedFiles]);

  useEffect(() => {
    window.api?.getAppSettings?.().then(settings => {
      if (settings?.defaultOutputFolder) setOutputFolder(settings.defaultOutputFolder);
    }).catch(() => {});
  }, []);

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
          path: file.path,
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

  const handleSelectFiles = async () => {
    if (window.api && window.api.selectFiles) {
      const paths = await window.api.selectFiles();
      if (paths && paths.length > 0) {
        // Como o seletor nativo só retorna paths, convertemos em objetos de arquivo
        const files = paths.map(p => ({ path: p, size: null }));
        addFiles(files);
      }
    }
  };

  const handleSelectFolder = async () => {
    if (window.api && window.api.selectOutputFolder) {
      const folder = await window.api.selectOutputFolder();
      if (folder) {
        setOutputFolder(folder);
        window.api.saveAppSettings?.({ defaultOutputFolder: folder }).catch(() => {});
        log('info', `Pasta de destino selecionada: ${folder}`);
      }
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
      const filesArray = Array.from(e.dataTransfer.files).map(f => {
        const path = window.api.getDroppedFilePaths([f])[0] || f.name;
        return {
          path,
          name: f.name,
          size: f.size
        };
      });
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

  const analyzeSelectedBatch = async () => {
    if (!window.api?.analyzeDuplicates) {
      throw new Error('A análise local de duplicidades não está disponível.');
    }

    setAnalyzingDuplicates(true);
    setStatus({ type: 'loading', message: 'Analisando o lote inteiro localmente...' });
    try {
      const localAnalysis = await window.api.analyzeDuplicates({
        files: selectedFiles.map(file => file.path)
      });
      const previousById = new Map((localAnalysis.previousProcesses || []).map(item => [item.id, item]));
      knownReports
        .filter(report => report.batchFingerprint === localAnalysis.batchFingerprint)
        .forEach(report => previousById.set(report.id, {
          id: report.id,
          label: report.label,
          createdAt: report.createdAt,
          version: report.version || 1,
          outputRoot: report.outputRoot
        }));
      const previousProcesses = Array.from(previousById.values());
      const analysis = {
        ...localAnalysis,
        previousProcesses,
        requiresConfirmation: localAnalysis.requiresConfirmation || previousProcesses.length > 0
      };
      setDuplicateAnalysis(analysis);

      if (analysis.errors?.length) {
        throw new Error(`Não foi possível verificar ${analysis.errors.length} arquivo(s). Corrija os arquivos indicados antes de processar.`);
      }

      return analysis;
    } finally {
      setAnalyzingDuplicates(false);
    }
  };

  const handleAnalyzeDuplicates = async () => {
    if (!selectedFiles.length) {
      setStatus({ type: 'error', message: 'Selecione os arquivos antes de analisar o lote.' });
      return;
    }

    try {
      const analysis = await analyzeSelectedBatch();
      const findings = analysis.confirmed.length + analysis.possible.length + analysis.previousProcesses.length;
      setStatus({
        type: findings ? 'error' : 'success',
        message: findings
          ? 'Foram encontradas duplicidades ou um processamento anterior. Revise os avisos abaixo antes de continuar.'
          : 'Análise concluída: nenhuma duplicidade identificada no lote.'
      });
      log(findings ? 'error' : 'success', `Análise local concluída: ${analysis.totalRecords} registro(s), ${analysis.confirmed.length} grupo(s) confirmado(s) e ${analysis.possible.length} possível(is).`);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      log('error', `Falha na análise local: ${error.message}`);
    }
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

    let analysis;
    try {
      analysis = await analyzeSelectedBatch();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      log('error', `Processamento bloqueado: ${error.message}`);
      return;
    }

    if (analysis.requiresConfirmation && !duplicateReviewAccepted) {
      setStatus({
        type: 'error',
        message: 'Processamento pausado. Revise as duplicidades e marque a confirmação obrigatória para continuar.'
      });
      log('error', 'Processamento pausado para revisão obrigatória das duplicidades encontradas.');
      return;
    }

    const jobId = globalThis.crypto?.randomUUID?.() || `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeJobRef.current = jobId;
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
        // Envia apenas a lista de caminhos (paths) para o backend do Electron
        const filePaths = selectedFiles.map(f => f.path);
        const res = await window.api.generateReports({
          files: filePaths,
          outputFolder,
          sortAlpha,
          convertNumbers,
          reportMonth,
          jobId
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
        onReportCreated?.(res.savedReport);
      }
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
    if (!activeJobRef.current || !window.api?.cancelProcessing) return;
    const requested = await window.api.cancelProcessing(activeJobRef.current);
    if (requested) {
      setStatus({ type: 'loading', message: 'Cancelamento solicitado. Finalizando a etapa segura atual...' });
      log('info', 'Cancelamento solicitado pelo usuário.');
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
          style={{ position: 'relative' }}
        >
          <div className="upload-icon"><Upload size={24} /></div>
          <strong>Arraste as comissões para esta área</strong>
          <span>ou clique para selecionar os arquivos</span>
          <small>.XLS · .XLSX · .HTML</small>
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

      <section className="panel compact-panel duplicate-panel">
        <div className="selection-head">
          <div>
            <h2><Search size={17} /> Análise local de duplicidades</h2>
            <p className="muted">O lote inteiro é comparado nesta máquina. CPF, cliente e contrato não são enviados para a nuvem.</p>
          </div>
          <button
            className="secondary"
            onClick={handleAnalyzeDuplicates}
            disabled={!selectedFiles.length || analyzingDuplicates || processing}
          >
            <Search size={14} /> {analyzingDuplicates ? 'Analisando...' : 'Analisar lote'}
          </button>
        </div>

        {duplicateAnalysis && (
          <div className="duplicate-review">
            <div className="duplicate-metrics">
              <span><b>{duplicateAnalysis.totalRecords}</b> registros verificados</span>
              <span className={duplicateAnalysis.confirmed.length ? 'duplicate-danger' : ''}>
                <b>{duplicateAnalysis.confirmed.length}</b> grupos confirmados
              </span>
              <span className={duplicateAnalysis.possible.length ? 'duplicate-warning' : ''}>
                <b>{duplicateAnalysis.possible.length}</b> grupos possíveis
              </span>
              <span className={duplicateAnalysis.previousProcesses.length ? 'duplicate-warning' : ''}>
                <b>{duplicateAnalysis.previousProcesses.length}</b> processamento(s) anterior(es)
              </span>
            </div>

            {duplicateAnalysis.previousProcesses?.map(previous => (
              <div className="duplicate-previous" key={previous.id}>
                <ShieldAlert size={16} />
                <span>
                  Este mesmo lote já foi processado em <b>{new Date(previous.createdAt).toLocaleString('pt-BR')}</b>
                  {' '}({previous.label}, versão {previous.version}). Uma nova execução será salva em outra pasta identificada, sem sobrescrever a anterior.
                </span>
              </div>
            ))}

            {duplicateAnalysis.errors?.map((error, index) => (
              <div className="duplicate-error" key={`${error.fileName}-${index}`}>
                <AlertCircle size={15} /> <b>{error.fileName}</b>: {error.message}
              </div>
            ))}

            {[...duplicateAnalysis.confirmed, ...duplicateAnalysis.possible].map((group, index) => (
              <details className={`duplicate-group ${group.kind}`} key={`${group.kind}-${group.cpf}-${group.contrato}-${index}`}>
                <summary>
                  <span>{group.kind === 'confirmed' ? 'Duplicidade confirmada' : 'Possível duplicidade'}</span>
                  <b>{group.cliente || 'Cliente não identificado'}</b>
                  <span>CPF {group.cpf} · Contrato {group.contrato} · {group.records.length} ocorrências</span>
                </summary>
                {group.differences?.length > 0 && (
                  <p className="duplicate-differences">Diferenças encontradas: {group.differences.join(', ')}.</p>
                )}
                <div className="duplicate-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Arquivo</th><th>Tabela/linha</th><th>Parcela</th><th>Pagamento</th><th>Comissão</th></tr>
                    </thead>
                    <tbody>
                      {group.records.map((record, recordIndex) => (
                        <tr key={`${record.fileName}-${record.rowNumber}-${recordIndex}`}>
                          <td title={record.filePath}>{record.fileName}</td>
                          <td>{record.table} · {record.rowNumber}</td>
                          <td>{record.parcela || '—'}</td>
                          <td>{record.pagamento || '—'}</td>
                          <td>{record.comissao || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}

            {duplicateAnalysis.requiresConfirmation && !duplicateAnalysis.errors?.length && (
              <label className="duplicate-confirmation">
                <input
                  type="checkbox"
                  checked={duplicateReviewAccepted}
                  onChange={(event) => setDuplicateReviewAccepted(event.target.checked)}
                />
                <ShieldAlert size={18} />
                <span>Revisei as ocorrências e os processamentos anteriores. Confirmo a continuidade sem excluir ou alterar linhas e aceito a criação de uma nova versão identificada.</span>
              </label>
            )}

            {!duplicateAnalysis.requiresConfirmation && !duplicateAnalysis.errors?.length && (
              <div className="duplicate-clear"><CheckCircle size={16} /> Nenhuma duplicidade identificada pelos critérios atuais.</div>
            )}
          </div>
        )}
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
          <button id="btnOutput" className="secondary" onClick={handleSelectFolder} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FolderOpen size={14} /> Escolher pasta
          </button>
        </div>
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
          disabled={processing || analyzingDuplicates}
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
