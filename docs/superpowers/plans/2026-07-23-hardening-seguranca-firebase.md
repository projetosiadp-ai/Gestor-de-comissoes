# Hardening de Segurança — Firebase (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o vazamento de nome+comissão individual de vendedor em `saved_reports`, travar o schema de todas as coleções do Firestore, remover o bypass de admin sem login, exigir confirmação explícita para promover administradores, cobrir tudo com testes automáticos contra o Firestore Emulator, e remover o material órfão da arquitetura Electron antiga (incluindo testes já quebrados por essa migração).

**Architecture:** SPA React+Vite existente, sem servidor (Firebase plano Spark). Criptografia AES-GCM 256 client-side via Web Crypto API nativa (sem dependência nova em produção) para os dados de vendedor antes de qualquer escrita no Firestore. Chave de equipe única, gerada uma vez por um administrador, guardada em `system_config/team_key` (leitura para todo usuário aprovado, escrita só para admin). Regras do Firestore travadas com `hasOnly()`/checagem de tipos em todas as coleções. Suíte de testes com `@firebase/rules-unit-testing` contra o Firestore Emulator, mantida separada do `npm test` padrão (exige Java).

**Tech Stack:** React 18, Vite, Firebase (Auth + Firestore, `firebase` 12.16.0), Web Crypto API (`crypto.subtle`, nativa), `node:test` (runner de testes já usado no projeto), `@firebase/rules-unit-testing` + `firebase-tools` (novos, dev-only, só para a suíte de regras).

## Global Constraints

- Nenhum código novo pode introduzir uma dependência de servidor (Cloud Functions, plano Blaze) — tudo roda no plano Spark/gratuito. Entrega de chave via servidor fica para uma Fase 2 futura, fora deste plano.
- Nenhum dado de nome+comissão individual de vendedor pode ser gravado em texto puro em nenhuma coleção do Firestore, em nenhum momento do plano (mesmo em passos intermediários — a ordem das tarefas evita isso).
- Toda coleção do Firestore (`users`, `reports`, `audit`, `saved_reports`, `system_config`) precisa ter validação de schema (`hasOnly()`/tipos) nas regras ao final do plano.
- Compatibilidade com o app existente é obrigatória: nenhuma tela (Dashboard, Analytics, SavedReports, exportação de planilhas) pode quebrar — todas continuam lendo `report.summary[].vendedoresDetalhes`/`nomesVendedores` normalmente, só que agora reidratado a partir de um blob cifrado.
- Autenticação (verificação de e-mail, política de senha) e conformidade formal com LGPD estão explicitamente fora de escopo (decisão do usuário, já registrada no spec aprovado).
- Siga o estilo do código existente: sem comentários desnecessários, `import`/`export` ESM nos arquivos `src/services`/`src/pages`, `require` CJS nos arquivos `tests/*.test.cjs` (com `await import()` + `pathToFileURL` para módulos `.mjs`, exatamente como `tests/cloud/report-sanitizer.test.cjs` já faz).

## Design Decisions (leia antes de implementar)

1. **O que é criptografado:** o campo `summary` inteiro do relatório (array por corretora, cada item com `corretora`, `vendedores`, `totalConsolidado`/`total`, `vendedoresDetalhes`, `nomesVendedores`) é serializado em JSON e cifrado como um único blob `encryptedSellerData`. Isso inclui o nome da corretora e o total agregado por corretora — não só o nome/valor do vendedor — porque esses dados vivem dentro da mesma estrutura e separar exigiria uma reestruturação maior sem ganho de segurança real (quem descriptografa já é `isApproved()`, o mesmo grupo que hoje vê tudo). O documento Firestore fora do blob cifrado mantém apenas contagens agregadas (`brokers`, `sellers`, `totalValue`) — nunca nome nem valor individual.
2. **Local storage não muda:** `localStorage` continua guardando o relatório completo em texto puro. A política de segurança é sobre o que sai do navegador para a nuvem — dado local do próprio usuário, no próprio computador, não é o alvo do achado.
3. **Chave de equipe só é criada por ação explícita de admin:** `generateTeamKey()` só é chamado pelo botão novo em "Configurar corretoras". `saveReport()` (chamado por qualquer operador aprovado) só **lê** a chave (`getTeamKey()`); se ela não existir ainda, o relatório é salvo localmente e a sincronização com a nuvem é pulada com um aviso no console — nunca tenta criar a chave (isso exigiria permissão de admin e falharia por regra para operadores).
4. **Regra de `update` em `saved_reports` reaplica o schema inteiro** (`validSavedReport()`) em vez de restringir por `diff().affectedKeys()` como em `reports`. Motivo: não existe hoje nenhum fluxo de UI que faça `update` parcial em `saved_reports` (relatórios são criados uma vez e depois excluídos via `delete`, nunca "editados"). Reaplicar o schema completo + checar que o autor é o criador (ou admin) fecha exatamente o buraco descrito no anexo ("substituir os dados de outra pessoa") sem inventar uma allowlist de campos que nenhum código usa.
5. **Limpeza do legado Electron é maior do que o spec original listou.** Rodar `npm test` hoje mostra 15 de 19 testes falhando: além dos arquivos já citados no spec (`old_NewReport.jsx`, `renderer.js`, `Gestão de comissões.html`, `fc.txt`, `tests/main/*`, `tests/security/electron-security.test.cjs`), toda a pasta `tests/core/*` e `tests/baseline/current-behavior.test.cjs` também dependem de `src/main/**/*.cjs`, que não existe mais desde a migração para SPA. Esse achado não estava no anexo — está descrito na seção "Achado adicional" abaixo e incluído na Tarefa 9 porque, sem isso, `npm test` mente sobre o estado do projeto e mina exatamente o objetivo do item "testes automáticos" do anexo.

## Achado adicional fora do anexo (para sua decisão)

Rodei `npm test` no estado atual do repositório: **4 de 19 testes passam**. Os 15 que falham não são regressões suas — são todos arquivos de teste órfãos da era Electron (`tests/main/*`, `tests/core/*`, `tests/baseline/*`, `tests/security/electron-security.test.cjs`) que ainda tentam carregar `main.js`/`src/main/**/*.cjs`, removidos na migração para SPA. Nenhum deles testa código que ainda existe. A Tarefa 9 deste plano remove esses arquivos (não só os quatro citados no spec original) para que `npm test` volte a refletir a realidade. Como consequência, ficam **sem cobertura de teste** os módulos `src/lib/core/*.js` e `src/lib/reports/*.js` (regras de comissão, deduplicação, formato de planilha) — eles tinham testes só na versão antiga, com caminhos de import que não existem mais. Recriar essa cobertura para o código atual é um trabalho separado (não é hardening de segurança) — sinalizo aqui para você decidir se quer um plano à parte para isso depois.

---

### Task 1: Biblioteca de criptografia AES-GCM (Web Crypto)

**Files:**
- Create: `src/lib/crypto/teamCipher.mjs`
- Test: `tests/lib/team-cipher.test.cjs`

**Interfaces:**
- Produces: `generateTeamKeyBase64(): Promise<string>`, `encryptJson(base64Key: string, data: any): Promise<string>`, `decryptJson(base64Key: string, payload: string): Promise<any>` — usados pelas Tarefas 2 e 3.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/lib/team-cipher.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/crypto/teamCipher.mjs'));
  return import(moduleUrl.href);
}

test('generates a base64 256-bit key', async () => {
  const { generateTeamKeyBase64 } = await loadModule();
  const key = await generateTeamKeyBase64();
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
  const raw = Buffer.from(key, 'base64');
  assert.equal(raw.length, 32);
});

test('encrypts and decrypts round-trip data', async () => {
  const { generateTeamKeyBase64, encryptJson, decryptJson } = await loadModule();
  const key = await generateTeamKeyBase64();
  const original = [{ corretora: 'ACME', vendedoresDetalhes: [{ nome: 'FULANO', total: 123.45 }] }];

  const payload = await encryptJson(key, original);
  assert.equal(typeof payload, 'string');
  assert.doesNotMatch(payload, /FULANO|ACME/);

  const decrypted = await decryptJson(key, payload);
  assert.deepEqual(decrypted, original);
});

test('produces a different ciphertext each time (random IV)', async () => {
  const { generateTeamKeyBase64, encryptJson } = await loadModule();
  const key = await generateTeamKeyBase64();
  const payloadA = await encryptJson(key, { a: 1 });
  const payloadB = await encryptJson(key, { a: 1 });
  assert.notEqual(payloadA, payloadB);
});

test('rejects decryption with the wrong key', async () => {
  const { generateTeamKeyBase64, encryptJson, decryptJson } = await loadModule();
  const keyA = await generateTeamKeyBase64();
  const keyB = await generateTeamKeyBase64();
  const payload = await encryptJson(keyA, { secret: true });
  await assert.rejects(decryptJson(keyB, payload));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/lib/team-cipher.test.cjs`
Expected: FAIL com `Cannot find module '.../src/lib/crypto/teamCipher.mjs'`

- [ ] **Step 3: Implementar o módulo**

Crie `src/lib/crypto/teamCipher.mjs`:

```js
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importTeamKey(base64Key) {
  const raw = fromBase64(base64Key);
  return crypto.subtle.importKey('raw', raw, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

export async function generateTeamKeyBase64() {
  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH_BITS }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

export async function encryptJson(base64Key, data) {
  const key = await importTeamKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptJson(base64Key, payload) {
  const [ivPart, ciphertextPart] = String(payload || '').split('.');
  if (!ivPart || !ciphertextPart) throw new Error('Payload cifrado inválido.');
  const key = await importTeamKey(base64Key);
  const iv = fromBase64(ivPart);
  const ciphertext = fromBase64(ciphertextPart);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/lib/team-cipher.test.cjs`
Expected: PASS nos 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/teamCipher.mjs tests/lib/team-cipher.test.cjs
git commit -m "feat: adiciona helper de criptografia AES-GCM para dados de equipe"
```

---

### Task 2: Serviço de chave de equipe + botão de geração na UI de admin

**Files:**
- Create: `src/services/teamKeyService.js`
- Modify: `src/pages/ConfigCorretoras.jsx`
- Modify: `docs/CONFIGURACAO_FIREBASE.md`

**Interfaces:**
- Consumes: `generateTeamKeyBase64` de `../lib/crypto/teamCipher.mjs` (Task 1).
- Produces: `getTeamKey(): Promise<string|null>`, `hasTeamKey(): Promise<boolean>`, `generateTeamKey(actor: {uid}): Promise<string>` — usados pela Tarefa 3 (`historyService.js`) e por este componente.

Este serviço não tem teste unitário dedicado porque depende do Firestore real (é coberto pela suíte de emulador na Tarefa 8). O botão de UI é verificado manualmente no navegador ao final da tarefa.

- [ ] **Step 1: Criar o serviço de chave**

Crie `src/services/teamKeyService.js`:

```js
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { generateTeamKeyBase64 } from '../lib/crypto/teamCipher.mjs';

const CONFIG_DOC_ID = 'team_key';
let cachedKey = null;

export async function getTeamKey() {
  if (cachedKey) return cachedKey;
  if (!db) return null;
  const snapshot = await getDoc(doc(db, 'system_config', CONFIG_DOC_ID));
  cachedKey = snapshot.exists() ? (snapshot.data().key || null) : null;
  return cachedKey;
}

export async function hasTeamKey() {
  return Boolean(await getTeamKey());
}

export async function generateTeamKey(actor) {
  if (!db) throw new Error('Firebase ainda não foi configurado.');
  if (!actor?.uid) throw new Error('Usuário autenticado obrigatório.');
  const key = await generateTeamKeyBase64();
  await setDoc(doc(db, 'system_config', CONFIG_DOC_ID), {
    key,
    createdAt: new Date().toISOString(),
    createdByUid: actor.uid
  });
  cachedKey = key;
  return key;
}
```

- [ ] **Step 2: Adicionar o painel de chave de equipe em `ConfigCorretoras.jsx`**

No topo de `src/pages/ConfigCorretoras.jsx`, adicione os imports:

```js
import { useAuth } from '../auth/AuthContext';
import { hasTeamKey, generateTeamKey } from '../services/teamKeyService';
```

Dentro do componente `ConfigCorretoras`, logo após a linha `const [status, setStatus] = useState({ type: '', message: '' });`, adicione:

```js
const session = useAuth();
const [teamKeyReady, setTeamKeyReady] = useState(null);
const [generatingKey, setGeneratingKey] = useState(false);

useEffect(() => {
  hasTeamKey().then(setTeamKeyReady).catch(() => setTeamKeyReady(false));
}, []);

const handleGenerateTeamKey = async () => {
  setGeneratingKey(true);
  try {
    await generateTeamKey(session.actor);
    setTeamKeyReady(true);
    log('success', 'Chave de criptografia da equipe gerada com sucesso.');
  } catch (err) {
    log('error', 'Falha ao gerar chave de equipe: ' + err.message);
  } finally {
    setGeneratingKey(false);
  }
};
```

Logo depois do bloco `{status.message && (...)}` no JSX (antes do `{loading ? (...` ), adicione:

```jsx
{session.isAdmin && teamKeyReady === false && (
  <div className="panel" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div>
      <b>Chave de criptografia da equipe não configurada</b>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Sem essa chave, novos relatórios não sincronizam o ranking de vendedores com a nuvem (ficam salvos só localmente).
        Gere a chave uma única vez.
      </p>
    </div>
    <button className="primary" disabled={generatingKey} onClick={handleGenerateTeamKey}>
      {generatingKey ? 'Gerando...' : 'Gerar chave de equipe'}
    </button>
  </div>
)}
```

- [ ] **Step 3: Documentar o passo no guia de configuração do Firebase**

Em `docs/CONFIGURACAO_FIREBASE.md`, depois da seção "## Primeiro Administrador", adicione:

```markdown
## Chave de criptografia da equipe (ranking de vendedores)

O histórico de relatórios salvos (`saved_reports`) guarda o nome e a comissão de cada
vendedor cifrados no navegador antes de ir para o Firestore. Depois de aprovar o
primeiro Administrador:

1. Entre como Administrador e abra **Configurar corretoras**.
2. Clique em **Gerar chave de equipe** (aparece só se ainda não existir).
3. A partir daí, todo relatório salvo por qualquer usuário aprovado passa a
   sincronizar o ranking de vendedores de forma cifrada.

**Limitação da Fase 1:** como não há servidor nesta fase, a chave fica em
`system_config/team_key`, legível por qualquer usuário aprovado — o mesmo grupo que
já acessa o dado cifrado. Isso protege contra acesso via console/API por quem não é
usuário do app e contra bugs de regra que exponham a coleção sem querer, mas não
protege um dispositivo roubado com o cache offline do Firestore ativo. Entrega de
chave via servidor fica para uma Fase 2 futura.
```

- [ ] **Step 4: Commit**

```bash
git add src/services/teamKeyService.js src/pages/ConfigCorretoras.jsx docs/CONFIGURACAO_FIREBASE.md
git commit -m "feat: adiciona geração de chave de equipe para criptografia do ranking"
```

---

### Task 3: Criptografar `vendedoresDetalhes`/`nomesVendedores` antes de ir para o Firestore

**Files:**
- Modify: `src/services/report-sanitizer.mjs`
- Modify: `src/services/historyService.js`
- Modify: `src/pages/NewReport.jsx:298`
- Test: `tests/cloud/saved-report-sanitizer.test.cjs`

**Interfaces:**
- Consumes: `encryptJson`, `decryptJson` (Task 1); `getTeamKey` (Task 2).
- Produces: `sanitizeSavedReportForCloud(report, user, encryptedSellerData): object` — o formato exato que a Tarefa 4 usa para escrever `safeSavedReportFields()` nas regras do Firestore. Campos: `id, month, label, createdAt, createdByUid, createdByName, brokers, sellers, totalValue, inputFiles, errors, encryptedSellerData, deletedAt, deletedByUid` (mais `date`, adicionado por `historyService.js` na escrita).

- [ ] **Step 1: Escrever o teste do sanitizador**

Crie `tests/cloud/saved-report-sanitizer.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('saved report contains only aggregate metadata plus an opaque encrypted blob', async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/report-sanitizer.mjs'));
  const { sanitizeSavedReportForCloud } = await import(moduleUrl.href);

  const sanitized = sanitizeSavedReportForCloud({
    id: '2026-07_123', month: '2026-07', label: 'Julho/2026', createdAt: '2026-07-16T10:00:00.000Z',
    createdByName: 'Operador Teste', brokers: 1, sellers: 3, totalValue: 123.45, inputFiles: 2,
    errors: ['arquivo1.xlsx: erro'],
    summary: [{ corretora: 'CORRETORA A', vendedoresDetalhes: [{ nome: 'VENDEDOR SENSÍVEL', total: 123.45 }] }]
  }, { uid: 'user-1', email: 'operador@empresa.com' }, 'aWZ2.Y2lwaGVy');

  assert.equal(sanitized.createdByUid, 'user-1');
  assert.equal(sanitized.encryptedSellerData, 'aWZ2.Y2lwaGVy');
  assert.equal(sanitized.errors, 1);
  assert.equal(sanitized.summary, undefined);
  assert.equal(sanitized.deletedAt, null);
  assert.equal(sanitized.deletedByUid, null);

  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /VENDEDOR SENSÍVEL|vendedoresDetalhes|summary/i);
});

test('throws without an authenticated user', async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/report-sanitizer.mjs'));
  const { sanitizeSavedReportForCloud } = await import(moduleUrl.href);
  assert.throws(() => sanitizeSavedReportForCloud({ id: 'x' }, {}, 'blob'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/cloud/saved-report-sanitizer.test.cjs`
Expected: FAIL — `sanitizeSavedReportForCloud is not a function`

- [ ] **Step 3: Adicionar `sanitizeSavedReportForCloud` a `report-sanitizer.mjs`**

No final de `src/services/report-sanitizer.mjs`, depois de `sanitizeReportForCloud`, adicione:

```js
export function sanitizeSavedReportForCloud(report, user, encryptedSellerData) {
  if (!user?.uid) throw new Error('Usuário autenticado obrigatório para sincronizar.');

  return {
    id: text(report.id, 120),
    month: text(report.month, 7),
    label: text(report.label, 80),
    createdAt: text(report.createdAt, 40),
    createdByUid: text(user.uid, 128),
    createdByName: text(report.createdByName, 120),
    brokers: number(report.brokers),
    sellers: number(report.sellers),
    totalValue: number(report.totalValue),
    inputFiles: number(report.inputFiles),
    errors: Array.isArray(report.errors) ? report.errors.length : number(report.errors),
    encryptedSellerData: text(encryptedSellerData, 200000),
    deletedAt: null,
    deletedByUid: null
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/cloud/saved-report-sanitizer.test.cjs`
Expected: PASS nos 2 testes.

- [ ] **Step 5: Reescrever `historyService.js` para cifrar na escrita e decifrar na leitura**

Substitua o conteúdo de `src/services/historyService.js` por:

```js
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { sanitizeSavedReportForCloud } from './report-sanitizer.mjs';
import { encryptJson, decryptJson } from '../lib/crypto/teamCipher.mjs';
import { getTeamKey } from './teamKeyService';

const LOCAL_STORAGE_KEY = 'dp_saved_reports_v2';

function getLocalReports() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error reading local reports:', err);
    return [];
  }
}

function saveLocalReports(reports) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    console.error('Error writing local reports:', err);
  }
}

export async function getSavedReports() {
  let reports = [];
  if (db) {
    try {
      const q = query(collection(db, 'saved_reports'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const teamKey = await getTeamKey();
      reports = await Promise.all(snapshot.docs.map(async d => {
        const data = d.data();
        let summary = [];
        if (data.encryptedSellerData && teamKey) {
          try {
            summary = await decryptJson(teamKey, data.encryptedSellerData);
          } catch (err) {
            console.error('Erro ao decifrar dados de vendedores do relatório', d.id, err);
          }
        }
        const { encryptedSellerData, ...rest } = data;
        return {
          id: d.id,
          ...rest,
          summary,
          date: data.date?.toDate()?.toISOString() || data.createdAt
        };
      }));
    } catch (err) {
      console.error('Error fetching reports from Firestore:', err);
    }
  }

  const local = getLocalReports();
  const mergedMap = new Map();
  local.forEach(r => mergedMap.set(r.id || r.month || r.key, r));
  reports.forEach(r => mergedMap.set(r.id || r.month || r.key, { ...mergedMap.get(r.id || r.month || r.key), ...r }));

  const mergedList = Array.from(mergedMap.values());
  mergedList.sort((a, b) => (b.month || b.createdAt || '').localeCompare(a.month || a.createdAt || ''));
  return mergedList;
}

export async function saveReport(reportData, actor) {
  const reportId = reportData.id || `${reportData.month || reportData.key}_${Date.now()}`;
  const completeReport = {
    ...reportData,
    id: reportId
  };

  const current = getLocalReports();
  const filtered = current.filter(r => r.id !== reportId && r.month !== completeReport.month);
  const updated = [completeReport, ...filtered];
  saveLocalReports(updated);

  if (db && actor?.uid) {
    try {
      const teamKey = await getTeamKey();
      if (teamKey) {
        const encryptedSellerData = await encryptJson(teamKey, completeReport.summary || []);
        const safeReport = sanitizeSavedReportForCloud(completeReport, actor, encryptedSellerData);
        const reportRef = doc(collection(db, 'saved_reports'), reportId);
        await setDoc(reportRef, { ...safeReport, date: Timestamp.now() });
      } else {
        console.warn('Chave de equipe ainda não configurada. Peça a um Administrador para gerá-la em "Configurar corretoras". Relatório salvo apenas localmente.');
      }
    } catch (err) {
      console.error('Error saving report to Firestore:', err);
    }
  }
}

export async function deleteReport(id) {
  const current = getLocalReports();
  const updated = current.filter(r => r.id !== id && r.month !== id && r.key !== id);
  saveLocalReports(updated);

  if (db) {
    try {
      await deleteDoc(doc(db, 'saved_reports', id));
    } catch (err) {
      console.error('Error deleting report from Firestore:', err);
    }
  }
}
```

- [ ] **Step 6: Atualizar o único ponto de chamada de `saveReport`**

Em `src/pages/NewReport.jsx:298`, troque:

```js
await saveReport(savedReport);
```

por:

```js
await saveReport(savedReport, session.actor);
```

(`session` já está em escopo nesse componente — usado na linha 294 para `session.actor?.uid`.)

- [ ] **Step 7: Rodar a suíte completa e confirmar que nada quebrou**

Run: `npm test`
Expected: os testes de `tests/cloud/*` continuam passando (o teste antigo `tests/cloud/report-sanitizer.test.cjs` não foi tocado). Ignore por enquanto as falhas pré-existentes do legado Electron — elas são resolvidas na Tarefa 9.

- [ ] **Step 8: Commit**

```bash
git add src/services/report-sanitizer.mjs src/services/historyService.js src/pages/NewReport.jsx tests/cloud/saved-report-sanitizer.test.cjs
git commit -m "feat: cifra nome e comissão de vendedores antes de sincronizar saved_reports"
```

---

### Task 4: Travar as regras do Firestore (`saved_reports`, `system_config`, `audit`)

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/cloud/firestore-rules.test.cjs`

**Interfaces:**
- Consumes: a lista exata de campos escrita por `sanitizeSavedReportForCloud` + `date` (Task 3): `id, month, label, date, createdAt, createdByUid, createdByName, brokers, sellers, totalValue, inputFiles, errors, encryptedSellerData, deletedAt, deletedByUid`.
- Produces: regras que a Tarefa 8 (suíte de emulador) valida de ponta a ponta.

- [ ] **Step 1: Substituir `firestore.rules` inteiro**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function currentUser() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isApproved() {
      return signedIn()
        && currentUser().status == 'approved'
        && currentUser().role in ['admin', 'operator'];
    }

    function isAdmin() {
      return isApproved() && currentUser().role == 'admin';
    }

    function safeReportFields() {
      return [
        'id', 'month', 'label', 'createdAt', 'createdByUid', 'createdByName',
        'sellers', 'brokers', 'totalValue', 'inputFiles', 'outputFiles', 'errors',
        'version', 'batchFingerprint', 'fileFingerprints', 'outputRoot',
        'deletedAt', 'deletedByUid'
      ];
    }

    function validNewReport() {
      return request.resource.data.keys().hasOnly(safeReportFields())
        && request.resource.data.keys().hasAll(safeReportFields())
        && request.resource.data.createdByUid == request.auth.uid
        && request.resource.data.id is string
        && request.resource.data.month is string
        && request.resource.data.createdAt is string
        && request.resource.data.batchFingerprint is string
        && request.resource.data.batchFingerprint.size() == 64
        && request.resource.data.fileFingerprints is list
        && request.resource.data.fileFingerprints.size() <= 500
        && request.resource.data.deletedAt == null
        && request.resource.data.deletedByUid == null;
    }

    function safeSavedReportFields() {
      return [
        'id', 'month', 'label', 'date', 'createdAt', 'createdByUid', 'createdByName',
        'brokers', 'sellers', 'totalValue', 'inputFiles', 'errors',
        'encryptedSellerData', 'deletedAt', 'deletedByUid'
      ];
    }

    function validSavedReport() {
      return request.resource.data.keys().hasOnly(safeSavedReportFields())
        && request.resource.data.keys().hasAll(safeSavedReportFields())
        && request.resource.data.createdByUid == request.auth.uid
        && request.resource.data.id is string
        && request.resource.data.month is string
        && request.resource.data.label is string
        && request.resource.data.createdAt is string
        && request.resource.data.createdByName is string
        && request.resource.data.date is timestamp
        && request.resource.data.brokers is number
        && request.resource.data.sellers is number
        && request.resource.data.totalValue is number
        && request.resource.data.inputFiles is number
        && request.resource.data.errors is number
        && request.resource.data.encryptedSellerData is string
        && request.resource.data.encryptedSellerData.size() <= 200000
        && request.resource.data.deletedAt == null
        && request.resource.data.deletedByUid == null;
    }

    function validCorretorasConfig() {
      return request.resource.data.keys().hasOnly(['config'])
        && request.resource.data.config is map
        && request.resource.data.config.size() <= 500;
    }

    function validTeamKey() {
      return request.resource.data.keys().hasOnly(['key', 'createdAt', 'createdByUid'])
        && request.resource.data.keys().hasAll(['key', 'createdAt', 'createdByUid'])
        && request.resource.data.key is string
        && request.resource.data.key.size() > 0
        && request.resource.data.key.size() <= 200
        && request.resource.data.createdAt is string
        && request.resource.data.createdByUid == request.auth.uid;
    }

    match /users/{userId} {
      allow create: if signedIn()
        && request.auth.uid == userId
        && request.resource.data.keys().hasOnly(['displayName', 'email', 'role', 'status', 'createdAt'])
        && request.resource.data.role == 'operator'
        && request.resource.data.status == 'pending'
        && request.resource.data.email == request.auth.token.email;
      allow read: if signedIn() && (request.auth.uid == userId || isAdmin());
      allow update: if isAdmin()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['displayName', 'role', 'status', 'approvedAt', 'approvedByUid']);
      allow delete: if false;
    }

    match /reports/{reportId} {
      allow read: if isApproved();
      allow create: if isApproved() && validNewReport() && request.resource.data.id == reportId;
      allow update: if isAdmin()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['deletedAt', 'deletedByUid']);
      allow delete: if isAdmin();
    }

    match /audit/{entryId} {
      allow read: if isAdmin();
      allow create: if isApproved()
        && request.resource.data.keys().hasOnly([
          'action', 'targetId', 'actorUid', 'actorEmail', 'actorName', 'createdAt', 'details'
        ])
        && request.resource.data.actorUid == request.auth.uid
        && request.resource.data.details.keys().hasOnly([
          'month', 'version', 'batchFingerprint', 'deletedAt', 'previousRole', 'newRole'
        ]);
      allow update, delete: if false;
    }

    match /saved_reports/{reportId} {
      allow read: if isApproved();
      allow create: if isApproved() && validSavedReport() && request.resource.data.id == reportId;
      allow update: if isApproved() && validSavedReport()
        && (resource.data.createdByUid == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    match /system_config/{configId} {
      allow read: if isApproved();
      allow write: if isAdmin()
        && (
          (configId == 'corretoras_config' && validCorretorasConfig()) ||
          (configId == 'team_key' && validTeamKey())
        );
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Estender o smoke-test de regex das regras**

Em `tests/cloud/firestore-rules.test.cjs`, adicione mais duas asserções ao teste existente (depois da linha `assert.doesNotMatch(rules, /\b(cpf|cliente|contrato|responsavel)\b/i);`):

```js
  assert.match(rules, /function validSavedReport\(\)/);
  assert.match(rules, /resource\.data\.createdByUid == request\.auth\.uid \|\| isAdmin\(\)/);
```

- [ ] **Step 3: Rodar o teste e confirmar que passa**

Run: `node --test tests/cloud/firestore-rules.test.cjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules tests/cloud/firestore-rules.test.cjs
git commit -m "feat: trava schema e propriedade de saved_reports e system_config nas regras"
```

*(As regras só são validadas de ponta a ponta contra o comportamento real na Tarefa 8, que roda contra o Firestore Emulator. Depois de terminar esta tarefa, publique as regras manualmente com `npx firebase-tools deploy --only firestore:rules --project comissoesdp` quando estiver pronto para produção — isso é uma ação com efeito em ambiente compartilhado, então só faça isso com sua confirmação explícita.)*

---

### Task 5: Validação de formato client-side para `corretoras_config`

**Files:**
- Create: `src/services/corretoras-config-validator.mjs`
- Modify: `src/services/configService.js`
- Test: `tests/cloud/corretoras-config-validator.test.cjs`

**Interfaces:**
- Produces: `isValidCorretorasConfig(config: unknown): boolean` — usado por `configService.js` antes de qualquer `setDoc`.

- [ ] **Step 1: Escrever o teste do validador**

Crie `tests/cloud/corretoras-config-validator.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/services/corretoras-config-validator.mjs'));
  return import(moduleUrl.href);
}

test('accepts a well-formed broker alias map', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': ['AS PRIME', 'ASSURE'] }), true);
});

test('accepts an empty map', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({}), true);
});

test('rejects a non-object payload', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig('not-an-object'), false);
  assert.equal(isValidCorretorasConfig(null), false);
  assert.equal(isValidCorretorasConfig(['a', 'b']), false);
});

test('rejects aliases that are not strings', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': [123, 'ASSURE'] }), false);
});

test('rejects an alias list that is not an array', async () => {
  const { isValidCorretorasConfig } = await loadModule();
  assert.equal(isValidCorretorasConfig({ 'AS PRIME': 'ASSURE' }), false);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/cloud/corretoras-config-validator.test.cjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o validador**

Crie `src/services/corretoras-config-validator.mjs`:

```js
export function isValidCorretorasConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  return Object.entries(config).every(([brokerName, aliases]) =>
    typeof brokerName === 'string' &&
    brokerName.trim().length > 0 &&
    brokerName.length <= 200 &&
    Array.isArray(aliases) &&
    aliases.length <= 100 &&
    aliases.every(alias => typeof alias === 'string' && alias.trim().length > 0 && alias.length <= 200)
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/cloud/corretoras-config-validator.test.cjs`
Expected: PASS nos 5 testes.

- [ ] **Step 5: Usar o validador em `configService.js`**

Em `src/services/configService.js`, adicione o import no topo:

```js
import { isValidCorretorasConfig } from './corretoras-config-validator.mjs';
```

E troque `saveCorretorasConfig`:

```js
export async function saveCorretorasConfig(config) {
  if (!db) {
    console.warn('Firebase DB não inicializado. Não foi possível salvar.');
    return;
  }

  if (!isValidCorretorasConfig(config)) {
    throw new Error('Formato de configuração de corretoras inválido.');
  }

  try {
    const docRef = doc(db, 'system_config', CONFIG_DOC_ID);
    await setDoc(docRef, { config }, { merge: true });
  } catch (error) {
    console.error('Erro ao salvar configuração de corretoras:', error);
    throw error;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/services/corretoras-config-validator.mjs src/services/configService.js tests/cloud/corretoras-config-validator.test.cjs
git commit -m "feat: valida formato das corretoras antes de salvar no system_config"
```

---

### Task 6: Remover o bypass de admin sem login ("modo local")

**Files:**
- Modify: `src/auth/AuthContext.jsx`
- Modify: `src/auth/AuthScreen.jsx`
- Modify: `src/App.jsx:177`

**Interfaces:**
- Produces: `useAuth().configured` continua existindo, mas agora quando `false` nunca há `user`/`profile` sintéticos — `AuthScreen` passa a tratar esse caso mostrando uma tela de erro bloqueante.

- [ ] **Step 1: Remover a sessão sintética de `AuthContext.jsx`**

Em `src/auth/AuthContext.jsx`, remova a função `localSession()` inteira (linhas 13-18) e troque:

```js
const initial = firebaseConfigured ? { user: null, profile: null } : localSession();
const [user, setUser] = useState(initial.user);
const [profile, setProfile] = useState(initial.profile);
const [loading, setLoading] = useState(firebaseConfigured);
```

por:

```js
const [user, setUser] = useState(null);
const [profile, setProfile] = useState(null);
const [loading, setLoading] = useState(firebaseConfigured);
```

- [ ] **Step 2: Adicionar a tela bloqueante em `AuthScreen.jsx`**

Em `src/auth/AuthScreen.jsx`, logo antes de `if (auth.loading) return <div className="auth-loading">Carregando acesso seguro...</div>;`, adicione:

```jsx
if (!auth.configured) {
  return (
    <main className="auth-shell">
      <section className="auth-card pending">
        <h1>Configuração do Firebase ausente</h1>
        <p>
          Este aplicativo não pode operar sem uma configuração válida do Firebase.
          Nenhum acesso é liberado enquanto isso não for corrigido — nem mesmo de
          administrador. Preencha as variáveis <code>VITE_FIREBASE_*</code> em um
          arquivo <code>.env</code> (veja <code>docs/CONFIGURACAO_FIREBASE.md</code>).
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Corrigir a condição de gate em `App.jsx`**

Em `src/App.jsx:177`, troque:

```js
if (session.loading || (session.configured && (!session.user || session.profile?.status !== 'approved'))) {
  return <AuthScreen />;
}
```

por:

```js
if (session.loading || !session.configured || !session.user || session.profile?.status !== 'approved') {
  return <AuthScreen />;
}
```

- [ ] **Step 4: Verificar manualmente no navegador**

Rode `npm run dev`, sem um `.env` configurado (ou com um `.env` vazio), abra o app no navegador e confirme que aparece a tela "Configuração do Firebase ausente" — não o dashboard. Depois configure um `.env` válido (veja `docs/CONFIGURACAO_FIREBASE.md`) e confirme que o fluxo normal de login volta a funcionar.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthContext.jsx src/auth/AuthScreen.jsx src/App.jsx
git commit -m "fix: remove bypass de admin sem login quando Firebase não está configurado"
```

---

### Task 7: Confirmação explícita + auditoria detalhada ao promover administrador

**Files:**
- Modify: `src/services/cloudUsers.js`
- Modify: `src/pages/UserManagement.jsx`

**Interfaces:**
- `updateUserAccess(userId, {role, status}, adminUser, previousRole)` — assinatura estendida (era `updateUserAccess(userId, {role, status}, adminUser)`).

- [ ] **Step 1: Registrar `previousRole`/`newRole` na auditoria**

Em `src/services/cloudUsers.js`, troque `updateUserAccess`:

```js
export async function updateUserAccess(userId, { role, status }, adminUser, previousRole) {
  requireCloud();
  if (!['admin', 'operator'].includes(role)) throw new Error('Perfil inválido.');
  if (!['approved', 'pending', 'rejected'].includes(status)) throw new Error('Status inválido.');
  await updateDoc(doc(db, 'users', userId), {
    role,
    status,
    approvedAt: status === 'approved' ? new Date().toISOString() : null,
    approvedByUid: status === 'approved' ? adminUser.uid : null
  });
  await addAudit(`user.${status}`, userId, adminUser, {
    previousRole: previousRole || null,
    newRole: role
  });
}
```

- [ ] **Step 2: Adicionar a confirmação por e-mail em `UserManagement.jsx`**

Substitua o conteúdo de `src/pages/UserManagement.jsx` por:

```jsx
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock3, ShieldCheck, UserCog, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { subscribeUsers, updateUserAccess } from '../services/cloudUsers';

export default function UserManagement() {
  const session = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [promotionTarget, setPromotionTarget] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState('');

  useEffect(() => {
    if (!session.configured || !session.isAdmin) return undefined;
    return subscribeUsers(setUsers, failure => setError(failure.message));
  }, [session.configured, session.isAdmin]);

  const changeAccess = async (userId, role, status, previousRole) => {
    setBusyId(userId);
    setError('');
    try {
      await updateUserAccess(userId, { role, status }, session.actor, previousRole);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  };

  const requestPromotion = user => {
    setPromotionTarget(user);
    setConfirmEmail('');
  };

  const cancelPromotion = () => {
    setPromotionTarget(null);
    setConfirmEmail('');
  };

  const confirmPromotion = async () => {
    if (!promotionTarget) return;
    if (confirmEmail.trim().toLowerCase() !== String(promotionTarget.email || '').toLowerCase()) return;
    await changeAccess(promotionTarget.id, 'admin', 'approved', promotionTarget.role);
    cancelPromotion();
  };

  if (!session.configured) {
    return <div className="page active"><div className="empty-state">Configure o Firebase para gerenciar contas compartilhadas.</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-title"><div><h1>Usuários e acessos</h1><p>Aprove solicitações e defina o perfil de cada pessoa.</p></div></div>
      {error && <div className="status error">{error}</div>}
      {promotionTarget && (
        <section className="panel" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} />
            <b>Confirmar promoção a Administrador</b>
          </div>
          <p style={{ margin: 0 }}>
            Para promover <b>{promotionTarget.displayName || promotionTarget.email}</b> a Administrador,
            digite o e-mail da conta para confirmar: <b>{promotionTarget.email}</b>
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={event => setConfirmEmail(event.target.value)}
            placeholder="Digite o e-mail para confirmar"
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, background: 'var(--panel)', color: 'var(--text)' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              disabled={busyId === promotionTarget.id || confirmEmail.trim().toLowerCase() !== String(promotionTarget.email || '').toLowerCase()}
              onClick={confirmPromotion}
            >
              Confirmar promoção
            </button>
            <button className="ghost" onClick={cancelPromotion}>Cancelar</button>
          </div>
        </section>
      )}
      <section className="panel user-access-list">
        {users.length === 0 && <div className="empty-state">Nenhuma conta encontrada.</div>}
        {users.sort((a, b) => String(a.status).localeCompare(String(b.status))).map(user => (
          <article className="user-access-row" key={user.id}>
            <span className={`user-status ${user.status}`}>
              {user.status === 'approved' ? <CheckCircle size={16} /> : user.status === 'rejected' ? <XCircle size={16} /> : <Clock3 size={16} />}
            </span>
            <div><b>{user.displayName || user.email}</b><small>{user.email}</small></div>
            <span className="role-badge">{user.role === 'admin' ? <ShieldCheck size={14} /> : <UserCog size={14} />}{user.role === 'admin' ? 'Administrador' : 'Operador'}</span>
            <div className="user-access-actions">
              <button disabled={busyId === user.id} onClick={() => changeAccess(user.id, 'operator', 'approved', user.role)}>Aprovar Operador</button>
              <button disabled={busyId === user.id || user.role === 'admin'} onClick={() => requestPromotion(user)}>Tornar Admin</button>
              <button className="ghost danger" disabled={busyId === user.id || user.id === session.user.uid} onClick={() => changeAccess(user.id, user.role || 'operator', 'rejected', user.role)}>Bloquear</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar manualmente no navegador**

Com Firebase configurado e logado como admin, abra "Usuários", clique em "Tornar Admin" para um operador aprovado e confirme que: (1) o botão "Confirmar promoção" fica desabilitado até o e-mail digitado bater exatamente com o e-mail do usuário-alvo; (2) depois de confirmar, o usuário vira admin; (3) em "Auditoria", a entrada `user.approved` mostra os detalhes com `previousRole`/`newRole` (inspecione via console do Firestore, já que `AuditLog.jsx` não renderiza `details` na tela — isso é esperado, é só o registro que precisa existir).

- [ ] **Step 4: Commit**

```bash
git add src/services/cloudUsers.js src/pages/UserManagement.jsx
git commit -m "feat: exige confirmação por e-mail e audita previousRole/newRole ao promover admin"
```

---

### Task 8: Suíte de testes de regras com o Firestore Emulator

**Files:**
- Create: `tests/cloud/firestore-rules-emulator.test.cjs`
- Modify: `firebase.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `firestore.rules` (Task 4).
- Produces: script `npm run test:rules`, separado de `npm test` (exige Java + o Firestore Emulator, não roda em todo ambiente).

**Pré-requisito de ambiente:** o Firestore Emulator precisa de Java (JRE 11+) instalado e no `PATH`. Se não estiver disponível, este teste não pode ser executado localmente — nesse caso, pule a verificação deste Task e sinalize isso claramente ao final, sem marcar como testado.

- [ ] **Step 1: Instalar as dependências de teste**

Run: `npm install --save-dev @firebase/rules-unit-testing firebase-tools`
Expected: `package.json` ganha as duas entradas em `devDependencies`.

- [ ] **Step 2: Configurar a porta do emulador em `firebase.json`**

Em `firebase.json`, adicione a chave `emulators`:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

- [ ] **Step 3: Escrever a suíte de testes de regras**

Crie `tests/cloud/firestore-rules-emulator.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let rulesTesting;
let testEnvironment;

function seedUser(uid, data) {
  return testEnvironment.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('users').doc(uid).set(data);
  });
}

function seedDoc(collectionName, docId, data) {
  return testEnvironment.withSecurityRulesDisabled(async context => {
    await context.firestore().collection(collectionName).doc(docId).set(data);
  });
}

const PENDING_UID = 'pending-user';
const OPERATOR_UID = 'operator-user';
const OTHER_OPERATOR_UID = 'other-operator-user';
const ADMIN_UID = 'admin-user';

const VALID_SAVED_REPORT = {
  id: 'saved-1', month: '2026-07', label: 'Julho/2026', createdAt: '2026-07-16T10:00:00.000Z',
  createdByUid: OPERATOR_UID, createdByName: 'Operador', brokers: 1, sellers: 3, totalValue: 100,
  inputFiles: 1, errors: 0, encryptedSellerData: 'aWZ2.Y2lwaGVy', deletedAt: null, deletedByUid: null
};

test.before(async () => {
  rulesTesting = require('@firebase/rules-unit-testing');
  testEnvironment = await rulesTesting.initializeTestEnvironment({
    projectId: 'comissoesdp-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

test.after(async () => {
  if (testEnvironment) await testEnvironment.cleanup();
});

test.beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seedUser(PENDING_UID, { displayName: 'Pendente', email: 'pendente@empresa.com', role: 'operator', status: 'pending', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(OPERATOR_UID, { displayName: 'Operador', email: 'operador@empresa.com', role: 'operator', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(OTHER_OPERATOR_UID, { displayName: 'Outro Operador', email: 'outro@empresa.com', role: 'operator', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
  await seedUser(ADMIN_UID, { displayName: 'Admin', email: 'admin@empresa.com', role: 'admin', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' });
});

test('anonymous cannot read any protected collection', async () => {
  const context = testEnvironment.unauthenticatedContext();
  await rulesTesting.assertFails(context.firestore().collection('reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('audit').get());
  await rulesTesting.assertFails(context.firestore().collection('system_config').doc('corretoras_config').get());
});

test('pending user cannot read reports, saved_reports, audit or system_config', async () => {
  const context = testEnvironment.authenticatedContext(PENDING_UID, { email: 'pendente@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('audit').get());
  await rulesTesting.assertFails(context.firestore().collection('system_config').doc('corretoras_config').get());
});

test('pending user can create their own pending user doc but not approve themselves', async () => {
  const context = testEnvironment.authenticatedContext('new-uid', { email: 'novo@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('users').doc('new-uid').set({
    displayName: 'Novo', email: 'novo@empresa.com', role: 'operator', status: 'pending', createdAt: '2026-07-23T00:00:00.000Z'
  }));
  await rulesTesting.assertFails(context.firestore().collection('users').doc('new-uid').set({
    displayName: 'Novo', email: 'novo@empresa.com', role: 'admin', status: 'approved', createdAt: '2026-07-23T00:00:00.000Z'
  }));
});

test('approved operator can read saved_reports but cannot write outside the safe schema', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').get());
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('bad-1').set({
    id: 'bad-1', month: '2026-07', vendedoresDetalhes: [{ nome: 'FULANO', total: 999 }]
  }));
});

test('approved operator can create a well-formed saved_report as themselves', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    date: new Date()
  }));
});

test('approved operator cannot create a saved_report claiming another creator', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    createdByUid: OTHER_OPERATOR_UID,
    date: new Date()
  }));
});

test('an operator cannot overwrite a saved_report created by someone else', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OTHER_OPERATOR_UID, { email: 'outro@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    createdByUid: OPERATOR_UID,
    totalValue: 999999,
    date: new Date()
  }));
});

test('the creator can update their own saved_report', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    totalValue: 200,
    date: new Date()
  }));
});

test('an admin can overwrite any saved_report and delete it', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').set({
    ...VALID_SAVED_REPORT,
    totalValue: 300,
    date: new Date()
  }));
  await rulesTesting.assertSucceeds(context.firestore().collection('saved_reports').doc('saved-1').delete());
});

test('an operator cannot delete a saved_report', async () => {
  await seedDoc('saved_reports', 'saved-1', { ...VALID_SAVED_REPORT, date: new Date() });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('saved_reports').doc('saved-1').delete());
});

test('only an admin can write system_config, and only in the expected shape', async () => {
  const operatorContext = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(operatorContext.firestore().collection('system_config').doc('corretoras_config').set({ config: {} }));

  const adminContext = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('system_config').doc('corretoras_config').set({ config: { 'ACME': ['ACME'] } }));
  await rulesTesting.assertFails(adminContext.firestore().collection('system_config').doc('corretoras_config').set({ config: 'not-a-map' }));
  await rulesTesting.assertFails(adminContext.firestore().collection('system_config').doc('team_key').set({ key: 'abc', extraField: true, createdAt: '2026-07-23', createdByUid: ADMIN_UID }));
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('system_config').doc('team_key').set({ key: 'abc', createdAt: '2026-07-23', createdByUid: ADMIN_UID }));
});

test('approved users (not just admins) can read system_config once written', async () => {
  await seedDoc('system_config', 'team_key', { key: 'abc', createdAt: '2026-07-23', createdByUid: ADMIN_UID });
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertSucceeds(context.firestore().collection('system_config').doc('team_key').get());
});

test('only an admin can read audit, and audit entries cannot include unexpected detail keys', async () => {
  const operatorContext = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(operatorContext.firestore().collection('audit').get());
  await rulesTesting.assertSucceeds(operatorContext.firestore().collection('audit').add({
    action: 'user.approved', targetId: OTHER_OPERATOR_UID, actorUid: OPERATOR_UID,
    actorEmail: 'operador@empresa.com', actorName: 'Operador', createdAt: '2026-07-23T00:00:00.000Z',
    details: { previousRole: 'operator', newRole: 'admin' }
  }));
  await rulesTesting.assertFails(operatorContext.firestore().collection('audit').add({
    action: 'user.approved', targetId: OTHER_OPERATOR_UID, actorUid: OPERATOR_UID,
    actorEmail: 'operador@empresa.com', actorName: 'Operador', createdAt: '2026-07-23T00:00:00.000Z',
    details: { previousRole: 'operator', newRole: 'admin', secretNote: 'nao deveria existir' }
  }));

  const adminContext = testEnvironment.authenticatedContext(ADMIN_UID, { email: 'admin@empresa.com' });
  await rulesTesting.assertSucceeds(adminContext.firestore().collection('audit').get());
});

test('an admin cannot self-promote by editing arbitrary user fields', async () => {
  const context = testEnvironment.authenticatedContext(OPERATOR_UID, { email: 'operador@empresa.com' });
  await rulesTesting.assertFails(context.firestore().collection('users').doc(OPERATOR_UID).update({ role: 'admin', status: 'approved' }));
});
```

- [ ] **Step 4: Adicionar o script `test:rules` ao `package.json`**

Em `package.json`, dentro de `scripts`, adicione:

```json
"test:rules": "firebase emulators:exec --only firestore --project comissoesdp-rules-test \"node --test tests/cloud/firestore-rules-emulator.test.cjs\""
```

(script completo fica assim, mantendo os já existentes: `dev`, `build`, `preview`, `test`, `test:ui`, `test:all`, mais este `test:rules`)

- [ ] **Step 5: Rodar a suíte de emulador**

Run: `npm run test:rules`
Expected: PASS em todos os testes (o `firebase emulators:exec` sobe o emulador, roda o comando, e derruba o emulador ao final). Se o comando falhar com erro relacionado a Java ausente, documente isso na conversa com o usuário em vez de tentar contornar — não é algo para "resolver" silenciosamente instalando software no sistema sem avisar.

- [ ] **Step 6: Commit**

```bash
git add tests/cloud/firestore-rules-emulator.test.cjs firebase.json package.json package-lock.json
git commit -m "test: adiciona suíte de regras do Firestore contra o emulador"
```

---

### Task 9: Remover o legado Electron (arquivos órfãos e testes já quebrados)

**Files:**
- Delete: `old_NewReport.jsx`, `renderer.js`, `Gestão de comissões.html`, `fc.txt`
- Delete: `tests/main/configuration.test.cjs`, `tests/main/input-reader.test.cjs`, `tests/main/ipc-contract.test.cjs`, `tests/main/ipc-registrars.test.cjs`, `tests/main/launcher.test.cjs`, `tests/main/window-factory.test.cjs`, `tests/main/workbook-format.test.cjs`
- Delete: `tests/security/electron-security.test.cjs`
- Delete: `tests/helpers/electron-main-harness.cjs`
- Delete: `tests/core/duplicate-analysis.test.cjs`, `tests/core/history-store.test.cjs`, `tests/core/process-safety.test.cjs`, `tests/core/processing-jobs.test.cjs`, `tests/core/text.test.cjs`
- Delete: `tests/baseline/current-behavior.test.cjs`
- Delete: `tests/fixtures/sample-export.xls`
- Modify: `docs/ARQUITETURA.md`
- Modify: `LEIA-ME.txt`
- Modify: `package.json` (remove o campo `"main": "main.js"`, que aponta para um arquivo inexistente)

- [ ] **Step 1: Confirmar que nenhum arquivo restante depende do que será removido**

Run:

```bash
git grep -l "main\.js\|electron-main-harness\|src/main/" -- '*.js' '*.jsx' '*.cjs' '*.json' ':!docs/superpowers/**'
```

Expected: só aparecem os próprios arquivos listados para exclusão nesta tarefa, mais `package.json` (campo `main`) — nada em `src/`.

- [ ] **Step 2: Remover os arquivos órfãos**

```bash
git rm "old_NewReport.jsx" "renderer.js" "Gestão de comissões.html" "fc.txt"
git rm -r tests/main tests/security/electron-security.test.cjs tests/helpers/electron-main-harness.cjs
git rm tests/core/duplicate-analysis.test.cjs tests/core/history-store.test.cjs tests/core/process-safety.test.cjs tests/core/processing-jobs.test.cjs tests/core/text.test.cjs
git rm tests/baseline/current-behavior.test.cjs
git rm tests/fixtures/sample-export.xls
```

Se `tests/core`, `tests/baseline` ou `tests/fixtures` ficarem vazios depois disso, remova as pastas vazias também (`git rm` já remove o diretório se ficar sem conteúdo rastreado; confirme com `git status`).

- [ ] **Step 3: Remover o campo `main` órfão de `package.json`**

Em `package.json`, remova a linha:

```json
"main": "main.js",
```

- [ ] **Step 4: Reescrever `docs/ARQUITETURA.md`**

Substitua o conteúdo de `docs/ARQUITETURA.md` por:

```markdown
# Organização do projeto

O aplicativo é uma SPA (Single Page Application) em React + Vite, servida como
site estático pelo Firebase Hosting. Não existe processo de desktop, backend
próprio ou instalador — tudo roda no navegador do usuário.

## Pastas principais

- `src/App.jsx`: composição principal e roteamento das telas.
- `src/auth/`: autenticação (Firebase Auth) e controle de sessão (`AuthContext`, `AuthScreen`).
- `src/components/`: componentes de UI reutilizáveis (layout, gráficos, tabelas).
- `src/pages/`: telas e fluxos de trabalho (Dashboard, Relatórios, Auditoria, Usuários, Analítica...).
- `src/services/`: comunicação com o Firebase (Auth/Firestore) e sanitização/criptografia de dados antes da sincronização.
- `src/lib/core/`: regras de negócio estáveis (deduplicação, texto, processamento) que rodam inteiramente no navegador.
- `src/lib/reports/`: leitura e formatação de planilhas de entrada/saída (ExcelJS).
- `src/lib/crypto/`: criptografia AES-GCM client-side usada para dados sensíveis sincronizados.
- `src/styles/`: estilos globais da interface.
- `firestore.rules`: regras de segurança do Firestore — única barreira de acesso aos dados na nuvem, já que não há servidor.
- `tests/`: testes de regressão (`node:test`) para o código do navegador e para as regras do Firestore (incluindo uma suíte contra o Firestore Emulator).
- `scripts/`: scripts de apoio (execução da suíte de testes).

## Modelo de confiança

Todo processamento de dados sensíveis (planilhas, CPF, nomes de clientes, contratos,
valores individuais) acontece **somente no navegador**. O Firestore nunca recebe
esses dados — só metadados agregados, contas, permissões e auditoria. Dados de
vendedor usados no ranking (`saved_reports`) são cifrados no navegador (AES-GCM)
antes de qualquer escrita na nuvem; ver `docs/CONFIGURACAO_FIREBASE.md`.

A única barreira de acesso é a combinação de Firebase Auth (quem está logado) com
as Firestore Security Rules (`firestore.rules`, o que essa pessoa pode ler/escrever).
Não existe nenhum caminho de código que libere uma sessão autenticada ou privilegiada
sem passar pelo Firebase Auth.

## Regra de manutenção

Alterações nas fórmulas, identificação de totais ou consolidação de comissões exigem
uma solicitação específica e novos testes de regressão para o código correspondente
em `src/lib/core/` e `src/lib/reports/`.

## Validação

Execute `npm test` antes de publicar (testes de navegador/regras via regex).
Execute `npm run test:rules` para validar o comportamento real das Firestore Security
Rules contra o Firestore Emulator (exige Java instalado). A compilação de produção é
feita por `npm run build`, gerando os arquivos estáticos em `dist/` para deploy no
Firebase Hosting.
```

- [ ] **Step 5: Reescrever `LEIA-ME.txt`**

Substitua o conteúdo de `LEIA-ME.txt` por:

```
CONTABILIZADOR DE COMISSÕES DENTAL PLUS

COMO USAR
- Acesse a versão publicada em https://comissoesdp.web.app com seu navegador.
- Entre com sua conta ou solicite acesso na primeira vez.
- Novas contas aguardam aprovação de um Administrador antes de liberar o uso.

SEGURANÇA E PRIVACIDADE
- Planilhas, CPF, cliente, contrato e valores individuais são processados
  somente no navegador do usuário — nunca saem do computador de quem está
  usando o sistema.
- O Firestore recebe somente contas, permissões, auditoria e totais agregados.
- O nome e a comissão de cada vendedor (usados no ranking) são cifrados no
  navegador antes de qualquer sincronização com a nuvem.
- Sem uma configuração válida do Firebase, o aplicativo bloqueia todo acesso —
  não existe modo local com privilégios de administrador.
- A configuração do Firebase está documentada em docs\CONFIGURACAO_FIREBASE.md.

PROCESSAMENTO
- Antes de gerar, o lote inteiro é analisado em busca de duplicidades
  confirmadas e possíveis.
- A revisão é obrigatória, mas nenhuma linha é removida ou alterada
  automaticamente.
- Relatórios existentes nunca são sobrescritos; novas execuções recebem
  versões _v2, _v3 etc.
- As regras de cálculo de comissão foram preservadas.

ACESSOS E HISTÓRICO
- Perfis disponíveis: Administrador e Operador.
- Novas contas aguardam aprovação de um Administrador.
- Promover alguém a Administrador exige confirmação explícita (digitar o
  e-mail da conta) e fica registrado na Auditoria.
- Somente Administradores veem usuários, configurações e lixeira.
- Registros ficam na lixeira por 30 dias; os arquivos Excel/PDF gerados não
  são apagados (eles nunca chegam a ser enviados para a nuvem).

DESENVOLVIMENTO
1. Instale Node.js 18+ e execute npm ci.
2. Use npm run dev para desenvolvimento local ou npm run build para gerar
   os arquivos estáticos de produção em dist/.
3. Consulte docs\ARQUITETURA.md para conhecer a organização e os limites de
   cada módulo.
```

- [ ] **Step 6: Rodar a suíte completa e confirmar que fica 100% verde**

Run: `npm test`
Expected: todos os testes passam (0 falhas) — a suíte agora só contém testes de código que realmente existe.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove material órfão da arquitetura Electron e testes já quebrados"
```

---

## Verificação final (depois de todas as tarefas)

- [ ] `npm test` passa 100% (nenhuma falha, nenhum arquivo órfão).
- [ ] `npm run test:rules` passa 100% (se Java estiver disponível no ambiente; caso contrário, documente que não foi possível verificar localmente).
- [ ] Manual: `npm run dev` sem `.env` mostra a tela de configuração ausente, não o dashboard.
- [ ] Manual: criar um relatório novo, salvá-lo, e conferir no console do Firestore que o documento em `saved_reports` não tem nenhum campo `summary`/`vendedoresDetalhes`/`nomesVendedores` em texto puro — só `encryptedSellerData`.
- [ ] Manual: o Dashboard e a Analítica continuam mostrando o ranking de vendedores normalmente para um usuário aprovado (prova de que a decriptografia funciona).
- [ ] Manual: promover um usuário a admin exige digitar o e-mail certo antes do botão de confirmar habilitar.
- [ ] Publicar as novas regras em produção (`npx firebase-tools deploy --only firestore:rules --project comissoesdp`) é uma ação com efeito em ambiente compartilhado — só fazer com autorização explícita, separada da aprovação deste plano.
