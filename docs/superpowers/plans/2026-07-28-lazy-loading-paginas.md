# Lazy Loading das Páginas do Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o bundle JS inicial do frontend (hoje um único arquivo de 3,84 MB / 1,07 MB gzip) fazendo com que 9 das 10 páginas do app sejam carregadas sob demanda em vez de sempre, no boot.

**Architecture:** `src/App.jsx` troca os `import` estáticos de `NewReport`, `SavedReports`, `PdfSummary`, `GeneralReport`, `ConfigCorretoras`, `UserManagement`, `Trash`, `AuditLog` e `Analytics` por `React.lazy(() => import(...))`, mantendo `Dashboard` (página padrão de abertura) com import estático. O bloco `<div className="content">` que renderiza a página ativa é envolvido por um `<Suspense>` com um fallback que reaproveita a classe CSS `.status.loading` já usada no projeto. Nenhuma mudança em navegação (continua por state `activePage`, sem router), props, ou fluxo de dados.

**Tech Stack:** React 18 (`React.lazy`/`Suspense`), Vite 5 / Rollup (code-splitting automático em `import()` dinâmico) — nenhuma dependência nova.

## Global Constraints

- Não introduzir router nem mudar o modelo de navegação por state `activePage` em `App.jsx`.
- `Dashboard` (página padrão de abertura) permanece com `import` estático — não pode virar lazy (evita atraso na primeira tela).
- `AuthScreen` e `MaintenanceScreen` (telas de nível superior, renderizadas antes do app shell) não fazem parte deste plano — permanecem com import estático, inalteradas.
- Nenhuma mudança em props passadas às páginas, em busca de dados (`Firestore onSnapshot`, `services/*`), ou em qualquer lógica de negócio — mudança restrita à forma de carregar o módulo JS.
- O fallback do `Suspense` deve reaproveitar a classe CSS já existente `.status.loading` (ver `src/styles/app.css:347`) — não introduzir spinner/estilo novo.
- Fora de escopo (não tocar): `src/index.css`, config do Tailwind, `firestore.rules`, `manualChunks`/vendor splitting.
- Critério de sucesso: `npm run build` deixa de gerar um único `dist/assets/index-*.js`; `npm test` permanece em 19 testes / 19 pass / 0 fail.

Spec de referência: [docs/superpowers/specs/2026-07-28-lazy-loading-paginas-design.md](../specs/2026-07-28-lazy-loading-paginas-design.md)

---

## File Structure

Apenas um arquivo é modificado — nenhum arquivo novo é criado:

- **Modify:** `src/App.jsx` — troca de 9 imports estáticos por `React.lazy`, adição de `Suspense` ao redor do bloco de renderização de página.

Não há arquivo de teste dedicado: este projeto não tem framework de teste de componente/UI (sem Jest/RTL — só `node:test` para lógica pura e regras do Firestore). A verificação desta mudança é: (1) inspeção do output do `npm run build`, (2) checagem manual no navegador de cada uma das 10 páginas, (3) confirmação de que `npm test` (que cobre lógica de sanitização, criptografia, validadores — não UI) continua verde. Isso está descrito explicitamente nos passos abaixo.

---

### Task 1: Lazy-load das 9 páginas + fallback de Suspense

**Files:**
- Modify: `src/App.jsx:1` (import do React), `src/App.jsx:9-22` (imports de página), `src/App.jsx:219-271` (bloco de renderização)

**Interfaces:**
- Consumes: nada de tarefas anteriores (plano de tarefa única).
- Produces: nada consumido por tarefas futuras (plano de tarefa única).

- [ ] **Step 1: Registrar o baseline atual do build (antes da mudança)**

Rodar o build de produção e guardar a saída para comparar depois.

Run: `npm run build`
Expected (saída relevante, já medida anteriormente neste projeto):
```
dist/assets/index-DD6S_flX.js                             3,837.65 kB │ gzip: 1,074.45 kB
(!) Some chunks are larger than 500 kB after minification. ...
```
Um único arquivo `dist/assets/index-*.js` de ~3,84 MB. Guarde este número para comparar no Step 5.

- [ ] **Step 2: Trocar o import do React para incluir `lazy` e `Suspense`**

Em `src/App.jsx`, linha 1, trocar:

```js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
```

por:

```js
import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
```

- [ ] **Step 3: Converter os imports das 9 páginas para `lazy()`, mantendo `Dashboard` estático**

Em `src/App.jsx`, linhas 9-22, o bloco atual é:

```js
import MaintenanceScreen from './components/MaintenanceScreen';
import Dashboard from './pages/Dashboard';
import NewReport from './pages/NewReport';
import SavedReports from './pages/SavedReports';
import PdfSummary from './pages/PdfSummary';
import GeneralReport from './pages/GeneralReport';
import ConfigCorretoras from './pages/ConfigCorretoras';
import AuthScreen from './auth/AuthScreen';
import { useAuth } from './auth/AuthContext';
import { subscribeReports, syncReport, trashReport as trashCloudReport } from './services/cloudReports';
import { getSavedReports, deleteReport as deleteLocalReport } from './services/historyService';
import UserManagement from './pages/UserManagement';
import Trash from './pages/Trash';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import LogConsole from './components/layout/LogConsole';
```

Substituir por (agrupa todos os `import` primeiro, depois os `lazy()` — evita misturar declarações de tipos diferentes e facilita leitura):

```js
import MaintenanceScreen from './components/MaintenanceScreen';
import Dashboard from './pages/Dashboard';
import AuthScreen from './auth/AuthScreen';
import { useAuth } from './auth/AuthContext';
import { subscribeReports, syncReport, trashReport as trashCloudReport } from './services/cloudReports';
import { getSavedReports, deleteReport as deleteLocalReport } from './services/historyService';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import LogConsole from './components/layout/LogConsole';

const NewReport = lazy(() => import('./pages/NewReport'));
const SavedReports = lazy(() => import('./pages/SavedReports'));
const PdfSummary = lazy(() => import('./pages/PdfSummary'));
const GeneralReport = lazy(() => import('./pages/GeneralReport'));
const ConfigCorretoras = lazy(() => import('./pages/ConfigCorretoras'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Trash = lazy(() => import('./pages/Trash'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Analytics = lazy(() => import('./pages/Analytics'));
```

Note: `Dashboard` permanece exatamente como estava (import estático, linha `import Dashboard from './pages/Dashboard';`) — é a única página que NÃO vira `lazy()`.

- [ ] **Step 4: Envolver o bloco de renderização de página em `<Suspense>`**

Em `src/App.jsx`, o bloco atual (linhas 219-271) é:

```jsx
        <div className="content">
          {activePage === 'dashboard' && (
            <Dashboard 
              savedReports={savedReports} 
              onNavigate={setActivePage} 
              refreshHistory={refreshHistory}
              isAdmin={session.isAdmin}
              onTrashReport={handleTrashReport}
            />
          )}
          {activePage === 'new-report' && (
            <NewReport 
              refreshHistory={refreshHistory}
              addLog={addLog}
              onReportCreated={handleReportCreated}
              knownReports={savedReports}
            />
          )}
          {activePage === 'saved-reports' && (
            <SavedReports 
              savedReports={savedReports} 
              refreshHistory={refreshHistory}
              onNavigate={setActivePage}
              isAdmin={session.isAdmin}
              onTrashReport={handleTrashReport}
              onReportCreated={handleReportCreated}
            />
          )}
          {activePage === 'pdf-summary' && (
            <PdfSummary 
              addLog={addLog}
            />
          )}
          {activePage === 'general-report' && (
            <GeneralReport 
              refreshHistory={refreshHistory}
              addLog={addLog}
            />
          )}
          {activePage === 'analytics' && (
            <Analytics 
              savedReports={savedReports} 
            />
          )}
          {activePage === 'config-corretoras' && (
            <ConfigCorretoras 
              addLog={addLog}
            />
          )}
          {activePage === 'users' && <UserManagement />}
          {activePage === 'audit' && <AuditLog />}
          {activePage === 'trash' && <Trash cloudReports={cloudReports} refreshHistory={refreshHistory} />}
        </div>
```

Substituir por (idêntico, apenas envolto por `<Suspense>` com fallback reaproveitando `.status.loading`):

```jsx
        <div className="content">
          <Suspense fallback={<div className="status loading">Carregando…</div>}>
            {activePage === 'dashboard' && (
              <Dashboard 
                savedReports={savedReports} 
                onNavigate={setActivePage} 
                refreshHistory={refreshHistory}
                isAdmin={session.isAdmin}
                onTrashReport={handleTrashReport}
              />
            )}
            {activePage === 'new-report' && (
              <NewReport 
                refreshHistory={refreshHistory}
                addLog={addLog}
                onReportCreated={handleReportCreated}
                knownReports={savedReports}
              />
            )}
            {activePage === 'saved-reports' && (
              <SavedReports 
                savedReports={savedReports} 
                refreshHistory={refreshHistory}
                onNavigate={setActivePage}
                isAdmin={session.isAdmin}
                onTrashReport={handleTrashReport}
                onReportCreated={handleReportCreated}
              />
            )}
            {activePage === 'pdf-summary' && (
              <PdfSummary 
                addLog={addLog}
              />
            )}
            {activePage === 'general-report' && (
              <GeneralReport 
                refreshHistory={refreshHistory}
                addLog={addLog}
              />
            )}
            {activePage === 'analytics' && (
              <Analytics 
                savedReports={savedReports} 
              />
            )}
            {activePage === 'config-corretoras' && (
              <ConfigCorretoras 
                addLog={addLog}
              />
            )}
            {activePage === 'users' && <UserManagement />}
            {activePage === 'audit' && <AuditLog />}
            {activePage === 'trash' && <Trash cloudReports={cloudReports} refreshHistory={refreshHistory} />}
          </Suspense>
        </div>
```

- [ ] **Step 5: Rodar o build e verificar que o bundle foi dividido**

Run: `npm run build`

Expected: a saída agora lista **múltiplos** arquivos `dist/assets/*.js` (um por página lazy, mais os chunks das libs que cada uma usa — ex. `exceljs`/`pdfkit`/`jszip` isolados nos chunks de `NewReport`/`GeneralReport`/`PdfSummary`/`SavedReports`), em vez do único `dist/assets/index-*.js` de 3,84 MB do Step 1. Nenhum arquivo individual deve chegar perto de 3,84 MB — se um chunk ainda estiver com esse tamanho, alguma página não foi convertida corretamente para `lazy()`.

Se o aviso `(!) Some chunks are larger than 500 kB` persistir apontando para o chunk principal (não para um chunk de página), investigar antes de prosseguir — pode indicar que algo fora do Suspense ainda importa uma página estaticamente.

- [ ] **Step 6: Checagem manual no navegador**

Abrir o app (build de produção via preview, ou dev server) e:
1. Confirmar que a tela inicial (`Dashboard`) aparece imediatamente, sem piscar o fallback "Carregando…" (ela é estática).
2. Clicar em cada um dos outros 9 itens do menu lateral, um de cada vez: Novo relatório, Relatórios salvos, PDF de resumo, Relatório Geral, Analítica, Configurar corretoras, Usuários, Auditoria, Lixeira.
3. Para cada clique, confirmar: a página renderiza corretamente (mesmo conteúdo de antes), nenhum erro aparece no console do navegador, e a aba de rede mostra uma nova requisição de chunk `.js` sendo baixada **apenas na primeira vez** que aquela página é aberta na sessão (cliques repetidos na mesma página não devem baixar o chunk de novo).
4. Confirmar que o toggle de tema claro/escuro e o console de logs (ícone no rodapé) continuam funcionando normalmente em qualquer página.

- [ ] **Step 7: Rodar a suíte de testes existente**

Run: `npm test`
Expected: `ℹ tests 19` / `ℹ pass 19` / `ℹ fail 0` — sem mudança em relação ao baseline (esta mudança não altera lógica coberta pelos testes existentes, mas deve ser confirmado).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "perf: lazy-load das paginas do frontend para reduzir bundle inicial"
```

---

## Verification Final

- `npm run build`: múltiplos chunks em vez de um único `dist/assets/index-*.js` de 3,84 MB (Step 5).
- Checagem manual: as 10 páginas renderizam corretamente, sem erro de console, com carregamento sob demanda confirmado na aba de rede (Step 6).
- `npm test`: 19/19, 0 fail (Step 7).
- `git diff main` mostra apenas `src/App.jsx` modificado — nenhum outro arquivo tocado.
