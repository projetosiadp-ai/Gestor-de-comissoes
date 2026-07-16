# Organização e Manutenção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizar a pasta e dividir os arquivos monolíticos em módulos testáveis sem alterar regras de comissão, contratos IPC, interface ou arquivos gerados.

**Architecture:** O processo principal passa a ser composto por registradores IPC e serviços de relatório com dependências explícitas; `main.js` permanece como inicializador compatível. A interface mantém páginas e classes atuais, mas extrai moldura, dashboard e estilos para unidades focadas. Resíduos regeneráveis são removidos somente após verificação de caminho e testes.

**Tech Stack:** Electron 43, Node.js/CommonJS, React 18, Vite 5, ExcelJS, PDFKit, Firebase 12 e `node:test`.

## Global Constraints

- Preservar integralmente as regras atuais de comissão.
- Manter `Iniciar.bat`, `Compilar.bat`, `LEIA-ME.txt` e `release/` na raiz.
- Manter Windows 10/11 x86 e x64, processamento local e modo offline.
- Não mudar nomes, parâmetros ou respostas dos canais IPC.
- Não adicionar TypeScript ou novas dependências de produção.
- Aplicar TDD em cada extração e regenerar os executáveis ao final.

---

### Task 1: Contratos de composição do processo principal

**Files:**
- Create: `tests/main/ipc-contract.test.cjs`
- Modify: `tests/helpers/electron-main-harness.cjs`

**Interfaces:**
- Consumes: `loadCurrentMain({ userDataPath, autoReady })`.
- Produces: lista canônica `EXPECTED_IPC_CHANNELS` e captura das opções da janela.

- [ ] **Step 1: Write the failing test**

```js
const EXPECTED_IPC_CHANNELS = [
  'get-app-settings', 'save-app-settings', 'list-saved-reports',
  'delete-saved-report', 'list-trashed-reports', 'restore-saved-report',
  'cancel-processing', 'open-path', 'select-files', 'select-ready-files',
  'select-summary-files', 'select-output-folder', 'select-general-files',
  'analyze-duplicates', 'generate-summary-pdf', 'generate-reports',
  'import-ready-reports', 'parse-general-inputs', 'generate-general-report',
  'get-corretoras-config', 'save-corretoras-config'
];

test('registers the stable IPC surface', () => {
  const { handlers } = loadCurrentMain({ userDataPath: temporaryDirectory });
  assert.deepEqual([...handlers.keys()].sort(), [...EXPECTED_IPC_CHANNELS].sort());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\main\ipc-contract.test.cjs`
Expected: FAIL until the harness exposes a deterministic module reload and the expected surface is aligned.

- [ ] **Step 3: Extend the harness without changing production behavior**

Export `EXPECTED_IPC_CHANNELS` from the test helper and clear every new `src/main` module from `require.cache` before loading the entry point.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\main\ipc-contract.test.cjs`
Expected: PASS with 21 channels.

- [ ] **Step 5: Commit**

```bash
git add tests/main/ipc-contract.test.cjs tests/helpers/electron-main-harness.cjs
git commit -m "test: fixar contratos ipc antes da modularizacao"
```

### Task 2: Configuração versionada e inicialização Electron

**Files:**
- Create: `config/corretoras.default.json`
- Create: `src/main/app/create-window.cjs`
- Create: `src/main/config/app-settings.cjs`
- Create: `src/main/config/corretoras.cjs`
- Create: `tests/main/configuration.test.cjs`
- Modify: `main.js`
- Modify: `package.json`
- Delete: `corretoras.json`

**Interfaces:**
- Produces: `createWindow({ BrowserWindow, appRoot, isDevelopment })`, `createAppSettings({ app, fs, path })` e `createCorretorasRepository({ app, bundledConfigPath })`.

- [ ] **Step 1: Write failing configuration tests**

```js
test('loads bundled broker defaults from config directory', () => {
  const repository = createCorretorasRepository({ app, bundledConfigPath: fixture });
  assert.equal(repository.getAll()['AS PRIME'][0], 'AS PRIME');
});

test('uses the portable executable directory as report default', () => {
  const settings = createAppSettings({ app: packagedApp, env: { PORTABLE_EXECUTABLE_DIR: share } });
  assert.equal(settings.get().defaultOutputFolder, path.join(share, 'Relatorios'));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests\main\configuration.test.cjs`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement focused repositories and window factory**

Move code without semantic edits. Keep sandbox, context isolation, navigation blocking and `preload.js` path unchanged. Replace the original JSON with `config/corretoras.default.json` and include it in `build.files`.

- [ ] **Step 4: Reduce `main.js` to a compatibility entry**

```js
require('./src/main/index.cjs');
```

The new `src/main/index.cjs` composes Electron dependencies and invokes the window/config factories.

- [ ] **Step 5: Verify tests**

Run: `node --test tests\main\configuration.test.cjs tests\security\electron-security.test.cjs tests\main\ipc-contract.test.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config src/main/app src/main/config src/main/index.cjs main.js package.json tests/main/configuration.test.cjs
git rm corretoras.json
git commit -m "refactor: separar inicializacao e configuracoes"
```

### Task 3: IPC de sistema, histórico e duplicidades

**Files:**
- Create: `src/main/ipc/register-system-ipc.cjs`
- Create: `src/main/ipc/register-history-ipc.cjs`
- Create: `src/main/ipc/register-duplicates-ipc.cjs`
- Create: `src/main/reports/input-reader.cjs`
- Create: `tests/main/input-reader.test.cjs`
- Modify: `src/main/index.cjs`

**Interfaces:**
- `registerSystemIpc({ ipcMain, dialog, shell, settings })` registra seleção, abertura e configurações.
- `registerHistoryIpc({ ipcMain, history })` registra histórico/lixeira.
- `registerDuplicatesIpc({ ipcMain, history, inputReader })` retorna o formato atual de análise.
- `inputReader.readInput(filePath)` e `inputReader.readDuplicateRecords(filePath)` não dependem do Electron.

- [ ] **Step 1: Write failing input reader tests**

```js
test('reads every table from the disguised HTML XLS export', async () => {
  const records = await inputReader.readDuplicateRecords(fixture);
  assert.equal(records.length, 3);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests\main\input-reader.test.cjs`
Expected: FAIL with missing `input-reader.cjs`.

- [ ] **Step 3: Move reading code and register IPC modules**

Move `extractHtmlTitle`, `htmlToRows`, `readHtmlInput`, `readXlsxInput`, `readInput`, worksheet row helpers and duplicate reading. Inject `ExcelJS`, `fs`, `path` and text helpers once in the factory.

- [ ] **Step 4: Verify domain and contract tests**

Run: `node --test tests\main\input-reader.test.cjs tests\core\duplicate-analysis.test.cjs tests\core\history-store.test.cjs tests\main\ipc-contract.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc src/main/reports/input-reader.cjs src/main/index.cjs tests/main/input-reader.test.cjs
git commit -m "refactor: separar leitura historico e ipc de sistema"
```

### Task 4: Motores Excel/PDF e registradores de relatório

**Files:**
- Create: `src/main/reports/workbook-format.cjs`
- Create: `src/main/reports/commission-report.cjs`
- Create: `src/main/reports/summary-pdf.cjs`
- Create: `src/main/reports/general-report.cjs`
- Create: `src/main/ipc/register-report-ipc.cjs`
- Create: `src/main/ipc/register-summary-ipc.cjs`
- Create: `src/main/ipc/register-general-ipc.cjs`
- Create: `tests/main/report-modules.test.cjs`
- Modify: `src/main/index.cjs`

**Interfaces:**
- `createCommissionReportService(dependencies).generate(payload, progress)` retorna o objeto atual de `generate-reports`.
- `createSummaryPdfService(dependencies).generate(payload, progress)` retorna o objeto atual de `generate-summary-pdf`.
- `createGeneralReportService(dependencies)` expõe `parseInputs` e `generate`.

- [ ] **Step 1: Write failing service contract test**

```js
test('commission service preserves the consolidated fixture total', async () => {
  const result = await service.generate(fixturePayload, () => {});
  assert.equal(result.summary[0].totalConsolidado, 1773.81);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests\main\report-modules.test.cjs`
Expected: FAIL with missing report services.

- [ ] **Step 3: Extract workbook formatting and report services**

Move functions exactly, retaining formulas, column widths, text labels, currency parsing, grouping order, filenames and atomic writes. Registradores IPC only validate/forward payloads and progress.

- [ ] **Step 4: Run regression tests**

Run: `node --test tests\main\report-modules.test.cjs tests\baseline\current-behavior.test.cjs tests\main\ipc-contract.test.cjs`
Expected: PASS with total `1773.81` and one generated file.

- [ ] **Step 5: Commit**

```bash
git add src/main/reports src/main/ipc src/main/index.cjs tests/main/report-modules.test.cjs
git commit -m "refactor: modularizar motores de relatorios"
```

### Task 5: Moldura, dashboard e estilos da interface

**Files:**
- Create: `src/components/layout/Sidebar.jsx`
- Create: `src/components/layout/Topbar.jsx`
- Create: `src/components/layout/LogConsole.jsx`
- Create: `src/features/dashboard/MonthCharts.jsx`
- Create: `src/features/dashboard/MonthComparison.jsx`
- Create: `src/features/dashboard/ReportCard.jsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Create: `src/styles/layout.css`
- Create: `src/styles/components.css`
- Create: `src/styles/pages.css`
- Modify: `src/App.jsx`
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Layout recebe estado e callbacks; não acessa Firebase diretamente.
- Dashboard continua aceitando `{ savedReports, onNavigate, refreshHistory, isAdmin, onTrashReport }`.
- `index.css` importa os cinco arquivos de estilo na ordem definida.

- [ ] **Step 1: Add a static module-boundary test**

Create `tests/ui/module-boundaries.test.cjs` asserting that `App.jsx` imports the three layout components, `Dashboard.jsx` imports the feature components and `index.css` imports all style files. Run it before creating modules; expect FAIL.

- [ ] **Step 2: Extract components without changing props or markup classes**

Move existing JSX and helper components. Do not rename CSS classes, navigation IDs, page IDs or visible labels.

- [ ] **Step 3: Split CSS mechanically**

Move rules in original cascade order. `index.css` contains only five `@import` statements.

- [ ] **Step 4: Verify UI compilation**

Run: `node --test tests\ui\module-boundaries.test.cjs`
Expected: PASS.

Run: `npm run build:frontend`
Expected: Vite exits `0`.

- [ ] **Step 5: Visual smoke test**

Open Dashboard and Novo relatório in production preview; verify logo, navigation, quick actions, duplicate panel and dark dropzone at 1280px without horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add src/components src/features src/styles src/App.jsx src/pages/Dashboard.jsx src/index.css tests/ui/module-boundaries.test.cjs
git commit -m "refactor: dividir layout dashboard e estilos"
```

### Task 6: Limpeza segura e documentação

**Files:**
- Modify: `.gitignore`
- Modify: `LEIA-ME.txt`
- Modify: `docs/CONFIGURACAO_FIREBASE.md`
- Delete after path verification: `.worktrees/`, `node_modules_incomplete/`, `dist/`, `backend_backup.zip`

**Interfaces:** None; operational cleanup only.

- [ ] **Step 1: Verify absolute cleanup targets**

Use one PowerShell process to resolve each target and assert every path starts with the resolved project root plus a directory separator. For `.worktrees`, inspect `git worktree list` and remove registered worktrees through `git worktree remove --force` before pruning.

- [ ] **Step 2: Remove only approved residues**

Use PowerShell `Remove-Item -LiteralPath` for verified local targets. Do not remove `.git`, `release`, `tests`, `docs`, source files or configuration examples.

- [ ] **Step 3: Update documentation**

Document the new folder map, where to find report engines, how to run tests and which files are regenerated.

- [ ] **Step 4: Verify repository contents**

Run: `git status --short` and a root directory listing.
Expected: only intentional source/doc changes; no temporary folders.

- [ ] **Step 5: Commit**

```bash
git add .gitignore LEIA-ME.txt docs/CONFIGURACAO_FIREBASE.md
git commit -m "chore: limpar residuos e documentar estrutura"
```

### Task 7: Verificação e executáveis

**Files:**
- Regenerate ignored artifacts: `release/*.exe`

**Interfaces:** User-facing portable executables.

- [ ] **Step 1: Run the full suite**

Run: `node scripts\run-tests.cjs`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Build production frontend**

Run: `npm run build:frontend`
Expected: Vite exits `0`.

- [ ] **Step 3: Recheck the real export locally**

Invoke `analyze-duplicates` against the attached `.xls` and print only counts.
Expected: 148 total records, 1 confirmed group, 8 possible groups, 0 errors.

- [ ] **Step 4: Package x64 and ia32**

Run: `npm run build:app`
Expected: combined, x64 and ia32 portable files in `release/`.

- [ ] **Step 5: Smoke test both architectures**

Launch x64 and ia32 hidden for 20 seconds. Expected: both remain running until intentionally stopped.

- [ ] **Step 6: Verify hashes and Git state**

Compute SHA-256 for all three executables and run `git status --porcelain`.
Expected: three hashes and clean worktree.
