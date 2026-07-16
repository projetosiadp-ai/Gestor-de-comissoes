import React, { useState, useEffect } from 'react';
import { formatBRL } from '../App';

export default function PdfSummary({ addLog }) {
  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [outputFolder, setOutputFolder] = useState('');
  
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  const [progress, setProgress] = useState({
    percent: 0,
    message: 'Selecione as planilhas para começar.',
    phase: 'aguardando',
    title: 'Aguardando processamento'
  });
  
  const [status, setStatus] = useState({
    type: '', // 'loading', 'success', 'error', ''
    message: ''
  });
  
  const [result, setResult] = useState(null);

  useEffect(() => {
    window.api?.getAppSettings?.().then(settings => {
      if (settings?.defaultOutputFolder) setOutputFolder(settings.defaultOutputFolder);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (window.api && window.api.onSummaryProgress) {
      window.api.onSummaryProgress((data) => {
        const labels = { 
          leitura: 'Lendo planilhas', 
          geracao: 'Gerando PDF', 
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
    const allowed = /\.(xls|xlsx)$/i; // Apenas planilhas para o resumo
    const filtered = (paths || []).filter(p => allowed.test(p));
    setSelectedFiles(prev => {
      const combined = [...prev, ...filtered];
      const next = [...new Set(combined)];
      log('info', `${filtered.length} planilhas de resumo válidas adicionadas. Total na fila: ${next.length}`);
      return next;
    });
  };

  const handleSelectFiles = async () => {
    if (window.api && window.api.selectSummaryFiles) {
      const paths = await window.api.selectSummaryFiles();
      addFiles(paths);
    }
  };

  const handleSelectFolder = async () => {
    if (window.api && window.api.selectOutputFolder) {
      const folder = await window.api.selectOutputFolder();
      if (folder) {
        setOutputFolder(folder);
        window.api.saveAppSettings?.({ defaultOutputFolder: folder }).catch(() => {});
        log('info', `Pasta de destino para PDF selecionada: ${folder}`);
      }
    }
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

  const handleGenerateSummary = async () => {
    if (!selectedFiles.length) {
      setStatus({ type: 'error', message: 'Selecione ou arraste as planilhas prontas.' });
      log('error', 'Tentativa de gerar PDF de resumo sem arquivos selecionados.');
      return;
    }
    if (!outputFolder) {
      setStatus({ type: 'error', message: 'Escolha a pasta onde o PDF será salvo.' });
      log('error', 'Tentativa de gerar PDF de resumo sem pasta de destino selecionada.');
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
      message: 'Gerando o PDF único...'
    });
    log('info', `Iniciando compilação do PDF de resumo de comissões. Destino: ${outputFolder}`);

    try {
      if (window.api && window.api.generateSummaryPdf) {
        const res = await window.api.generateSummaryPdf({
          files: selectedFiles,
          outputFolder
        });

        setResult(res);
        setStatus({
          type: 'success',
          message: `PDF gerado com sucesso.\nArquivo: ${res.pdfPath}`
        });

        log('success', `PDF de resumo compilado com sucesso! Salvo em: ${res.pdfPath}`);
        if (res.errors && res.errors.length > 0) {
          log('error', `${res.errors.length} erro(s) ao ler arquivos para o resumo PDF.`);
          res.errors.forEach(err => log('error', `Erro no resumo: ${err}`));
        }
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Erro ao gerar o PDF.'
      });
      log('error', `Erro crítico ao compilar PDF de resumo: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div id="page-pdf-summary" className="page active">
      <div className="page-title">
        <div>
          <h1>PDF de resumo</h1>
          <p>Use planilhas já prontas. O nome da corretora será lido pelo nome do arquivo.</p>
        </div>
      </div>

      <section className="panel">
        <div 
          id="summaryDropzone" 
          className={`dropzone small ${dragOver ? 'dragover' : ''}`}
          onClick={handleSelectFiles}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          tabIndex="0"
        >
          <div className="upload-icon">⇧</div>
          <strong>Arraste as planilhas prontas</strong>
          <span>ou clique para selecionar</span>
          <small>.XLS · .XLSX</small>
        </div>
        <p id="summaryFileCount" className="muted" style={{ marginTop: '12px' }}>
          {selectedFiles.length ? `${selectedFiles.length} arquivo(s) selecionado(s).` : 'Nenhum arquivo selecionado.'}
        </p>
        <div id="summaryFileList" className="file-list">
          {selectedFiles.map((file, idx) => {
            const name = file.split(/[\\/]/).pop();
            return (
              <div key={idx} className="file-chip" title={file}>
                {name}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="output-row">
          <div className="field-grow">
            <label>Pasta para salvar o PDF</label>
            <input 
              id="summaryOutputFolder" 
              placeholder="Selecione a pasta de destino" 
              value={outputFolder} 
              readOnly 
            />
          </div>
          <button id="btnSummaryOutput" className="secondary" onClick={handleSelectFolder}>
            Escolher pasta
          </button>
        </div>
      </section>

      <section className="panel progress-panel">
        <div className="progress-head">
          <strong id="summaryProgressTitle">{progress.title}</strong>
          <b id="summaryProgressPercent">{progress.percent}%</b>
        </div>
        <div className="progress-track">
          <div id="summaryProgressFill" className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
        </div>
        <p id="summaryProgressText">{progress.message}</p>
      </section>

      <div className="action-row">
        <button 
          id="btnGenerateSummary" 
          className="primary large" 
          onClick={handleGenerateSummary}
          disabled={processing}
        >
          Gerar PDF único
        </button>
      </div>

      {status.type && (
        <div id="summaryStatus" className={`status ${status.type}`}>
          {status.message}
        </div>
      )}

      {result && (
        <section id="summaryPdfPreview" className="panel">
          <div className="panel-head">
            <div>
              <h2>Resumo gerado</h2>
              <p>{result.items.length} corretora(s) — {formatBRL(result.totalGeral)}</p>
            </div>
          </div>
          <div className="summary-table">
            <table>
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th>Valor total</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.corretora}</td>
                    <td>{formatBRL(item.total)}</td>
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
