# Retomada — Hardening de Segurança Firebase (Fase 1)

> Documenta o ponto exato do trabalho para retomada em outra sessão. Executado com a
> skill **superpowers:subagent-driven-development** (um implementador + um revisor por
> tarefa, mais uma revisão final whole-branch). **Última atualização:** 2026-07-24.

## STATUS GERAL: implementação 100% concluída e revisada. Faltam só os passos de FINALIZAÇÃO (merge + deploy), que dependem de autorização sua.

## O que é este trabalho

Hardening de segurança do "Gestor de Comissões" (SPA React+Vite + Firebase). Documentos-fonte:

- **Plano:** [docs/superpowers/plans/2026-07-23-hardening-seguranca-firebase.md](docs/superpowers/plans/2026-07-23-hardening-seguranca-firebase.md) — 9 tarefas com código passo a passo.
- **Spec aprovado:** [docs/superpowers/specs/2026-07-22-hardening-seguranca-firebase-design.md](docs/superpowers/specs/2026-07-22-hardening-seguranca-firebase-design.md)
- **Ledger (fonte da verdade):** `.superpowers/sdd/progress.md` (git-ignorado) — confie nele + `git log` após qualquer retomada. Contém briefs, relatórios e pacotes de revisão de cada tarefa.

## Ambiente / isolamento

- Worktree `.claude/worktrees/hardening-seguranca-firebase`, branch `worktree-hardening-seguranca-firebase` (criado com `EnterWorktree`). O checkout principal (`main`) NÃO foi tocado.
- **NÃO há bash/WSL** — os scripts `task-brief`/`review-package` da skill foram reimplementados em PowerShell (ver funções no fim deste arquivo).
- **NÃO há Java** — o Firestore Emulator (Task 8) não roda localmente; a suíte foi escrita para CI/ambiente com Java.
- Windows / PowerShell 5.1. Node v24.

## Status das 9 tarefas — TODAS COMPLETAS E REVISADAS

| # | Tarefa | Status | Commit(s) |
|---|--------|--------|-----------|
| 1 | Lib de criptografia AES-GCM (`src/lib/crypto/teamCipher.mjs`) | ✅ | `575c9a1` |
| 2 | Serviço de chave de equipe + botão UI (`teamKeyService.js`, `ConfigCorretoras.jsx`) | ✅ | `8326ee8` |
| 3 | Cifrar dados de vendedor em `saved_reports` | ✅ | `20e1235`, `740ae22` |
| 4 | Travar `firestore.rules` (+ `system_config`, `audit`) | ✅ | `e89950e` |
| 5 | Validador client-side de `corretoras_config` (+ teto 500) | ✅ | `b0c557d`, `8e3ca83` |
| 6 | Remover bypass de admin sem login | ✅ (verificado no navegador) | `8d11c4e` |
| 7 | Confirmação de promoção de admin + auditoria | ✅ | `a67e458` |
| 8 | Suíte de testes de regras com Firestore Emulator | ✅ (não roda local: sem Java) | `bb4919c` |
| 9 | Remover legado Electron + reescrever docs | ✅ | `f2b5bda` |
| — | Fixes Minor da revisão final whole-branch | ✅ | `c28e455` |

**HEAD atual:** `c28e455`. Árvore de trabalho limpa. **`npm test` = 19 testes / 19 passam / 0 falham (100% verde).**

## Revisão final whole-branch — APROVADA ("Ready to merge: Yes")

Revisor no modelo mais capaz (opus) verificou o branch inteiro (base `9ff1ff1`..HEAD): **0 Critical, 0 Important.** Confirmou os 5 critérios de sucesso do spec, integração limpa (fluxo de cifragem ponta a ponta, sem drift entre sanitizer/regra/teste — 15 campos batem), e a remoção real do bypass de auth. Os achados Minor foram triados como "ship as-is"; os 3 mais baratos foram corrigidos em `c28e455` (guarda de e-mail vazio na promoção, comentário no cache da chave, nome enganoso + isolamento de 2 testes do emulador).

## ⚠️ PENDÊNCIAS DE FINALIZAÇÃO (precisam de você) — É AQUI QUE SE RETOMA

### 1. Alerta OPERACIONAL de deploy (importante — decisão sua)
As novas regras só validam **escritas**. Documentos em `saved_reports` gravados **antes** deste branch ainda contêm nome+comissão de vendedor em **texto puro** e continuam legíveis por qualquer usuário aprovado. Antes/junto do deploy das regras, é preciso **verificar se existem esses registros legados no projeto `comissoesdp` e purgá-los ou regravá-los** (regravar via app já cifra). Sem isso, o critério "nada de PII em texto puro" vale só para dados novos, não para o histórico. Isto é passo operacional, não correção de código.

### 2. Finalizar o branch (merge / PR)
Usar a skill `superpowers:finishing-a-development-branch`. **Atenção:** o branch inclui o commit pré-existente `9ff1ff1` ("chore: atualização no site") que NÃO está no `main` (era o ponto de partida do worktree). Ao mesclar, ele vai junto — confirmar com o usuário se é o esperado. Todo o resto (`64a934c`..`c28e455`) é o trabalho de hardening + docs.

### 3. Deploy das regras Firestore
`npx firebase-tools deploy --only firestore:rules --project comissoesdp`. **Efeito em produção (ambiente compartilhado) — só executar com autorização explícita do usuário.** Não foi feito.

## Follow-ups de CI adiados (não bloqueiam merge; registrados no ledger)
- Suíte do emulador (Task 8) só roda com Java: rodar `npm run test:rules` num ambiente com JRE 11+ para validar as regras de verdade.
- Ampliar a suíte do emulador: testes de escrita da coleção `reports` (validNewReport hoje sem cobertura), um teste positivo "admin PODE atualizar um usuário", e testes de rejeição por tamanho de `encryptedSellerData` / `date is timestamp`.
- Cobertura da Task 3 (payload do `setDoc` / degradação de leitura sem chave ou blob inválido) — hoje garantida por leitura + testes de unidade do sanitizer + a regra `hasOnly`; um teste de integração com mock do Firestore seria um extra.

## Critérios de sucesso (do spec) — todos atendidos no código
- Nenhum nome+comissão individual em texto puro no Firestore. ✅ (Task 3; ⚠️ ver alerta de deploy #1 sobre dados legados)
- Todas as coleções com validação de schema nas regras. ✅ (Task 4)
- Suíte de emulador cobrindo comportamento real das regras. ✅ escrita; ⏳ validar em CI com Java (Task 8)
- Nenhum caminho produz sessão privilegiada sem Firebase Auth. ✅ (Task 6, verificado no navegador)
- Repositório sem código/doc de arquitetura Electron. ✅ (Task 9; `npm test` 100% verde)

## Baseline de testes
`npm test` = **19/19, 0 falhas.** (As 15 falhas históricas eram testes órfãos do Electron, removidos na Task 9.) A suíte do emulador `tests/cloud/firestore-rules-emulator.cjs` é nomeada `.cjs` (não `.test.cjs`) de propósito, para o runner `scripts/run-tests.cjs` NÃO coletá-la no `npm test` — ela roda só via `npm run test:rules` (exige Java).

## Divergência de código tratada durante a execução (histórico)
O plano foi escrito contra um snapshot defasado. O worktree já tinha a feature de **"modo manutenção"** (`public_status/maintenance` nas regras, `MaintenanceScreen.jsx`, `maintenanceOn` em `App.jsx`). Tratado: Task 4 preservou a regra verbatim (+ asserção de regressão); Task 6 não tocou o bloco `if (maintenanceOn) return <MaintenanceScreen/>` (fica logo acima do gate de auth). Nada pendente aqui.

## Como retomar o fluxo SDD (sem bash)

Workspace da skill em `.superpowers/sdd/` (git-ignorado): briefs `task-N-brief.md`, relatórios `task-N-report.md`, pacotes `review-*.diff`, `progress.md`.

**Extrair um brief:**
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

**Gerar pacote de revisão (BASE = commit antes da tarefa, HEAD = após):**
```powershell
$base="e89950e"; $head=(git rev-parse --short HEAD)
$out=".superpowers\sdd\review-$base..$head.diff"
$c=@("# Review package: $base..$head","","## Commits",(git log --oneline "$base..$head"),"","## Files changed",(git diff --stat "$base..$head"),"","## Diff",(git diff -U10 "$base..$head"))
Set-Content -Path $out -Value $c -Encoding utf8
```

**Templates de prompt da skill:**
- Implementador: `C:\Users\Dental\.claude\plugins\cache\claude-plugins-official\superpowers\6.1.1\skills\subagent-driven-development\implementer-prompt.md`
- Revisor de tarefa: `...\subagent-driven-development\task-reviewer-prompt.md`
- Revisão final: `...\requesting-code-review\code-reviewer.md`
