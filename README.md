# Contabilizador de Comissões Dental Plus

Aplicativo desktop (Windows) para processar planilhas de comissões da Dental Plus,
gerar relatórios em Excel/PDF e manter um histórico compartilhado. O processamento
de dados sensíveis é **local**; a nuvem recebe apenas metadados operacionais.

> **Privacidade:** planilhas, CPF, cliente, contrato e valores individuais são
> processados apenas no computador. O Firestore recebe somente contas, permissões,
> auditoria, totais agregados, versões e impressões SHA-256. Sem um arquivo `.env`
> configurado, o programa funciona em **Modo local** e não sincroniza nada.

## Recursos

- Revisão obrigatória de **duplicidades** (confirmadas e possíveis) antes de gerar,
  sem remover ou alterar linhas automaticamente.
- Geração de relatórios de comissão em **Excel** (ExcelJS) e resumos em **PDF** (PDFKit).
- Relatórios existentes **nunca são sobrescritos**: novas execuções recebem versões
  `_v2`, `_v3` etc.
- Histórico compartilhado com **perfis de acesso** (Administrador e Operador) e
  aprovação de novas contas.
- **Lixeira** com retenção de 30 dias (os arquivos Excel/PDF não são apagados).
- Auditoria de ações visível para administradores.
- Executáveis **portáteis** para Windows x64 e x86 (ia32).

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior (inclui o `npm`).
- Windows 10/11 (x64 ou x86) para gerar e executar os portáteis.

## Instalação

```bash
npm ci
```

## Desenvolvimento

Inicia o Vite e o Electron em modo de desenvolvimento com recarga:

```bash
npm run dev
```

## Testes

Executa a suíte completa (`node:test`) — regras de comissão, contratos IPC,
segurança e estrutura:

```bash
npm test
```

## Compilação (executáveis portáteis)

Gera os portáteis x64 e ia32 na pasta `release/`:

```bash
npm run build:app
```

No Windows também é possível usar os atalhos:

- `Compilar.bat` — instala dependências (`npm ci`) e compila os portáteis.
- `Iniciar.bat` / `ABRIR PROGRAMA.bat` — abre o portátil já compilado na pasta `release/`.

## Configuração do Firebase (opcional)

A sincronização de contas e metadados é opcional. Para ativá-la, copie
`.env.example` para `.env` e preencha as chaves públicas do seu aplicativo Web
do Firebase. O passo a passo completo está em
[`docs/CONFIGURACAO_FIREBASE.md`](docs/CONFIGURACAO_FIREBASE.md).

## Estrutura do projeto

```
config/              Configuração padrão embarcada no executável
src/
  main/              Processo principal do Electron
    app/             Criação da janela
    config/          Preferências locais e corretoras
    core/            Regras estáveis, validação, histórico e segurança
    ipc/             Registro dos canais expostos à interface
    reports/         Leitura e formatação de entradas/saídas
  components/layout/ Estrutura visual compartilhada
  pages/             Telas e fluxos de trabalho
  services/          Comunicação com os serviços de sincronização
  styles/            Estilos globais da interface
tests/               Regressões, contratos IPC, segurança e estrutura
scripts/             Validação e empacotamento
release/             Executáveis portáteis gerados (não versionado)
```

Detalhes de arquitetura e limites de cada módulo estão em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Manutenção

Alterações nas fórmulas de comissão, na identificação de totais ou na
consolidação exigem solicitação específica e novos testes de regressão.
Refatorações devem preservar os resultados demonstrados por
`tests/baseline/current-behavior.test.cjs`. Rode `npm test` antes de compilar.
