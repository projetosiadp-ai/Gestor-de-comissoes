# Hardening de Segurança — Firebase (Fase 1: sem servidor)

**Data:** 2026-07-22
**Status:** Aprovado para planejamento de implementação

## Contexto

O Contabilizador de Comissões Dental Plus é uma SPA React+Vite que processa planilhas de comissões de corretores/vendedores no navegador e sincroniza metadados operacionais no Firestore (histórico de relatórios, contas de usuário, auditoria). A política documentada do projeto (README, `docs/CONFIGURACAO_FIREBASE.md`) afirma que dados sensíveis (CPF, nomes de clientes, contratos, valores individuais) nunca devem sair do navegador — só totais agregados vão para o Firestore.

Uma auditoria do código encontrou uma divergência crítica entre essa política e a implementação real, além de outras lacunas de segurança menores. Este spec define o design da **Fase 1** da correção: tudo que pode ser resolvido usando apenas Firestore Security Rules e código client-side, sem custo adicional (plano Spark/gratuito do Firebase, sem Cloud Functions).

Uma **Fase 2** é esboçada como roadmap (não implementada agora) para itens que exigem um componente de servidor (Cloud Functions, plano Blaze).

## Achado crítico: vazamento em `saved_reports`

A coleção `reports` já é protegida corretamente: um sanitizador dedicado (`report-sanitizer.mjs`) remove CPF/cliente/contrato antes do write, e a regra do Firestore usa `hasOnly()`/validação de tipos para garantir que só esse formato seguro seja aceito.

A coleção `saved_reports`, usada pelo `historyService.js` para manter o histórico compartilhado da equipe, **não segue esse mesmo padrão**: grava o objeto de relatório bruto, incluindo `summary[].vendedoresDetalhes` (nome do vendedor + comissão individual) e `nomesVendedores`. A regra atual (`allow create, update: if isApproved();`) não tem nenhuma validação de schema, permitindo que qualquer usuário aprovado leia toda a coleção e escreva/sobrescreva documentos com qualquer formato.

Esse dado (nome de vendedor + valor da comissão) alimenta o ranking de vendedores em `Analytics.jsx`/`Dashboard.jsx`.

## Escopo da Fase 1

### 1. Correção do `saved_reports` (prioridade #1)

**Sanitização:** os writes para `saved_reports` passam a reusar/estender o sanitizador já usado em `reports`, removendo CPF/cliente/contrato/caminhos de arquivo antes de qualquer persistência.

**Preservação do ranking via criptografia client-side:** o bloco de dados por vendedor (`vendedoresDetalhes`, `nomesVendedores`) é criptografado no navegador com AES-GCM 256-bit (Web Crypto API nativa, sem dependência externa) e persistido como um único campo `encryptedSellerData` (string, blob cifrado). O Firestore nunca armazena nome+valor em texto puro.

**Chave de equipe:** gerada uma vez por um administrador através de uma ação simples na UI de configuração, armazenada em `system_config/team_key`. Leitura liberada a `isApproved()` (todos os usuários aprovados conseguem decifrar o ranking, mantendo a funcionalidade atual). Escrita restrita a `isAdmin()`.

**Regras Firestore travadas para `saved_reports`:**
- `hasOnly()`/validação de tipos no mesmo padrão de `reports` (allowlist de campos, `encryptedSellerData` limitado a um tamanho máximo razoável).
- `update` deixa de ser liberado para qualquer usuário aprovado — restrito ao criador do documento ou a um admin, e só para um subconjunto de campos permitidos (mesmo padrão usado em `reports`).

**Limitação residual (documentada, aceita para a Fase 1):** como não há componente de servidor nesta fase, a chave de decifragem fica acessível ao mesmo grupo de usuários que acessa o dado cifrado, através de um documento Firestore comum. Isso protege contra: acesso via console/API por quem não é usuário do app, bugs de regra que exponham a coleção sem querer, e acesso à infraestrutura subjacente do Google/Firebase. **Não protege** contra um dispositivo roubado com cache offline ativo (`persistentLocalCache`), já que a chave também fica cacheada localmente junto com o dado cifrado nesse cenário. Fica registrado como item de melhoria da Fase 2 (entrega de chave via Cloud Function, nunca persistida em cache).

### 2. Hardening de `system_config`

A regra de escrita (`allow write: if isAdmin();`) não valida formato hoje. Passa a incluir `hasOnly()`/validação de tipos para o documento `corretoras_config` e para o novo `team_key`.

### 3. Remoção do bypass "modo local"

`AuthContext.jsx` hoje sintetiza uma sessão de admin completa sem autenticação (`{ role: 'admin', status: 'approved' }`) quando as variáveis de ambiente do Firebase não estão configuradas. Esse fallback é removido do código de produção: se o Firebase não estiver configurado, o app deve exibir uma tela de erro bloqueando o acesso, nunca logar automaticamente como admin.

### 4. Salvaguarda na promoção de admin

A ação "Tornar Admin" em `UserManagement.jsx` passa a exigir confirmação explícita na UI (ex: digitar o e-mail do usuário-alvo para confirmar a ação). O registro de auditoria correspondente passa a incluir explicitamente `previousRole` e `newRole` nos detalhes, além dos campos já existentes (ator, alvo, timestamp).

### 5. Limpeza do legado Electron

Removidos os arquivos órfãos de uma arquitetura Electron que não existe mais no projeto: `old_NewReport.jsx`, `renderer.js`, `Gestão de comissões.html`, `fc.txt`, `tests/main/*`, `tests/security/electron-security.test.cjs`. `docs/ARQUITETURA.md` e `LEIA-ME.txt` são reescritos para refletir a arquitetura real (SPA React+Vite, Firebase Hosting/Firestore, sem processo Electron), eliminando ambiguidade sobre o modelo de confiança do sistema.

### 6. Suíte de testes de regras com emulador

O teste atual (`tests/cloud/firestore-rules.test.cjs`) só verifica presença de texto/regex no arquivo de regras — não executa as regras de verdade. Nova suíte usando `@firebase/rules-unit-testing` contra o Firestore Emulator, cobrindo uma matriz allow/deny por papel (anônimo, usuário pendente, operator aprovado, admin) × coleção (`users`, `reports`, `audit`, `saved_reports`, `system_config`) × operação (create/read/update/delete), incluindo especificamente os novos limites de `saved_reports` (rejeitar documentos fora do formato sanitizado, rejeitar update por não-criador/não-admin).

## Fora de escopo (Fase 2 — roadmap futuro, não implementado agora)

Estes itens exigem um componente de servidor (Cloud Functions, plano Blaze) e ficam documentados para orientar decisões futuras, sem serem implementados nesta rodada:

- **Custom claims** de role/status no token de Auth, eliminando a leitura `get()` em `users/{uid}` a cada avaliação de regra.
- **Rate limiting real** e detecção de abuso (ex: App Check, contagem de escritas por usuário).
- **Entrega de chave via servidor** para `saved_reports`, evitando que a chave de decifragem fique persistida em cache offline junto ao dado cifrado.
- **Purga automática** da lixeira de 30 dias via função agendada, em vez de depender de um admin abrir o app.
- **MFA** (autenticação multifator) para usuários, especialmente admins.
- **Aprovação de admin em duas etapas** (exigir confirmação de um segundo admin) para promoções de conta.

## Explicitamente fora de escopo (decisão do usuário)

- Conformidade formal com LGPD (política de retenção documentada, mecanismo de exclusão sob pedido, DPO) — o objetivo desta rodada é segurança técnica (evitar vazamento/acesso indevido), não conformidade regulatória formal.
- Verificação de e-mail obrigatória e política de senha mais rígida além do atual `minLength={8}` client-side — autenticação permanece como está nesta rodada.

## Critérios de sucesso

- Nenhum dado de nome+comissão individual de vendedor é gravado em texto puro em qualquer coleção do Firestore.
- Todas as coleções do Firestore (`users`, `reports`, `audit`, `saved_reports`, `system_config`) têm validação de schema (`hasOnly()`/tipos) nas regras — nenhuma escrita de formato livre é aceita.
- A suíte de testes com emulador passa e cobre o comportamento real das regras, não apenas texto do arquivo.
- Não existe caminho de código que produza uma sessão autenticada/com privilégios sem passar pelo Firebase Auth.
- O repositório não contém mais código ou documentação que descreva uma arquitetura Electron inexistente.
