# Retomada — Hardening de Segurança Firebase (Fase 1)

> Este arquivo documenta o ponto exato onde a implementação parou, para que uma
> sessão futura possa continuar sem perder contexto. Trabalho executado com a skill
> **superpowers:subagent-driven-development** (um subagente implementador + um revisor
> por tarefa). **Última atualização:** 2026-07-23.

## O que é este trabalho

Implementação do plano de hardening de segurança do "Gestor de Comissões" (SPA
React+Vite + Firebase). Documentos-fonte (leia primeiro ao retomar):

- **Plano de implementação:** [docs/superpowers/plans/2026-07-23-hardening-seguranca-firebase.md](docs/superpowers/plans/2026-07-23-hardening-seguranca-firebase.md) — 9 tarefas, cada uma com código completo passo a passo.
- **Spec de design (aprovado):** [docs/superpowers/specs/2026-07-22-hardening-seguranca-firebase-design.md](docs/superpowers/specs/2026-07-22-hardening-seguranca-firebase-design.md)
- **Ledger de progresso (fonte da verdade):** `.superpowers/sdd/progress.md` — confie nele + `git log` após qualquer retomada.

## Ambiente / isolamento

- Trabalho isolado no worktree `.claude/worktrees/hardening-seguranca-firebase`, branch `worktree-hardening-seguranca-firebase`, criado com a ferramenta `EnterWorktree`.
- **NÃO** há bash/WSL neste ambiente — os scripts `task-brief`/`review-package`/`sdd-workspace` da skill são shell scripts e não rodam. Foram reimplementados inline em PowerShell (ver "Como retomar" abaixo).
- Windows / PowerShell 5.1. Node v24. `npm test` = runner `node:test` via `scripts/run-tests.cjs`.

## Status das 9 tarefas

| # | Tarefa | Status | Commit(s) |
|---|--------|--------|-----------|
| 1 | Lib de criptografia AES-GCM (`src/lib/crypto/teamCipher.mjs`) | ✅ completa, revisada | `575c9a1` |
| 2 | Serviço de chave de equipe + botão UI (`teamKeyService.js`, `ConfigCorretoras.jsx`) | ✅ completa, revisada | `8326ee8` |
| 3 | Cifrar dados de vendedor em `saved_reports` (`report-sanitizer.mjs`, `historyService.js`, `NewReport.jsx`) | ✅ completa, revisada (incl. fix) | `20e1235`, `740ae22` |
| 4 | Travar `firestore.rules` (+ `system_config`, `audit`) | ✅ completa, revisada | `e89950e` |
| 5 | Validador client-side de `corretoras_config` | ⚠️ **implementada e commitada, REVISÃO PENDENTE** | `b0c557d` |
| 6 | Remover bypass de admin sem login (`AuthContext.jsx`, `AuthScreen.jsx`, `App.jsx`) | ⛔ não iniciada | — |
| 7 | Confirmação de promoção de admin + auditoria (`cloudUsers.js`, `UserManagement.jsx`) | ⛔ não iniciada | — |
| 8 | Suíte de testes de regras com Firestore Emulator | ⛔ não iniciada | — |
| 9 | Remover legado Electron + reescrever docs | ⛔ não iniciada | — |

**HEAD atual:** `b0c557d`. Árvore de trabalho limpa (tudo commitado).

## PONTO EXATO DE RETOMADA

**A Task 5 foi implementada e commitada (`b0c557d`), mas ainda NÃO passou pela revisão de subagente.** Retome assim:

1. Gerar o pacote de revisão da Task 5 (base `e89950e`, head `b0c557d`) e despachar o subagente revisor (modelo sonnet). Brief já extraído em `.superpowers/sdd/task-5-brief.md`. Relatório do implementador em `.superpowers/sdd/task-5-report.md`.
2. Se aprovada: marcar Task 5 no ledger e seguir para a Task 6.
3. Se houver achado Critical/Important: despachar subagente de fix, re-revisar, então seguir.

Depois, executar Tasks 6 → 7 → 8 → 9 na ordem, cada uma com implementador + revisor.

## Baseline de testes (IMPORTANTE)

Estado atual: **30 testes, 15 passam, 15 falham.** As **15 falhas são pré-existentes** (não são regressões) — são arquivos de teste órfãos da antiga arquitetura Electron (`tests/main/*`, `tests/core/*`, `tests/baseline/*`, `tests/security/electron-security.test.cjs`) que tentam carregar `main.js`/`src/main/**/*.cjs`, removidos na migração para SPA. **A Task 9 remove todos esses arquivos** e deixa `npm test` 100% verde. Até a Task 9 rodar, o critério de "sem regressão" é: as 15 falhas continuam sendo exatamente as mesmas 15, e cada tarefa nova só adiciona testes que passam.

## ⚠️ Divergência de código descoberta durante a execução (LEIA)

O plano foi escrito contra um snapshot **defasado** do código. O worktree (base `9ff1ff1`) já contém uma feature de **"modo manutenção"** que não aparecia nesse snapshot:

- Regra `match /public_status/maintenance` em `firestore.rules`.
- `src/components/MaintenanceScreen.jsx`.
- Em `src/App.jsx`: estado `maintenanceOn`, `onSnapshot` de `public_status/maintenance`, e `if (maintenanceOn) return <MaintenanceScreen />`.

**Impacto e o que já foi feito:**
- **Task 4** (já concluída): o bloco `public_status/maintenance` foi **preservado verbatim** nas novas regras (não recebe validação de schema — admin-only já basta, e mexer nele quebraria o toggle). Foi adicionada uma asserção de regressão no smoke test.
- **Task 6** (pendente): o gate de auth que o plano manda editar **não está mais na linha 177** — está em torno da **linha 195** de `App.jsx`, e o bloco `if (maintenanceOn) return <MaintenanceScreen />` fica **logo acima dele**. A edição da Task 6 (trocar a condição do gate) **não deve tocar** o bloco de manutenção. O anchor `if (session.loading || (session.configured && (!session.user || session.profile?.status !== 'approved')))` ainda existe, só mudou de linha.

Anchors das Tasks 5, 6, 7 e 9 foram verificados contra o worktree vivo — **todos ainda batem com o plano** (exceto o número de linha do gate na Task 6, acima).

## Achados Minor adiados para a revisão final (whole-branch)

Registrados no ledger; a revisão final decide quais valem correção antes do merge:

- **Task 3:** nenhum teste de integração cobre o payload do `setDoc` de `saveReport` nem a degradação de `getSavedReports` (sem chave / blob inválido). Guardar a propriedade central (nada de PII em texto puro) em CI exigiria mock do Firestore ou a suíte de emulador. Considerar se a Task 8 (emulador) cobre isso.
- **Task 4:** `validSavedReport` aplica `createdByUid == auth.uid` tanto no create quanto no update, então um admin re-salvando o relatório de outra pessoa transfere a "propriedade" ao admin (herdado do app, que sempre carimba `actor.uid`; não é regressão). Nota forward-looking para os testes de emulador da Task 8.

## Como retomar o fluxo SDD (sem bash)

O workspace da skill fica em `.superpowers/sdd/` (git-ignorado). Já contém: briefs `task-N-brief.md`, relatórios `task-N-report.md`, pacotes de diff `review-*.diff`, e o `progress.md`.

**Extrair um brief (equivalente ao script `task-brief`):**
```powershell
function Get-TaskBrief { param([string]$PlanPath,[int]$N,[string]$OutPath)
  $lines = Get-Content -Path $PlanPath -Encoding utf8; $collecting=$false
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    if ($line -match '^#+\s+Task\s+(\d+)') { $collecting=([int]$Matches[1] -eq $N); if($collecting){$out.Add($line)}; continue }
    if ($line -match '^##\s+Verification final') { $collecting=$false; continue }
    if ($collecting) { $out.Add($line) }
  }
  Set-Content -Path $OutPath -Value $out -Encoding utf8 }
```

**Gerar pacote de revisão (equivalente ao script `review-package`), BASE = commit antes da tarefa, HEAD = após:**
```powershell
$base="e89950e"; $head=(git rev-parse --short HEAD)
$out=".superpowers\sdd\review-$base..$head.diff"
$c=@("# Review package: $base..$head","","## Commits",(git log --oneline "$base..$head"),"","## Files changed",(git diff --stat "$base..$head"),"","## Diff",(git diff -U10 "$base..$head"))
Set-Content -Path $out -Value $c -Encoding utf8
```

**Templates de prompt da skill** (para montar os dispatches de implementador/revisor):
- Implementador: `C:\Users\Dental\.claude\plugins\cache\claude-plugins-official\superpowers\6.1.1\skills\subagent-driven-development\implementer-prompt.md`
- Revisor: `...\subagent-driven-development\task-reviewer-prompt.md`
- Revisão final (whole-branch): `...\requesting-code-review\code-reviewer.md`

**Seleção de modelo:** implementador de tarefa mecânica com código já no brief → `sonnet` (ou `haiku` para transcrição pura, como a Task 1). Revisor → `sonnet`. Revisão final whole-branch → o modelo mais capaz disponível.

**Regra de ouro do fluxo:** um subagente novo por tarefa; nunca colar histórico acumulado no prompt — passar só o brief (arquivo), interfaces das tarefas anteriores e as constraints. Cada subagente escreve seu relatório em arquivo e devolve só status curto. Despachar fix para achados Critical/Important; registrar Minor no ledger.

## Notas por tarefa restante

- **Task 6:** ver seção de divergência acima (gate mudou de linha; não tocar o bloco de manutenção). Depois desta tarefa, `AuthContext.jsx` não deve mais ter `localSession()` nem sessão sintética; sem Firebase configurado, `AuthScreen` mostra tela bloqueante. Verificação manual no navegador (`npm run dev` sem `.env`).
- **Task 7:** estende `updateUserAccess(userId, {role,status}, adminUser, previousRole)` e adiciona confirmação por e-mail em `UserManagement.jsx`. A regra de `audit` da Task 4 já permite `previousRole`/`newRole` nos details — não precisa mexer nas regras de novo.
- **Task 8:** instala `@firebase/rules-unit-testing` + `firebase-tools` (dev), configura `emulators` em `firebase.json`, cria `tests/cloud/firestore-rules-emulator.test.cjs`, adiciona script `test:rules`. **Exige Java (JRE 11+)** para o emulador — se não houver Java no ambiente, NÃO instalar software silenciosamente; documentar que não foi possível validar localmente e seguir. Considerar cobrir aqui o achado Minor da Task 3 (payload sem PII) e a nota da Task 4 (transferência de propriedade no update).
- **Task 9:** remove os arquivos órfãos do Electron (lista confirmada existindo no worktree), remove o campo `"main": "main.js"` do `package.json`, reescreve `docs/ARQUITETURA.md` e `LEIA-ME.txt`. Ao final, `npm test` deve ficar **100% verde**.

## Passos finais (após as 9 tarefas)

1. **Revisão final whole-branch:** gerar pacote com `review-package MERGE_BASE HEAD` (MERGE_BASE = `git merge-base main HEAD`) e despachar um único revisor no modelo mais capaz, apontando para a lista de achados Minor do ledger. Se retornar achados, despachar UM subagente de fix com a lista completa.
2. **Finalizar o branch:** usar a skill `superpowers:finishing-a-development-branch` (merge / PR / cleanup).
3. **Deploy das regras Firestore:** `npx firebase-tools deploy --only firestore:rules --project comissoesdp`. **É ação com efeito em ambiente compartilhado (produção) — só executar com autorização explícita do usuário, separada da aprovação do plano.** Não foi feito ainda.

## Critérios de sucesso (do spec)

- Nenhum nome+comissão individual de vendedor gravado em texto puro no Firestore. ✅ (Task 3)
- Todas as coleções (`users`, `reports`, `audit`, `saved_reports`, `system_config`) com validação de schema nas regras. ✅ (Task 4)
- Suíte de emulador passando, cobrindo o comportamento real das regras. ⛔ (Task 8, pendente)
- Nenhum caminho produz sessão privilegiada sem Firebase Auth. ⛔ (Task 6, pendente)
- Repositório sem código/doc de arquitetura Electron inexistente. ⛔ (Task 9, pendente)