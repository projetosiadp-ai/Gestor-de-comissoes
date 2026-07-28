// Removed node:path

function normalizeBaseText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' E ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sufixos jurídicos/descritivos genéricos que corretoras costumam variar entre
// planilhas (nome curto vs. razão social completa). Usado para reconhecer que
// "TJK" e "TJK Corretora de Seguros Ltda" são a mesma corretora.
const GENERIC_LEGAL_SUFFIXES = ['LTDA', 'LIMITADA', 'EIRELI', 'EPP', 'S S', 'SA', 'ME'];
const GENERIC_BROKER_PHRASES = [
  'CORRETORA DE SEGUROS E CONSULTORIA',
  'CORRETORA DE SEGUROS',
  'CORRETAGEM DE SEGUROS',
  'ADMINISTRADORA E CORRETORA',
  'ADMINISTRADORA DE BENEFICIOS',
  'CONSULTORIA EM SEGUROS',
  'CORRETORA'
];

function stripTrailingToken(text, token) {
  const withSpace = ` ${token}`;
  if (text !== token && text.endsWith(withSpace)) {
    return text.slice(0, text.length - withSpace.length).trim();
  }
  return null;
}

function brokerNameCore(rawName) {
  let text = normalizeBaseText(rawName);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of GENERIC_LEGAL_SUFFIXES) {
      const stripped = stripTrailingToken(text, suffix);
      if (stripped !== null) { text = stripped; changed = true; break; }
    }
    if (changed) continue;
    for (const phrase of GENERIC_BROKER_PHRASES) {
      const stripped = stripTrailingToken(text, phrase);
      if (stripped !== null) { text = stripped; changed = true; break; }
    }
  }
  return text;
}

function isWordBoundaryPrefix(shorter, longer) {
  if (!longer.startsWith(shorter)) return false;
  return longer.length === shorter.length || longer[shorter.length] === ' ';
}

// Quantas palavras "sobram" no nome mais longo depois do prefixo compartilhado.
// Poucas palavras extras (ex: "Gestão de Benefícios") soa como um mesmo nome
// escrito com mais detalhe. Muitas palavras extras (ex: "Corp Soluções em Seguros
// e Rep. Com. Brasil") soa como um nome de empresa genuinamente diferente que só
// por acaso começa com a mesma palavra.
const MAX_EXTRA_WORDS_TO_FLAG = 3;

// Heurística para AVISAR (não unir automaticamente) quando duas corretoras que o
// sistema tratou como diferentes podem, na verdade, ser a mesma grafada de forma
// bem mais completa/detalhada (ex: "Theo Corretora" e "Theo Gestão de Benefícios
// Corretora de Seguros Ltda"). Não decide sozinho: só sinaliza para conferência
// humana, porque unir errado misturaria dinheiro de corretoras diferentes.
function areLikelySameBroker(nameA, nameB) {
  const coreA = brokerNameCore(nameA);
  const coreB = brokerNameCore(nameB);
  if (!coreA || !coreB || coreA === coreB) return false;

  const [shorter, longer] = coreA.length <= coreB.length ? [coreA, coreB] : [coreB, coreA];
  if (!isWordBoundaryPrefix(shorter, longer)) return false;

  const extra = longer.slice(shorter.length).trim();
  const extraWordCount = extra ? extra.split(' ').length : 0;
  return extraWordCount <= MAX_EXTRA_WORDS_TO_FLAG;
}

function safeFileName(name) {
  return String(name || 'SEM_NOME')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.richText) return value.richText.map(x => x.text).join('');
    if (value.result !== undefined) return String(value.result);
    if (value.formula !== undefined && value.result !== undefined) return String(value.result);
  }
  return String(value);
}

function parseVendedorCorretora(rawTitle, filePath = '') {
  let text = decodeHtml(getText(rawTitle))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ');

  let vendedor = '';
  let corretora = '';
  let isPrincipalCorretora = false;
  const parts = text.split(' - ').map(part => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const lastPartNorm = parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '');
    const genericSuffixes = ['EIRELI', 'ME', 'LTDA', 'SA', 'EPP', 'SS', 'LIMITADA', 'EIR', 'EIRE'];
    const isGenericDesc = /^(CORRETORA|CORRETORA DE SEGUROS|ADMINISTRADORA DE BENEFICIOS)( E SERVICOS)?( LTDA| ME| EIRELI| EPP| S\/S| LIMITADA)?$/i.test(parts[parts.length - 1]);
    
    if ((genericSuffixes.includes(lastPartNorm) || isGenericDesc) && parts.length === 2) {
      corretora = text;
      vendedor = 'Corretora principal';
      isPrincipalCorretora = true;
    } else {
      vendedor = parts[0];
      corretora = parts.slice(1).join(' - ');
    }
  }

  if (!corretora && text && !text.match(/^Per[ií]odo|^Lote|^Total|^Comissao/i)) {
    corretora = text;
    vendedor = 'Corretora principal';
    isPrincipalCorretora = true;
  }

  if ((!corretora || corretora === 'Corretora não identificada') && filePath) {
    let base = filePath;
    if (filePath) {
      // simple basename fallback for browser
      base = filePath.split(/[\\/]/).pop().split('.')[0] || filePath;
    }
    base = base
      .replace(/[_]+/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
    const fileParts = base.split(' - ').map(part => part.trim()).filter(Boolean);
    if (fileParts.length >= 2) {
      vendedor = vendedor || fileParts[0];
      corretora = fileParts.slice(1).join(' - ');
      text = text || base;
      isPrincipalCorretora = false;
    }
  }

  return {
    vendedor: vendedor || 'Corretora principal',
    corretora: corretora || 'Corretora não identificada',
    titulo: text || 'Identificação não encontrada',
    isPrincipalCorretora
  };
}

function parseBrazilNumber(text) {
  let value = String(text || '').trim();
  if (!value) return null;
  value = value.replace(/R\$/gi, '').replace(/\s+/g, '');
  const isPercent = value.endsWith('%');
  if (isPercent) value = value.slice(0, -1);
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(value) && !/^-?\d+(,\d+)?$/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)) {
    return null;
  }
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return isPercent ? number / 100 : number;
}

function parseBrazilCurrency(text) {
  const raw = String(text || '').replace(/R\$/gi, '').trim();
  const matches = raw.match(/-?\d{1,3}(?:\.\d{3})*,\d{1,2}|-?\d+,\d{1,2}|-?\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  let value = matches[matches.length - 1].replace(/\s/g, '');
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumberBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export {
  normalizeBaseText,
  brokerNameCore,
  areLikelySameBroker,
  safeFileName,
  decodeHtml,
  getText,
  parseVendedorCorretora,
  parseBrazilNumber,
  parseBrazilCurrency,
  formatNumberBR,
  formatBRL
};
