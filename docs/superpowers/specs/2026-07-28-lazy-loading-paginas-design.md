# Lazy loading das páginas do frontend — Spec de Design

> **Data:** 2026-07-28
> **Contexto:** limpeza técnica pós-hardening de segurança (não é resposta a uma reclamação de lentidão — o app é usado no escritório, com rede boa).

## Problema

O build de produção (`npm run build`) gera um único bundle JS de **3,84 MB (1,07 MB gzipped)**, sem nenhuma divisão. O próprio Vite alerta: "Some chunks are larger than 500 kB after minification."

Causa raiz: `src/App.jsx` importa estaticamente as 10 páginas (`Dashboard`, `NewReport`, `SavedReports`, `PdfSummary`, `GeneralReport`, `Analytics`, `ConfigCorretoras`, `UserManagement`, `Trash`, `AuditLog`) e as renderiza condicionalmente por um state `activePage`. Como todas são `import` estático, o bundler inclui todas no arquivo inicial — incluindo páginas que usam bibliotecas pesadas de geração de arquivo (`exceljs`, `pdfkit`, `blob-stream`, `jszip`, via `src/services/reportGenerator.js` e `exportSavedReport.js`) mesmo quando o usuário nunca abre essas páginas na sessão.

## Objetivo

Reduzir o bundle inicial fazendo o carregamento de cada página sob demanda (code-splitting por página), sem alterar comportamento, dados ou navegação.

## Fora de escopo

Para manter esta mudança isolada e de baixo risco, os itens abaixo **não** fazem parte deste spec (candidatos a rodadas futuras de brainstorming separadas):

- `src/index.css` — arquivo aparentemente órfão (não importado em lugar nenhum), achado durante o levantamento.
- Aviso de build do Tailwind ("content option missing") — sugere config presente mas não utilizada.
- Introdução de roteamento (react-router) / URLs por página / suporte a voltar-avançar do navegador.
- `manualChunks` / separação de bibliotecas vendor em chunks próprios (avaliado e descartado nesta rodada — ver "Abordagens consideradas").

## Design

### Arquitetura

- Mantém o modelo de navegação atual: state `activePage` em `App.jsx`, sem router.
- A página padrão que carrega na abertura do app (`Dashboard`) **continua com `import` estático** — evita uma rodada de rede extra antes da primeira tela aparecer.
- As demais 9 páginas passam de `import X from './pages/X'` para `const X = React.lazy(() => import('./pages/X'))`.
- O bloco de renderização condicional das páginas (`{activePage === 'x' && <X/>}`) é envolvido por um único `<Suspense fallback={...}>`.

### Efeito esperado no bundling

Como o Rollup faz code-splitting automático em cada `import()` dinâmico, isolando transitivamente tudo que só é alcançável a partir daquele ponto: páginas que importam (direta ou indiretamente) `reportGenerator.js`/`exportSavedReport.js` — `NewReport`, `GeneralReport`, `PdfSummary`, `SavedReports` — devem passar a carregar `exceljs`/`pdfkit`/`jszip` em chunks próprios, baixados só na primeira vez que o usuário abre uma dessas páginas. Páginas administrativas (`UserManagement`, `Trash`, `AuditLog`, `ConfigCorretoras`) e `Analytics` não dependem dessas libs pesadas, então também saem do bundle inicial.

### Fallback de carregamento (Suspense)

Reaproveita o padrão visual já existente no app — a classe `.status.loading` (usada nas próprias páginas para estados de carregamento assíncrono) — com um texto como "Carregando…", em vez de um spinner genérico. Em rede de escritório, a expectativa é que isso apareça por uma fração de segundo.

### O que não muda

- Nenhuma alteração em props, busca de dados (Firestore `onSnapshot`, services) ou lógica de negócio — é puramente uma mudança de *quando* o módulo JS é carregado.
- `Sidebar`, `onNavigate` e o resto da navegação ficam idênticos.
- Nenhuma mudança em `firestore.rules` ou em qualquer arquivo tocado pelo hardening de segurança.

## Abordagens consideradas

1. **Lazy-load das páginas via `React.lazy`/`Suspense` (escolhida).** Ataca a causa raiz medida (bundle de 3,84 MB), esforço baixo-médio, risco baixo — não requer configuração adicional no Vite além do já existente.
2. **`manualChunks` de bibliotecas vendor, sem lazy-load.** Melhoraria cache entre deploys (o código de app muda mais que o vendor), mas não reduz o download do primeiro acesso — não resolve o problema medido. Descartada para esta rodada.
3. **As duas combinadas.** Ganho marginal adicional de cache a longo prazo, mas esforço/complexidade desproporcionais para um app interno de baixo tráfego. Descartada para esta rodada; pode ser revisitada se o tráfego crescer.

## Critérios de sucesso / verificação

- `npm run build` deixa de gerar um único `dist/assets/index-*.js`; aparecem múltiplos chunks, um por página lazy (mais os chunks das libs pesadas isoladas). Tamanho do chunk inicial cai de forma perceptível frente aos 3,84 MB atuais.
- Checagem manual no navegador: abrir o app, clicar em cada uma das 10 páginas, confirmar que cada uma renderiza sem erro no console; a aba de rede mostra um novo chunk sendo baixado apenas na primeira vez que cada página é aberta na sessão.
- `npm test` continua em 19/19 (nenhuma mudança de lógica esperada, mas deve ser confirmado — este é um projeto sem framework de testes de componente/UI, então a suíte não cobre renderização de página diretamente).

## Riscos / notas

- Se alguma página hoje depender de efeito colateral de import estático de nível de módulo (ex.: algo executado no topo do arquivo fora de um componente), isso passaria a rodar só quando a página for aberta, não no boot do app. A implementação deve confirmar que nenhuma das 9 páginas tem esse padrão antes de convertê-la.
- `Suspense` exige que cada page-component seja o `default export` do seu módulo (padrão já usado neste projeto).
