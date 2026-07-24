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
