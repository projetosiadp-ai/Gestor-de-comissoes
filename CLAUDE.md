# Retomada — Hardening de Segurança Firebase (Fase 1)

> Documenta o ponto exato do trabalho para retomada em outra sessão. Executado com a
> skill **superpowers:subagent-driven-development** (um implementador + um revisor por
> tarefa, mais uma revisão final whole-branch). **Última atualização:** 2026-07-27.

## STATUS GERAL: TRABALHO CONCLUÍDO. Branch mesclado no `main` e regras do Firestore deployadas em produção.

## ⚠️ Decisão explícita do usuário (2026-07-27): detalhe completo de vendas VOLTA a ser sincronizado

A Fase 1 acima definiu que CPF, nome de cliente, contrato e parcela nunca deveriam sair do
navegador — só o agregado por vendedor (nome + total) ia pro Firestore, cifrado. Em 2026-07-27
o usuário pediu explicitamente para reverter isso para a coleção `saved_reports`: quer que o
arquivo baixado do histórico ("Relatórios Salvos") saia **idêntico** ao gerado na hora em "Novo
Relatório" — com todas as colunas (Código, Responsável, Usuário, Contrato, CPF, Empresa, Plano,
Parcela, Vencimento, Pagamento, Regra, Recebido, Comissão, Mensalidade, Data de Adesão), não só
o total agregado. Justificativa dada pelo usuário: só usuários aprovados da própria empresa têm
acesso ao sistema, então o risco aceito é diferente do cenário original.

**O que foi implementado para isso:**
- `saved_reports/{reportId}` continua só com o agregado (`encryptedSellerData`, inalterado) —
  usado por Analytics/Dashboard/MonthComparison para ranking de vendedor.
- Nova subcoleção `saved_reports/{reportId}/broker_details/{brokerId}` — **um documento por
  corretora** (não um campo no doc pai) para não estourar o limite de 1 MiB/documento do
  Firestore em relatórios com muitas corretoras. Cada doc tem `{ corretora, encryptedRows,
  createdByUid }`, com `encryptedRows` sendo as linhas brutas (CPF/contrato/parcela/etc. inclusos)
  de cada arquivo original daquela corretora, cifradas com a mesma chave de equipe (AES-GCM,
  `teamCipher.mjs`) já usada para o agregado.
- `reportGenerator.js` (`generateIndividualReports`) agora captura essas linhas brutas por
  corretora em `summary[].rawBlocks`; `historyService.js` (`saveReport`) as cifra e grava na
  subcoleção; `exportSavedReport.js` as busca e reconstrói o Excel completo via a mesma
  `copyBlock`/`applyStandardBlockStyle`/`consolidateCommissionTotalsInWorksheet` usadas por
  "Novo Relatório", em vez do resumo "Vendedor / Responsável | Comissão" de antes.
- Campo novo `convertNumbers` (bool) persistido no doc principal do `saved_reports`, pra
  reconstrução respeitar a mesma opção usada na hora da geração original. Relatórios salvos
  antes deste campo existir assumem `true` (padrão da tela).
- `firestore.rules` ganhou `safeBrokerDetailFields()`/`validBrokerDetail()` e o match block da
  subcoleção; `deleteReport()` agora apaga os docs da subcoleção antes do doc pai (Firestore não
  faz cascade delete sozinho).
- Relatórios salvos **antes** desta mudança não têm a subcoleção — `exportSavedReport.js` cai de
  volta no resumo agregado antigo automaticamente quando não encontra detalhe salvo (sem erro).

**Consequência que o usuário aceitou conscientemente:** CPF, nome de cliente e valor de parcela
individual agora ficam de novo no Firestore (cifrados, mas acessíveis a qualquer usuário aprovado
que tenha a chave de equipe — igual ao ranking já era). O critério de sucesso original da Fase 1
("nenhum dado de nome+comissão individual em texto puro") deixou de valer integralmente para
`saved_reports`: os dados não estão em texto puro (estão cifrados), mas o vazamento de escopo —
detalhe transacional completo em vez de só agregado — foi uma escolha informada, não um bug.

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

## ✅ FINALIZAÇÃO — concluída em 2026-07-27

### 1. Dados legados em `saved_reports` — verificado, nada a fazer
Auditoria read-only no projeto `comissoesdp` (script temporário, login com a conta admin do `.env`) mostrou que as coleções `saved_reports` e `reports` estavam **vazias (0 documentos)** em produção. Não havia nenhum registro histórico com nome+comissão em texto puro para purgar ou regravar. O critério "nada de PII em texto puro" vale integralmente, inclusive para o histórico (porque não existe histórico).

### 2. Branch mesclado no `main`
Commit `daa91b0` ("merge: integra hardening de segurança do Firebase"). `main` sincronizado com `origin/main`, árvore limpa.

### 3. Regras do Firestore deployadas em produção
`npx firebase-tools deploy --only firestore:rules --project comissoesdp` executado com sucesso em 2026-07-27. As regras endurecidas (validação de schema, bloqueio de bypass de admin, proteção de `system_config`/`audit`) estão ativas em produção.

## Follow-ups de CI adiados (não bloqueiam merge; registrados no ledger)
- Suíte do emulador (Task 8) só roda com Java: rodar `npm run test:rules` num ambiente com JRE 11+ para validar as regras de verdade.
- Ampliar a suíte do emulador: testes de escrita da coleção `reports` (validNewReport hoje sem cobertura), um teste positivo "admin PODE atualizar um usuário", e testes de rejeição por tamanho de `encryptedSellerData` / `date is timestamp`.
- Cobertura da Task 3 (payload do `setDoc` / degradação de leitura sem chave ou blob inválido) — hoje garantida por leitura + testes de unidade do sanitizer + a regra `hasOnly`; um teste de integração com mock do Firestore seria um extra.

## Critérios de sucesso (do spec) — todos atendidos, inclusive em produção
- Nenhum nome+comissão individual em texto puro no Firestore. ✅ (Task 3; confirmado sem dados legados em produção)
- Todas as coleções com validação de schema nas regras. ✅ (Task 4; regras deployadas em produção)
- Suíte de emulador cobrindo comportamento real das regras. ✅ escrita; ⏳ validar em CI com Java (Task 8, não bloqueante)
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
