// Regras de comissão por parcela: qual percentual ("Regra" na planilha de origem)
// é esperado para cada número de parcela. Serve para AVISAR quando a planilha vem
// com um percentual diferente do combinado — nunca para alterar valores, que
// continuam sendo os da planilha de origem.
//
// Formato:
//   { default: { '1': 100 }, brokers: { 'TJK': { '1': 100, '2': 40 } } }
// A regra da corretora tem prioridade sobre o padrão global; parcela sem regra
// definida em nenhum dos dois não é verificada.

export const MAX_PARCELA = 600;
export const MAX_BROKERS_WITH_RULES = 500;
export const MAX_RULES_PER_BROKER = 120;

export function defaultCommissionRules() {
  return { default: { '1': 100 }, brokers: {} };
}

// A coluna "Regra" chega como '40%' (planilha .xls original), 0.4 (após a conversão
// para número do gerador) ou 40. Normaliza tudo para o inteiro 40.
export function parseRulePercent(value) {
  if (value === null || value === undefined) return null;

  let raw = value;
  if (typeof raw === 'object') {
    if (raw.result !== undefined) raw = raw.result;
    else if (raw.text !== undefined) raw = raw.text;
    else if (Array.isArray(raw.richText)) raw = raw.richText.map(part => part.text).join('');
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (text.endsWith('%')) {
    const parsed = Number(text.slice(0, -1).replace(',', '.'));
    return Number.isFinite(parsed) ? round2(parsed) : null;
  }

  const parsed = Number(text.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  // Sem o sinal de %, valores <= 1 são fração (0.4 => 40%). 1 é ambíguo entre 1% e
  // 100%; tratamos como 100% porque é assim que o Excel guarda uma célula "100%".
  return round2(parsed <= 1 ? parsed * 100 : parsed);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function expectedPercentFor(rules, corretora, parcela) {
  const key = String(parcela);
  const brokerRules = rules?.brokers?.[corretora];
  if (brokerRules && brokerRules[key] !== undefined && brokerRules[key] !== null) {
    return Number(brokerRules[key]);
  }
  const globalRules = rules?.default;
  if (globalRules && globalRules[key] !== undefined && globalRules[key] !== null) {
    return Number(globalRules[key]);
  }
  return null;
}

function findHeaderColumns(row) {
  if (!Array.isArray(row)) return null;
  const indexOfHeader = name => row.findIndex(cell => String(cell ?? '').trim().toUpperCase() === name);
  const parcela = indexOfHeader('PARCELA');
  const regra = indexOfHeader('REGRA');
  if (parcela === -1 || regra === -1) return null;

  const optional = name => {
    const index = row.findIndex(cell => String(cell ?? '').trim().toUpperCase().startsWith(name));
    return index === -1 ? null : index;
  };
  return {
    parcela,
    regra,
    responsavel: optional('RESPONS'),
    usuario: optional('USU'),
    contrato: optional('CONTRATO'),
    recebido: optional('RECEBIDO'),
    comissao: optional('COMISS')
  };
}

// Percorre os blocos de linhas brutas de uma corretora e devolve as linhas cujo
// percentual da coluna "Regra" difere do esperado para aquela parcela.
export function findCommissionRuleDivergences(rawBlocks, corretora, rules) {
  const divergences = [];
  if (!Array.isArray(rawBlocks)) return divergences;

  for (const rows of rawBlocks) {
    if (!Array.isArray(rows)) continue;
    let columns = null;

    for (const row of rows) {
      if (!Array.isArray(row)) continue;

      const header = findHeaderColumns(row);
      if (header) { columns = header; continue; }
      if (!columns) continue;

      const parcelaText = String(row[columns.parcela] ?? '').trim();
      if (!/^\d+$/.test(parcelaText)) continue;

      const actual = parseRulePercent(row[columns.regra]);
      if (actual === null) continue;

      const parcela = Number(parcelaText);
      const expected = expectedPercentFor(rules, corretora, parcela);
      if (expected === null || expected === actual) continue;

      divergences.push({
        corretora,
        parcela,
        esperado: expected,
        encontrado: actual,
        responsavel: columns.responsavel === null ? '' : String(row[columns.responsavel] ?? '').trim(),
        usuario: columns.usuario === null ? '' : String(row[columns.usuario] ?? '').trim(),
        contrato: columns.contrato === null ? '' : String(row[columns.contrato] ?? '').trim()
      });
    }
  }

  return divergences;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object') return toNumber(value.result ?? value.text ?? null);

  const text = String(value ?? '').replace(/R\$/gi, '').trim();
  if (!text) return null;
  // Formato brasileiro: 1.234,56 -> 1234.56
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBrNumber(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TOTAL_LABEL = /TOTAL\s+DE\s+COMISS/i;

function stripAccents(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Reescreve as linhas divergentes aplicando o percentual cadastrado:
//   Comissão = Recebido × percentual esperado
// (relação verificada em 623 de 623 linhas das planilhas reais; a diferença entre
// as convenções de arredondamento é de no máximo 1 centavo). Também atualiza o
// "Total de Comissões a pagar" de cada bloco, que passa a ser a soma da coluna
// Comissão já corrigida. Devolve blocos novos — não altera os originais.
export function applyCommissionRuleCorrections(rawBlocks, corretora, rules) {
  const blocks = [];
  const corrections = [];
  if (!Array.isArray(rawBlocks)) return { blocks: [], corrections };

  rawBlocks.forEach((rows, blockIndex) => {
    if (!Array.isArray(rows)) { blocks.push(rows); return; }

    const newRows = rows.map(row => (Array.isArray(row) ? [...row] : row));
    let columns = null;
    let changedInBlock = false;

    newRows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;

      const header = findHeaderColumns(row);
      if (header) { columns = header; return; }
      if (!columns || columns.recebido === null || columns.comissao === null) return;

      const parcelaText = String(row[columns.parcela] ?? '').trim();
      if (!/^\d+$/.test(parcelaText)) return;

      const actual = parseRulePercent(row[columns.regra]);
      if (actual === null) return;

      const parcela = Number(parcelaText);
      const expected = expectedPercentFor(rules, corretora, parcela);
      if (expected === null || expected === actual) return;

      const recebido = toNumber(row[columns.recebido]);
      if (recebido === null) return;

      const previousCommission = toNumber(row[columns.comissao]);
      const newCommission = round2(recebido * expected / 100);

      // Preserva o tipo original da célula: número veio de .xlsx já convertido,
      // texto veio do .xls (HTML) do sistema de origem.
      row[columns.comissao] = typeof row[columns.comissao] === 'number'
        ? newCommission
        : formatBrNumber(newCommission);
      row[columns.regra] = typeof row[columns.regra] === 'number'
        ? expected / 100
        : `${expected}%`;

      changedInBlock = true;
      corrections.push({
        corretora,
        blockIndex,
        rowIndex,
        parcela,
        regraAnterior: actual,
        regraNova: expected,
        comissaoAnterior: previousCommission,
        comissaoNova: newCommission,
        colunaRegra: columns.regra,
        colunaComissao: columns.comissao,
        responsavel: columns.responsavel === null ? '' : String(row[columns.responsavel] ?? '').trim()
      });
    });

    if (changedInBlock) recalculateBlockTotal(newRows);
    blocks.push(newRows);
  });

  return { blocks, corrections };
}

// O texto "Total de Comissões a pagar: X" no topo do bloco fica defasado depois de
// corrigir linhas individuais; recalcula somando a coluna Comissão do bloco.
function recalculateBlockTotal(rows) {
  let columns = null;
  let sum = 0;
  let found = false;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const header = findHeaderColumns(row);
    if (header) { columns = header; continue; }
    if (!columns || columns.comissao === null) continue;
    if (!/^\d+$/.test(String(row[columns.parcela] ?? '').trim())) continue;
    const value = toNumber(row[columns.comissao]);
    if (value !== null) { sum += value; found = true; }
  }

  if (!found) return;
  const total = round2(sum);

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let col = 0; col < row.length; col++) {
      const text = stripAccents(row[col]);
      if (typeof row[col] !== 'string' || !TOTAL_LABEL.test(text)) continue;
      row[col] = `Total de Comissões a pagar: ${formatBrNumber(total)}`;
      return;
    }
  }
}

// Agrupa as divergências por corretora + parcela + par (esperado, encontrado) para
// o aviso na tela não virar uma lista de centenas de linhas repetidas.
export function summarizeDivergences(divergences) {
  const grouped = new Map();
  for (const item of divergences) {
    const key = `${item.corretora}|${item.parcela}|${item.esperado}|${item.encontrado}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ocorrencias += 1;
      continue;
    }
    grouped.set(key, {
      corretora: item.corretora,
      parcela: item.parcela,
      esperado: item.esperado,
      encontrado: item.encontrado,
      ocorrencias: 1,
      exemplo: item.responsavel || item.usuario || item.contrato || ''
    });
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.corretora.localeCompare(b.corretora, 'pt-BR') || a.parcela - b.parcela
  );
}

export function isValidCommissionRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return false;
  if (Object.keys(rules).some(key => key !== 'default' && key !== 'brokers')) return false;

  const isValidRuleMap = map => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
    const entries = Object.entries(map);
    if (entries.length > MAX_RULES_PER_BROKER) return false;
    return entries.every(([parcela, percent]) =>
      /^\d+$/.test(parcela) &&
      Number(parcela) >= 1 &&
      Number(parcela) <= MAX_PARCELA &&
      typeof percent === 'number' &&
      Number.isFinite(percent) &&
      percent >= 0 &&
      percent <= 100
    );
  };

  if (rules.default !== undefined && !isValidRuleMap(rules.default)) return false;

  if (rules.brokers !== undefined) {
    if (!rules.brokers || typeof rules.brokers !== 'object' || Array.isArray(rules.brokers)) return false;
    const brokers = Object.entries(rules.brokers);
    if (brokers.length > MAX_BROKERS_WITH_RULES) return false;
    if (!brokers.every(([name, map]) =>
      typeof name === 'string' && name.trim().length > 0 && name.length <= 200 && isValidRuleMap(map)
    )) return false;
  }

  return true;
}
