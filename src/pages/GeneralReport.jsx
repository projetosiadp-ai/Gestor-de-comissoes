import React, { useState } from 'react';
import { formatBRL } from '../App';

export default function GeneralReport({ refreshHistory, addLog }) {
  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [corretoras, setCorretoras] = useState([]);
  const [outputFolder, setOutputFolder] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [dragOver, setDragOver] = useState(false);

  const handleSelectFiles = async () => {
    if (window.api && window.api.selectGeneralFiles) {
      const paths = await window.api.selectGeneralFiles();
      if (paths && paths.length > 0) {
        addFiles(paths);
      }
    }
  };

  const addFiles = async (paths) => {
    const allowed = /\.xlsx$/i;
    const filtered = (paths || []).filter(p => allowed.test(p));
    if (filtered.length === 0) {
      log('error', 'Nenhum arquivo .xlsx válido foi selecionado.');
      return;
    }

    setSelectedFiles(filtered);
    setCorretoras([]);
    setParsing(true);
    setStatus({ type: 'loading', message: 'Lendo planilhas de corretoras e agrupando...' });
    log('info', `Iniciando leitura de ${filtered.length} planilhas...`);

    try {
      const res = await window.api.parseGeneralInputs({ files: filtered });
      if (res.errors && res.errors.length > 0) {
        res.errors.forEach(err => log('error', err));
      }

      // Agrupa os blocos por corretora no frontend
      const groupedMap = {};
      for (const b of (res.blocks || [])) {
        const cName = b.corretora;
        if (!groupedMap[cName]) {
          groupedMap[cName] = {
            corretora: cName,
            totalComissao: 0,
            category: 'PF',
            diferencas: '',
            meta: '',
            descTaxa: '',
            lancamentosFuturos: '',
            ir: ''
          };
        }
        groupedMap[cName].totalComissao += Number(b.total || 0);
        // Se houver algum bloco PJ nas planilhas, define a corretora como PJ por padrão
        if (b.category === 'PJ') {
          groupedMap[cName].category = 'PJ';
        }
      }

      const list = Object.values(groupedMap).sort((a, b) => a.corretora.localeCompare(b.corretora, 'pt-BR'));
      setCorretoras(list);

      if (list.length > 0) {
        setStatus({ type: 'success', message: `${list.length} corretoras carregadas com sucesso.` });
        log('success', `Identificadas ${list.length} corretoras comissionáveis a partir dos arquivos.`);
      } else {
        setStatus({ type: 'error', message: 'Nenhuma informação comissionável foi localizada nos arquivos.' });
        log('warning', 'Nenhum bloco localizado nos arquivos.');
      }
    } catch (err) {
      setStatus({ type: 'error', message: `Erro ao analisar arquivos: ${err.message}` });
      log('error', `Erro na análise de arquivos: ${err.message}`);
    } finally {
      setParsing(false);
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

  const handleSelectFolder = async () => {
    if (window.api && window.api.selectOutputFolder) {
      const folder = await window.api.selectOutputFolder();
      if (folder) {
        setOutputFolder(folder);
        log('info', `Pasta de destino selecionada: ${folder}`);
      }
    }
  };

  const handleFieldChange = (index, field, value) => {
    setCorretoras(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleGenerate = async () => {
    if (!reportMonth) {
      setStatus({ type: 'error', message: 'Mês de referência não informado.' });
      return;
    }
    if (!outputFolder) {
      setStatus({ type: 'error', message: 'Selecione a pasta de destino para salvar o Relatório Geral.' });
      return;
    }
    if (!corretoras.length) {
      setStatus({ type: 'error', message: 'Carregue primeiro as planilhas das corretoras.' });
      return;
    }

    setGenerating(true);
    setStatus({ type: 'loading', message: 'Consolidando dados e gerando a planilha geral...' });
    log('info', `Iniciando consolidação do Relatório Geral de ${reportMonth}...`);

    try {
      // Converte valores vazios para 0 ao enviar para o backend
      const payloadData = corretoras.map(c => ({
        corretora: c.corretora,
        totalComissao: Number(c.totalComissao || 0),
        category: c.category,
        diferencas: Number(c.diferencas || 0),
        meta: Number(c.meta || 0),
        descTaxa: Number(c.descTaxa || 0),
        lancamentosFuturos: Number(c.lancamentosFuturos || 0),
        ir: Number(c.ir || 0)
      }));

      const res = await window.api.generateGeneralReport({
        reportMonth,
        outputFolder,
        corretorasData: payloadData
      });

      setStatus({
        type: 'success',
        message: `Relatório Geral criado com sucesso:\nArquivo: ${res.fileName}\nCaminho: ${res.outPath}`
      });
      log('success', `Relatório Geral consolidado com sucesso em: ${res.outPath}`);
    } catch (err) {
      setStatus({ type: 'error', message: `Erro ao gerar relatório: ${err.message}` });
      log('error', `Falha ao gerar Relatório Geral: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenFile = (path) => {
    if (window.api && window.api.openPath) {
      window.api.openPath(path);
    }
  };

  // Helper para renderizar os inputs numéricos de forma consistente
  const renderNumericInput = (index, field, value) => {
    return (
      <input
        type="number"
        step="0.01"
        placeholder="0,00"
        value={value}
        onChange={(e) => handleFieldChange(index, field, e.target.value)}
        style={{
          width: '92px',
          height: '32px',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          padding: '0 6px',
          textAlign: 'right',
          fontSize: '12px',
          outline: 'none'
        }}
      />
    );
  };

  return (
    <div className="page active">
      <div className="page-title">
        <div>
          <h1>Gerar Relatório Geral</h1>
          <p>Consolide as planilhas individuais das corretoras em uma única planilha geral de comissionamento.</p>
        </div>
      </div>

      <div className="panel">
        <div className="report-setup">
          <div className="date-column">
            <label>Mês de Referência</label>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              disabled={parsing || generating}
            />
            <p>Selecione o mês para nomear a aba e o arquivo de saída.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label>Planilhas Consolidadas por Corretora (.xlsx)</label>
              <div
                className={`dropzone ${dragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleSelectFiles}
                style={{ cursor: 'pointer' }}
              >
                <div className="upload-icon">↑</div>
                <strong>Selecione ou Arraste os arquivos consolidados</strong>
                <small>Clique para escolher</small>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--muted)' }}>Arquivos importados:</strong>
                <div className="file-list" style={{ marginTop: '5px' }}>
                  {selectedFiles.map((f, idx) => (
                    <div key={idx} className="file-chip" title={f}>
                      {f.split(/[\\/]/).pop()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
          {status.type === 'success' && status.message.includes('Caminho:') && (
            <button
              className="secondary"
              onClick={() => handleOpenFile(status.message.split('Caminho: ')[1].trim())}
              style={{ marginTop: '10px', display: 'block' }}
            >
              Abrir Planilha Consolidada
            </button>
          )}
        </div>
      )}

      {corretoras.length > 0 && (
        <div className="panel">
          <div className="panel-head" style={{ marginBottom: '15px' }}>
            <div>
              <h2>Revisar Corretoras e Ajustes</h2>
              <p>Configure a classificação (PF/PJ) e insira manualmente valores de Diferenças, Meta ou outras taxas de ajuste para cada corretora.</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="summary-table table" style={{ width: '100%', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th>Total Comissões</th>
                  <th style={{ width: '110px' }}>Tipo</th>
                  <th style={{ textAlign: 'right', width: '106px' }}>Diferenças (R$)</th>
                  <th style={{ textAlign: 'right', width: '106px' }}>Meta (R$)</th>
                  <th style={{ textAlign: 'right', width: '106px' }}>Desc Taxa (R$)</th>
                  <th style={{ textAlign: 'right', width: '106px' }}>Lanç. Futuros (R$)</th>
                  <th style={{ textAlign: 'right', width: '106px' }}>IR (R$)</th>
                </tr>
              </thead>
              <tbody>
                {corretoras.map((c, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: '700', fontSize: '13px' }}>{c.corretora}</td>
                    <td style={{ fontWeight: '700', color: '#031f49' }}>{formatBRL(c.totalComissao)}</td>
                    <td>
                      <select
                        value={c.category}
                        onChange={(e) => handleFieldChange(idx, 'category', e.target.value)}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '0 4px',
                          background: '#fff',
                          outline: 'none',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        <option value="PF">PF</option>
                        <option value="PJ">PJ</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>{renderNumericInput(idx, 'diferencas', c.diferencas)}</td>
                    <td style={{ textAlign: 'right' }}>{renderNumericInput(idx, 'meta', c.meta)}</td>
                    <td style={{ textAlign: 'right' }}>{renderNumericInput(idx, 'descTaxa', c.descTaxa)}</td>
                    <td style={{ textAlign: 'right' }}>{renderNumericInput(idx, 'lancamentosFuturos', c.lancamentosFuturos)}</td>
                    <td style={{ textAlign: 'right' }}>{renderNumericInput(idx, 'ir', c.ir)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="output-row" style={{ marginTop: '22px', borderTop: '1px solid var(--line)', paddingTop: '15px' }}>
            <div className="field-grow">
              <label>Pasta de Destino</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Selecione a pasta onde o Relatório Geral será salvo"
                  value={outputFolder}
                  readOnly
                  onClick={handleSelectFolder}
                  style={{ flex: 1 }}
                />
                <button className="ghost" onClick={handleSelectFolder}>
                  Escolher Pasta
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button
              className="primary large"
              disabled={generating || parsing}
              onClick={handleGenerate}
            >
              {generating ? 'Consolidando...' : 'Gerar Planilha Geral'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
