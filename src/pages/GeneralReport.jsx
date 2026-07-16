import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, Upload, Download, RefreshCw, FolderOpen, 
  CheckCircle, AlertCircle, Play, Sparkles, Building, Users
} from 'lucide-react';
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

  useEffect(() => {
    window.api?.getAppSettings?.().then(settings => {
      if (settings?.defaultOutputFolder) setOutputFolder(settings.defaultOutputFolder);
    }).catch(() => {});
  }, []);

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
        window.api.saveAppSettings?.({ defaultOutputFolder: folder }).catch(() => {});
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

  // Memoized total calculations for sticky footer
  const totals = useMemo(() => {
    let commission = 0;
    let net = 0;
    corretoras.forEach(c => {
      const tc = Number(c.totalComissao || 0);
      const dif = Number(c.diferencas || 0);
      const mt = Number(c.meta || 0);
      const tx = Number(c.descTaxa || 0);
      const lf = Number(c.lancamentosFuturos || 0);
      const irVal = Number(c.ir || 0);
      
      commission += tc;
      net += (tc + dif + mt - tx + lf - irVal);
    });
    return { commission, net };
  }, [corretoras]);

  // Decides input border highlights mapped to HSL tokens
  const getInputBorderStyle = (value, inputType) => {
    const val = Number(value || 0);
    if (val === 0) return { borderColor: 'var(--line)' };
    
    if (inputType === 'bonus') {
      // Diferenças, Meta, Lançamentos Futuros
      return { borderColor: val > 0 ? 'var(--green)' : 'var(--red)', borderWidth: '1.5px' };
    } else if (inputType === 'deduction') {
      // Desc Taxa, IR
      return { borderColor: val > 0 ? 'var(--red)' : 'var(--green)', borderWidth: '1.5px' };
    }
    return { borderColor: 'var(--line)' };
  };

  // Helper para renderizar os inputs numéricos de forma consistente com realce condicional
  const renderNumericInput = (index, field, value, inputType) => {
    const borderStyle = getInputBorderStyle(value, inputType);
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
          borderRadius: '6px',
          padding: '0 8px',
          textAlign: 'right',
          fontSize: '12px',
          outline: 'none',
          border: '1px solid',
          transition: 'all 0.15s ease',
          background: 'var(--panel)',
          color: 'var(--text)',
          ...borderStyle
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
                <div className="upload-icon"><Upload size={24} /></div>
                <strong>Selecione ou Arraste os arquivos consolidados</strong>
                <small>Clique para escolher</small>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--muted)' }}>Arquivos importados:</strong>
                <div className="file-list" style={{ marginTop: '5px' }}>
                  {selectedFiles.map((f, idx) => (
                    <div key={idx} className="file-chip" title={f} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileSpreadsheet size={12} style={{ color: 'var(--green)' }} />
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
        <div className={`status ${status.type}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {status.type === 'loading' ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : status.type === 'success' ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <div style={{ flex: 1 }}>
            {status.message}
            {status.type === 'success' && status.message.includes('Caminho:') && (
              <button
                className="secondary"
                onClick={() => handleOpenFile(status.message.split('Caminho: ')[1].trim())}
                style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FolderOpen size={13} /> Abrir Planilha Consolidada
              </button>
            )}
          </div>
        </div>
      )}

      {corretoras.length > 0 && (
        <div className="panel" style={{ paddingBottom: 0, overflow: 'hidden' }}>
          <div className="panel-head" style={{ marginBottom: '15px' }}>
            <div>
              <h2>Revisar Corretoras e Ajustes</h2>
              <p>Configure a classificação (PF/PJ) e insira manualmente valores de Diferenças, Meta ou outras taxas de ajuste para cada corretora.</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '450px', position: 'relative' }}>
            <table className="summary-table table" style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 2, borderBottom: '2px solid var(--line)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left' }}>Corretora</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left' }}>Total Comissões</th>
                  <th style={{ padding: '12px 8px', width: '110px', textAlign: 'left' }}>Tipo</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', width: '106px' }}>Diferenças (R$)</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', width: '106px' }}>Meta (R$)</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', width: '106px' }}>Desc Taxa (R$)</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', width: '106px' }}>Lanç. Futuros (R$)</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', width: '106px' }}>IR (R$)</th>
                </tr>
              </thead>
              <tbody>
                {corretoras.map((c, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '700', fontSize: '13px' }}>{c.corretora}</td>
                    <td style={{ padding: '10px 8px', fontWeight: '700', color: 'var(--text)' }}>{formatBRL(c.totalComissao)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <select
                        value={c.category}
                        onChange={(e) => handleFieldChange(idx, 'category', e.target.value)}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          padding: '0 4px',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          outline: 'none',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        <option value="PF">PF</option>
                        <option value="PJ">PJ</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{renderNumericInput(idx, 'diferencas', c.diferencas, 'bonus')}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{renderNumericInput(idx, 'meta', c.meta, 'bonus')}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{renderNumericInput(idx, 'descTaxa', c.descTaxa, 'deduction')}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{renderNumericInput(idx, 'lancamentosFuturos', c.lancamentosFuturos, 'bonus')}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{renderNumericInput(idx, 'ir', c.ir, 'deduction')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sticky Net Total Footer */}
          <div className="table-sticky-footer" style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--panel)',
            borderTop: '2px solid var(--line)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
            zIndex: 3,
            fontWeight: '700',
            fontSize: '13px',
            marginTop: '15px'
          }}>
            <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} className="text-amber" /> Resumo Consolidado:
            </span>
            <div style={{ display: 'flex', gap: '24px' }}>
              <span>Bruto: <span style={{ color: 'var(--text)' }}>{formatBRL(totals.commission)}</span></span>
              <span>Líquido Geral: <span style={{ color: 'var(--primary)', fontSize: '15px' }}>{formatBRL(totals.net)}</span></span>
            </div>
          </div>

          <div className="output-row" style={{ marginTop: '22px', borderTop: '1px solid var(--line)', paddingTop: '15px', paddingBottom: '15px' }}>
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
                <button className="secondary" onClick={handleSelectFolder} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderOpen size={14} /> Escolher Pasta
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '22px' }}>
            <button
              className="primary large"
              disabled={generating || parsing}
              onClick={handleGenerate}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Play size={14} /> {generating ? 'Consolidando...' : 'Gerar Planilha Geral'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
