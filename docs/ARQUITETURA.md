# Organização do projeto

O aplicativo é um desktop Electron com interface React. As regras de comissão continuam isoladas dos componentes visuais e dos adaptadores do sistema operacional.

## Pastas principais

- `config/`: configuração padrão incluída no executável.
- `src/main/`: processo principal do Electron.
  - `app/`: criação da janela.
  - `config/`: preferências locais e configuração de corretoras.
  - `core/`: regras estáveis, validação, histórico e segurança do processamento.
  - `ipc/`: registro dos canais expostos à interface.
  - `reports/`: leitura e formatação dos arquivos de entrada e saída.
- `src/components/layout/`: estrutura visual compartilhada da aplicação.
- `src/pages/`: telas e fluxos de trabalho.
- `src/services/`: comunicação com os serviços de sincronização.
- `src/styles/`: estilos globais da interface.
- `tests/`: regressões da lógica atual, contratos IPC, segurança e estrutura.
- `scripts/`: validação e empacotamento.
- `release/`: executáveis portáteis gerados; não faz parte do código-fonte.

## Pontos de entrada

- `main.js`: ponte compatível para `src/main/index.cjs`.
- `preload.js`: API segura disponível para o React.
- `src/main.jsx`: inicialização da interface.

## Regra de manutenção

Alterações nas fórmulas, identificação de totais ou consolidação de comissões exigem uma solicitação específica e novos testes de regressão. Refatorações devem manter os resultados atuais demonstrados por `tests/baseline/current-behavior.test.cjs`.

## Validação

Execute `npm test` antes de compilar. A compilação completa é feita por `Compilar.bat` ou `npm run build:app` e gera os executáveis de 32 e 64 bits em `release/`.
