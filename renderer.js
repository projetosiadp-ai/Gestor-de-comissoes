let selectedFiles = [];
let selectedSummaryFiles = [];
let selectedOutputFolder = '';
let selectedSummaryOutputFolder = '';
let savedReports = [];
let activeSavedReportId = null;

const $ = (id) => document.getElementById(id);
const navItems = [...document.querySelectorAll('.nav-item')];
const pages = [...document.querySelectorAll('.page')];
const pageSubtitle = $('pageSubtitle');
const pageSubtitles = {
  dashboard: 'Visão geral dos relatórios',
  'new-report': 'Importação e geração de relatórios',
  'saved-reports': 'Histórico mensal dos processamentos',
  'pdf-summary': 'Resumo único das comissões em PDF'
};

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function monthLabel(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return '';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, c => c.toUpperCase());
}

function navigate(pageName) {
  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
  pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageName}`));
  pageSubtitle.textContent = pageSubtitles[pageName] || '';
  if (pageName === 'saved-reports' || pageName === 'dashboard') refreshHistory();
}

navItems.forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));

function uniqueValidFiles(paths) {
  const allowed = /\.(xls|xlsx|html|htm)$/i;
  return [...new Set((paths || []).filter(p => allowed.test(p)))];
}

function renderFileList(files, countEl, listEl) {
  countEl.textContent = files.length ? `${files.length} arquivo(s) selecionado(s).` : 'Nenhum arquivo selecionado.';
  listEl.innerHTML = files.slice(0, 120).map(file => {
    const name = file.split(/[\\/]/).pop();
    return `<div class="file-chip" title="${escapeHtml(file)}">${escapeHtml(name)}</div>`;
  }).join('');
  if (files.length > 120) listEl.insertAdjacentHTML('beforeend', `<div class="file-chip">... e mais ${files.length - 120}</div>`);
}

function setupDropzone(element, onFiles) {
  ['dragenter', 'dragover'].forEach(name => element.addEventListener(name, event => {
    event.preventDefault();
    element.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(name => element.addEventListener(name, event => {
    event.preventDefault();
    element.classList.remove('dragover');
  }));
  element.addEventListener('drop', event => {
    const paths = window.api.getDroppedFilePaths(event.dataTransfer.files);
    onFiles(paths);
  });
}

const reportDropzone = $('reportDropzone');
reportDropzone.addEventListener('click', async () => {
  selectedFiles = uniqueValidFiles(await window.api.selectFiles());
  renderFileList(selectedFiles, $('fileCount'), $('fileList'));
});
setupDropzone(reportDropzone, paths => {
  selectedFiles = uniqueValidFiles([...selectedFiles, ...paths]);
  renderFileList(selectedFiles, $('fileCount'), $('fileList'));
});
$('clearFiles').addEventListener('click', () => {
  selectedFiles = [];
  renderFileList(selectedFiles, $('fileCount'), $('fileList'));
});

const summaryDropzone = $('summaryDropzone');
summaryDropzone.addEventListener('click', async () => {
  selectedSummaryFiles = uniqueValidFiles(await window.api.selectSummaryFiles());
  renderFileList(selectedSummaryFiles, $('summaryFileCount'), $('summaryFileList'));
});
setupDropzone(summaryDropzone, paths => {
  selectedSummaryFiles = uniqueValidFiles([...selectedSummaryFiles, ...paths]);
  renderFileList(selectedSummaryFiles, $('summaryFileCount'), $('summaryFileList'));
});

$('btnOutput').addEventListener('click', async () => {
  selectedOutputFolder = await window.api.selectOutputFolder();
  $('outputFolder').value = selectedOutputFolder;
});
$('btnSummaryOutput').addEventListener('click', async () => {
  selectedSummaryOutputFolder = await window.api.selectOutputFolder();
  $('summaryOutputFolder').value = selectedSummaryOutputFolder;
});

function setStatus(element, type, message) {
  element.className = `status ${type}`;
  element.textContent = message;
}

function setProgress(prefix, data) {
  const percent = Math.max(0, Math.min(100, Number(data.percent || 0)));
  const ids = prefix === 'summary'
    ? { percent: 'summaryProgressPercent', fill: 'summaryProgressFill', text: 'summaryProgressText', title: 'summaryProgressTitle' }
    : { percent: 'progressPercent', fill: 'progressFill', text: 'progressText', title: 'progressTitle' };
  $(ids.percent).textContent = `${percent}%`;
  $(ids.fill).style.width = `${percent}%`;
  $(ids.text).textContent = data.message || '';
  const labels = { leitura: 'Lendo arquivos', geracao: 'Gerando relatórios', concluido: 'Concluído', processando: 'Processando' };
  $(ids.title).textContent = labels[data.phase] || 'Processando';
}

window.api.onProgress(data => setProgress('', data));
window.api.onSummaryProgress(data => setProgress('summary', data));

function renderReportResult(result) {
  const summary = result.summary || [];
  const sellers = summary.reduce((sum, item) => sum + Number(item.vendedores || 0), 0);
  const totalValue = summary.reduce((sum, item) => sum + Number(item.totalConsolidado || 0), 0);
  $('resultSellers').textContent = sellers;
  $('resultBrokers').textContent = summary.length;
  $('resultValue').textContent = formatBRL(totalValue);
  $('resultFiles').textContent = result.totalFiles || 0;

  $('summary').innerHTML = `
    <table>
      <thead><tr><th>Corretora</th><th>Quantidade de vendedores</th><th>Valor total</th></tr></thead>
      <tbody>${summary.map(item => `
        <tr><td>${escapeHtml(item.corretora)}</td><td>${Number(item.vendedores || 0)}</td><td>${formatBRL(item.totalConsolidado)}</td></tr>
      `).join('')}</tbody>
    </table>`;
  $('resultSection').classList.remove('hidden');
}

$('btnGenerate').addEventListener('click', async () => {
  const reportMonth = $('reportMonth').value;
  if (!reportMonth) return setStatus($('status'), 'error', 'Informe o mês de referência do relatório.');
  if (!selectedFiles.length) return setStatus($('status'), 'error', 'Selecione ou arraste as planilhas de comissão.');
  if (!selectedOutputFolder) return setStatus($('status'), 'error', 'Escolha a pasta onde os relatórios serão salvos.');

  const button = $('btnGenerate');
  try {
    button.disabled = true;
    $('resultSection').classList.add('hidden');
    setProgress('', { percent: 0, message: 'Preparando...', phase: 'processando' });
    setStatus($('status'), 'loading', `Processando o relatório de ${monthLabel(reportMonth)}...`);

    const result = await window.api.generateReports({
      files: selectedFiles,
      outputFolder: selectedOutputFolder,
      sortAlpha: $('sortAlpha').checked,
      convertNumbers: $('convertNumbers').checked,
      reportMonth
    });

    renderReportResult(result);
    const errors = result.errors?.length ? `\nArquivos com erro: ${result.errors.length}` : '';
    setStatus($('status'), 'success', `Relatório de ${monthLabel(reportMonth)} gerado e salvo no histórico.\nPasta: ${result.outputRoot}${errors}`);
    await refreshHistory();
  } catch (error) {
    setStatus($('status'), 'error', error.message || 'Erro ao gerar os relatórios.');
  } finally {
    button.disabled = false;
  }
});

function renderPdfPreview(result) {
  $('summaryPdfPreview').classList.remove('hidden');
  $('summaryPdfPreview').innerHTML = `
    <div class="panel-head"><div><h2>Resumo gerado</h2><p>${result.items.length} corretora(s) — ${formatBRL(result.totalGeral)}</p></div></div>
    <div class="summary-table"><table><thead><tr><th>Corretora</th><th>Valor total</th></tr></thead><tbody>
      ${result.items.map(item => `<tr><td>${escapeHtml(item.corretora)}</td><td>${formatBRL(item.total)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

$('btnGenerateSummary').addEventListener('click', async () => {
  if (!selectedSummaryFiles.length) return setStatus($('summaryStatus'), 'error', 'Selecione ou arraste as planilhas prontas.');
  if (!selectedSummaryOutputFolder) return setStatus($('summaryStatus'), 'error', 'Escolha a pasta onde o PDF será salvo.');
  const button = $('btnGenerateSummary');
  try {
    button.disabled = true;
    $('summaryPdfPreview').classList.add('hidden');
    setProgress('summary', { percent: 0, message: 'Preparando...', phase: 'processando' });
    setStatus($('summaryStatus'), 'loading', 'Gerando o PDF único...');
    const result = await window.api.generateSummaryPdf({ files: selectedSummaryFiles, outputFolder: selectedSummaryOutputFolder });
    setStatus($('summaryStatus'), 'success', `PDF gerado com sucesso.\nArquivo: ${result.pdfPath}`);
    renderPdfPreview(result);
  } catch (error) {
    setStatus($('summaryStatus'), 'error', error.message || 'Erro ao gerar o PDF.');
  } finally {
    button.disabled = false;
  }
});

function reportRowsHtml(reports) {
  if (!reports.length) return '<div class="empty-state">Nenhum relatório salvo ainda.</div>';
  return `<table class="history-table"><thead><tr><th>Relatório</th><th>Vendedores</th><th>Corretoras</th><th>Valor total</th><th>Arquivos</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>
    ${reports.map(report => `<tr>
      <td><strong>${escapeHtml(report.label)}</strong></td>
      <td>${Number(report.sellers || 0)}</td><td>${Number(report.brokers || 0)}</td><td>${formatBRL(report.totalValue)}</td><td>${Number(report.inputFiles || 0)}</td>
      <td>${new Date(report.createdAt).toLocaleString('pt-BR')}</td>
      <td><div class="history-row-actions"><button data-open="${escapeHtml(report.outputRoot)}">Abrir pasta</button><button class="delete" data-delete="${escapeHtml(report.id)}">Excluir</button></div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function attachHistoryActions(root) {
  root.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => window.api.openPath(button.dataset.open)));
  root.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Excluir este registro do histórico? Os arquivos gerados não serão apagados.')) return;
    await window.api.deleteSavedReport(button.dataset.delete);
    activeSavedReportId = null;
    refreshHistory();
  }));
}

function renderHistory() {
  const totalSellers = savedReports.reduce((s, r) => s + Number(r.sellers || 0), 0);
  const totalBrokers = savedReports.reduce((s, r) => s + Number(r.brokers || 0), 0);
  const totalValue = savedReports.reduce((s, r) => s + Number(r.totalValue || 0), 0);
  $('dashReports').textContent = savedReports.length;
  $('dashSellers').textContent = totalSellers;
  $('dashBrokers').textContent = totalBrokers;
  $('dashValue').textContent = formatBRL(totalValue);

  const recent = savedReports.slice(0, 5);
  $('dashboardHistory').className = recent.length ? '' : 'empty-state';
  $('dashboardHistory').innerHTML = reportRowsHtml(recent);
  attachHistoryActions($('dashboardHistory'));

  $('savedTabs').innerHTML = savedReports.map(report => `<button class="saved-tab ${report.id === activeSavedReportId ? 'active' : ''}" data-report-tab="${escapeHtml(report.id)}">${escapeHtml(report.label)}</button>`).join('');
  $('savedTabs').querySelectorAll('[data-report-tab]').forEach(button => button.addEventListener('click', () => {
    activeSavedReportId = button.dataset.reportTab;
    renderHistory();
  }));

  const filtered = activeSavedReportId ? savedReports.filter(r => r.id === activeSavedReportId) : savedReports;
  $('savedReportsList').className = filtered.length ? '' : 'empty-state';
  $('savedReportsList').innerHTML = reportRowsHtml(filtered);
  attachHistoryActions($('savedReportsList'));
}

async function refreshHistory() {
  savedReports = await window.api.listSavedReports();
  renderHistory();
}

// Mês atual como padrão.
const now = new Date();
$('reportMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
renderFileList([], $('fileCount'), $('fileList'));
renderFileList([], $('summaryFileCount'), $('summaryFileList'));
refreshHistory();
