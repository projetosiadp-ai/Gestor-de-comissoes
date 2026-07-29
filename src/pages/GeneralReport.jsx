import React, { useState, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, Upload, Download, RefreshCw,
  CheckCircle, AlertCircle, Play, Sparkles, Building, Users
} from 'lucide-react';
import { formatBRL } from '../App';
import { parseGeneralInputs, generateGeneralExcel } from '../services/reportGenerator';
import { areLikelySameBroker } from '../lib/core/text.js';

function findPossibleDuplicateBrokerPairs(names) {
  const relevant = names.filter(n => n && n !== 'Corretora não identificada');
  const pairs = [];
  for (let i = 0; i < relevant.length; i++) {
    for (let j = i + 1; j < relevant.length; j++) {
      if (areLikelySameBroker(relevant[i], relevant[j])) pairs.push([relevant[i], relevant[j]]);
    }
  }
  return pairs;
}

export default function GeneralReport({ refreshHistory, addLog }) {
  const log = (type, msg) => {
    if (addLog) addLog(type, msg);
  };

  const fileInputRef = useRef(null);

  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [corretoras, setCorretoras] = useState([]);
  const [possibleDuplicateBrokers, setPossibleDuplicateBrokers] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [dragOver, setDragOver] = useState(false);

  const handleDropzoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSelectFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFiles(files);
    }
    if (e.target) e.target.value = '';
  };

  const addFiles = async (files) => {
    const allowed = /\.(xlsx|xls)$/i;
    const filtered = files.filter(f => allowed.test(f.name));
    if (filtered.length === 0) {
      log('error', 'Nenhum arquivo .xlsx ou .xls válido foi selecionado.');
      setStatus({ type: 'error', message: 'Selecione planilhas nos formatos .xlsx ou .xls.' });
      return;
    }

    setSelectedFiles(filtered);
    setCorretoras([]);
    setPossibleDuplicateBrokers([]);
    setParsing(true);
    setStatus({ type: 'loading', message: 'Lendo planilhas de corretoras e agrupando...' });
    log('info', `Iniciando leitura de ${filtered.length} planilhas...`);

    try {
      const res = await parseGeneralInputs(filtered);
      if (res.errors && res.errors.length > 0) {
        res.errors.forEach(err => log('error', err));
      }

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
      setPossibleDuplicateBrokers(findPossibleDuplicateBrokerPairs(list.map(c => c.corretora)));

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
    const files = Array.from(e.dataTransfer.files || []);
    addFiles(files);
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

      const res = await generateGeneralExcel(reportMonth, payloadData);

      setStatus({
        type: 'success',
        message: `Relatório Geral gerado com sucesso:\nArquivo: ${res.fileName}`
      });
      log('success', `Relatório Geral baixado com sucesso: ${res.fileName}`);
    } catch (err) {
      setStatus({ type: 'error', message: `Erro ao gerar relatório: ${err.message}` });
      log('error', `Falha ao gerar Relatório Geral: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

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

  const getInputBorderStyle = (value, inputType) => {
    const val = Number(value || 0);
    if (val === 0) return { borderColor: 'var(--line)' };
    
    if (inputType === 'bonus') {
      return { borderColor: val > 0 ? 'var(--green)' : 'var(--red)', borderWidth: '1.5px' };
    } else if (inputType === 'deduction') {
      return { borderColor: val > 0 ? 'var(--red)' : 'var(--green)', borderWidth: '1.5px' };
    }
    return { borderColor: 'var(--line)' };
  };

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
            <div>
              <label>Planilhas por Corretora (.xlsx ou .xls)</label>
              
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".xlsx,.xls"
                onChange={handleSelectFiles}
                style={{ display: 'none' }}
              />

              <div
                className={`dropzone ${dragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleDropzoneClick}
                style={{ cursor: 'pointer' }}
              >
                <div className="upload-icon"><Upload size={24} /></div>
                <strong>Selecione ou Arraste os arquivos das corretoras</strong>
                <small>Clique para escolher planilhas (.xlsx ou .xls)</small>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--muted)' }}>Arquivos importados ({selectedFiles.length}):</strong>
                <div className="file-list" style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedFiles.map((f, idx) => (
                    <div key={idx} className="file-chip" title={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileSpreadsheet size={12} style={{ color: 'var(--green)' }} />
                      {f.name}
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
          </div>
        </div>
      )}

      {possibleDuplicateBrokers.length > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '12px',
          padding: '16px 20px',
          marginTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} color="#92400e" />
            <strong style={{ color: '#92400e', fontSize: '14px' }}>Possíveis corretoras duplicadas</strong>
          </div>
          <div style={{ color: '#78350f', fontSize: '13px', lineHeight: '1.6' }}>
            Os nomes abaixo parecem ser a mesma corretora escrita de forma diferente. O sistema NÃO uniu
            essas automaticamente por segurança — confira antes de enviar e, se forem a mesma, cadastre
            o apelido em "Configurar Corretoras":
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              {possibleDuplicateBrokers.map(([a, b], idx) => (
                <li key={idx}>"{a}" e "{b}"</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {corretoras.length > 0 && (
        <section className="panel" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={18} style={{ color: 'var(--primary)' }} />
                Corretoras a Consolidadar ({corretoras.length})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                Ajuste os valores financeiros (Diferenças, Meta, Taxas, IR) antes de gerar a planilha final.
              </p>
            </div>
            <button 
              className="primary" 
              onClick={handleGenerate} 
              disabled={generating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
            >
              {generating ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              Gerar e Baixar Relatório Geral (.xlsx)
            </button>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--header-bg, rgba(0,0,0,0.04))', borderBottom: '2px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Corretora</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Comissão Líquida</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Diferenças (+/-)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Meta (+)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Desc. Taxa (-)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Lanç. Futuros (+/-)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>IR (-)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Total a Pagar</th>
                </tr>
              </thead>
              <tbody>
                {corretoras.map((c, index) => {
                  const tc = Number(c.totalComissao || 0);
                  const dif = Number(c.diferencas || 0);
                  const mt = Number(c.meta || 0);
                  const tx = Number(c.descTaxa || 0);
                  const lf = Number(c.lancamentosFuturos || 0);
                  const irVal = Number(c.ir || 0);
                  const net = tc + dif + mt - tx + lf - irVal;

                  return (
                    <tr key={index} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{c.corretora}</td>
                      <td style={{ textAlign: 'center', padding: '10px' }}>
                        <select
                          value={c.category}
                          onChange={(e) => handleFieldChange(index, 'category', e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'var(--panel)',
                            color: 'var(--text)',
                            border: '1px solid var(--line)'
                          }}
                        >
                          <option value="PF">PF</option>
                          <option value="PJ">PJ</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px', fontWeight: '500' }}>{formatBRL(tc)}</td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>
                        {renderNumericInput(index, 'diferencas', c.diferencas, 'bonus')}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>
                        {renderNumericInput(index, 'meta', c.meta, 'bonus')}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>
                        {renderNumericInput(index, 'descTaxa', c.descTaxa, 'deduction')}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>
                        {renderNumericInput(index, 'lancamentosFuturos', c.lancamentosFuturos, 'bonus')}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>
                        {renderNumericInput(index, 'ir', c.ir, 'deduction')}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px', fontWeight: '700', color: 'var(--primary)' }}>
                        {formatBRL(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--header-bg, rgba(0,0,0,0.06))', fontWeight: 'bold' }}>
                  <td colSpan="2" style={{ padding: '12px 10px' }}>TOTAL GERAL</td>
                  <td style={{ textAlign: 'right', padding: '12px 10px' }}>{formatBRL(totals.commission)}</td>
                  <td colSpan="5"></td>
                  <td style={{ textAlign: 'right', padding: '12px 10px', fontSize: '14px', color: 'var(--primary)' }}>
                    {formatBRL(totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
