# Modernização do Contabilizador de Comissões — Especificação de Design

Data: 16 de julho de 2026
Status: aprovado em conversa; aguardando revisão do documento pelo usuário

## 1. Objetivo

Modernizar o contabilizador interno de comissões da Dental Plus em programação, organização, interface e estabilidade, preservando integralmente as regras atuais de cálculo, agrupamento, consolidação e geração de relatórios.

O aplicativo continuará processando arquivos exportados pelo sistema terceirizado. Não haverá integração direta com esse sistema nesta fase.

O horizonte operacional previsto é de aproximadamente seis meses, de julho de 2026 a janeiro de 2027. A solução deve ser confiável e segura nesse período, sem introduzir infraestrutura ou abstrações cujo benefício existiria apenas numa evolução de longo prazo.

## 2. Restrições e princípios

- As regras atuais de comissão são imutáveis nesta modernização.
- Refatorações devem produzir os mesmos resultados funcionais do aplicativo atual.
- Nenhuma linha classificada como duplicada será removida ou desconsiderada automaticamente.
- Arquivos de entrada e saída com dados pessoais permanecerão no ambiente local/rede da empresa.
- Dados pessoais ou conteúdo das planilhas não serão enviados ao Firebase.
- Todas as funções atuais permanecerão disponíveis: Dashboard, Novo Relatório, Relatórios Salvos, PDF de Resumo, Relatório Geral e Configuração de Corretoras.
- A distribuição será feita por executáveis portáteis executados a partir da rede compartilhada.
- Decisões de arquitetura seguirão o menor desenho que satisfaça os seis meses de operação, priorizando manutenção simples e recuperação de dados.

## 3. Contexto atual

O aplicativo atual utiliza Electron, React, Vite, ExcelJS e PDFKit. A maior parte do processamento está concentrada em `main.js`, que possui aproximadamente 1.500 linhas e combina inicialização do Electron, persistência, leitura de arquivos, regras de agrupamento, geração de Excel/PDF e manipuladores IPC.

O histórico atual é salvo em JSON no perfil local do Windows. Isso impede que usuários diferentes vejam o mesmo histórico e não protege contra gravações concorrentes. O processamento pesado ocorre no processo principal do Electron, o que pode congelar a interface.

Não há suíte de testes integrada ao aplicativo principal. Existe um `backend_backup.zip` não conectado à aplicação atual. Ele contém ideias aproveitáveis de validação, fila e testes, mas também contém um arquivo `.env`; o arquivo compactado não fará parte do produto final e qualquer credencial real contida nele deverá ser rotacionada.

O arquivo de exemplo fornecido é HTML com extensão `.xls`, possui estrutura fixa e será usado para caracterizar o comportamento atual. O parser continuará respeitando o comportamento vigente, inclusive decisões atuais sobre quais blocos compõem os cálculos.

## 4. Abordagem escolhida

Será usada refatoração incremental protegida por testes de regressão.

Antes de mover ou reorganizar a lógica, o aplicativo atual gerará resultados de referência em uma pasta temporária. Os valores, fórmulas, estrutura relevante e conteúdo textual das saídas serão capturados em testes. Cada etapa posterior deverá passar por esses testes.

Não será feita uma reescrita integral das regras de comissão.

Como o uso previsto termina em aproximadamente seis meses, a refatoração será limitada aos pontos necessários para testes, isolamento de processamento, segurança, Firebase, duplicidades e interface. Não será criada uma plataforma genérica, um backend próprio ou uma camada de extensibilidade para integrações futuras.

## 5. Arquitetura proposta

### 5.1 Camada de domínio legado

As funções que determinam leitura lógica, identificação de vendedor/corretora, conversão numérica, agrupamento, totais e conteúdo dos relatórios serão isoladas em módulos de domínio.

Durante a extração inicial, o comportamento será mantido. Melhorias internas só serão permitidas quando os testes demonstrarem equivalência.

### 5.2 Casos de uso

Casos de uso coordenarão os fluxos sem conter fórmulas de comissão:

- gerar relatórios por corretora;
- importar relatórios prontos;
- gerar PDF de resumo;
- analisar e gerar relatório geral;
- analisar duplicidades do lote;
- registrar e sincronizar histórico;
- cancelar e reprocessar itens com erro.

### 5.3 Workers de processamento

Leitura de planilhas, análise de duplicidades e geração de arquivos serão executadas fora do processo principal do Electron.

Cada tarefa terá:

- identificador único;
- progresso estruturado;
- cancelamento cooperativo;
- resultado ou erro por arquivo;
- limpeza de recursos e arquivos temporários;
- proteção contra duas finalizações da mesma tarefa.

### 5.4 Processo principal e IPC

O processo principal será limitado a janela, diálogos, sistema de arquivos, workers e integração controlada com o sistema operacional.

O preload exporá uma API mínima, tipada e validada. Cada manipulador validará origem, formato do payload, caminhos permitidos, extensões e limites.

### 5.5 Interface React

A interface será organizada por funcionalidades e componentes reutilizáveis. Estado de autenticação, sincronização, tarefas e notificações ficará separado das páginas.

Estilos inline repetidos serão substituídos por tokens e componentes, preservando azul, branco, logotipo e tema escuro da Dental Plus.

## 6. Firebase

### 6.1 Serviços

- Firebase Authentication para contas individuais por e-mail.
- Cloud Firestore no plano gratuito, em região de São Paulo.
- Firebase Emulator Suite para testar regras e fluxos sem usar dados reais.

### 6.2 Perfis

- `Administrador`: aprova usuários, define perfis, configura corretoras e destino padrão, consulta auditoria, restaura lixeira e executa exclusão definitiva.
- `Operador`: processa arquivos, consulta histórico e gera saídas, sem permissões administrativas.
- Novos cadastros começam como `pendente` e não acessam dados operacionais até aprovação.

O primeiro Administrador será promovido uma única vez pelo console do Firebase durante a implantação. Depois disso, novos usuários criarão apenas o próprio perfil pendente, e um Administrador ativo poderá aprová-los e atribuir o perfil pelo aplicativo.

### 6.3 Estrutura de coleções

- `users`: perfil, status e metadados mínimos de cada conta.
- `reports`: cabeçalho sanitizado de cada processamento e sua versão.
- `reports/{id}/brokers`: totais agregados por corretora, sem clientes.
- `fingerprints`: hashes, reservas de concorrência e referência às versões.
- `brokerConfigs`: corretoras e aliases compartilhados.
- `auditEvents`: eventos append-only validados pelas Security Rules.
- `trash`: referência e prazo de retenção dos itens excluídos logicamente.
- `syncOperations`: identificadores idempotentes necessários para conciliar operações offline.

### 6.4 Dados permitidos no Firestore

- identificadores aleatórios;
- mês e tipo de processamento;
- corretora e vendedor quando necessários ao dashboard;
- totais e quantidades agregadas;
- status e versão;
- hashes de arquivos/lotes;
- contagens de duplicidades;
- identificador do usuário, data/hora e computador;
- configurações não sensíveis;
- eventos de auditoria sanitizados;
- estado da lixeira.

### 6.5 Dados proibidos no Firestore

- CPF;
- contrato e código de cliente;
- nome de beneficiário, usuário ou responsável;
- conteúdo de células ou linhas;
- planilha original ou gerada;
- caminho completo de arquivo;
- mensagens de erro com dados ou caminhos sensíveis;
- credenciais administrativas.

Uma função de serialização com lista explícita de campos permitidos será a única porta de gravação. Campos adicionais serão rejeitados, não ignorados silenciosamente.

### 6.6 Segurança

O executável conterá apenas a configuração pública do Firebase. Não haverá chave administrativa, conta de serviço ou segredo de backend no aplicativo.

Security Rules exigirão autenticação, perfil ativo e permissão por operação. Eventos de auditoria serão somente de criação, com ator autenticado e ações validadas por lista permitida; atualizações e exclusões diretas serão negadas para todos os clientes. Exclusões e restaurações exigirão Administrador.

O projeto gratuito não oferece backup gerenciado completo. O aplicativo produzirá snapshots sanitizados do histórico e das configurações, sem dados pessoais, para recuperação operacional. Os snapshots usarão criptografia AES-256-GCM com uma chave de recuperação configurada e guardada pelo Administrador fora do Firestore e do repositório. Serão mantidos os 30 snapshots diários mais recentes e um snapshot adicional antes de ações administrativas destrutivas.

### 6.7 Modo offline

Processamento e geração de arquivos não dependerão da internet.

Gravações de histórico e auditoria usarão cache persistente e fila idempotente. Ao recuperar a conexão, a sincronização repetirá operações sem criar duplicatas.

Conflitos surgidos entre computadores simultaneamente offline serão detectados no servidor durante a sincronização e registrados como versões distintas, nunca como sobrescrita.

## 7. Detecção de duplicidades

### 7.1 Duplicidade de arquivos e processamentos

O nome do arquivo não participará da identificação.

Serão calculados localmente:

- hash SHA-256 dos bytes para arquivos exatamente iguais;
- impressão digital normalizada do conteúdo para downloads equivalentes com nomes, espaços ou detalhes técnicos diferentes;
- hash do lote, combinando arquivos, mês, opções e tipo de processamento.

O Firestore receberá somente os hashes e metadados permitidos. Uma transação reservará o identificador do processamento para detectar concorrência entre usuários.

Reprocessamentos serão avisados e, se confirmados, criarão nova versão identificada. Nenhum arquivo ou registro será sobrescrito.

### 7.2 Clientes repetidos dentro do lote

Todos os arquivos selecionados serão analisados conjuntamente e apenas no computador do usuário.

Campos serão normalizados em memória. Para PF, a classificação usará CPF, contrato, parcela, pagamento e comissão. Para PJ, usará código/empresa, parcela, pagamento e comissão, conforme os campos disponíveis.

- `Confirmada`: combinação completa repetida.
- `Possível`: mesmo CPF, contrato ou código, com diferença em parcela, data ou valor.

A tela mostrará grupos, arquivo e linha de origem e campos divergentes. CPF ficará mascarado por padrão e poderá ser revelado pelo usuário autorizado.

A revisão exigirá confirmação antes de continuar, mas não bloqueará permanentemente nem modificará os cálculos. Somente contagens, status de revisão e decisão irão ao Firestore.

Uma eventual planilha de conferência será local, marcada como restrita e fora dos backups do Firestore.

## 8. Fluxo do usuário

1. Usuário entra com conta individual.
2. Dashboard mostra indicadores, sincronização, histórico recente e ações rápidas.
3. Usuário escolhe fluxo, mês e arquivos.
4. Destino padrão da rede é preenchido; o usuário pode alterá-lo.
5. Aplicativo valida formato, tamanho, assinatura, integridade e estrutura.
6. Aplicativo verifica arquivos/processamentos repetidos.
7. Aplicativo analisa clientes repetidos no lote.
8. Usuário revisa e confirma a continuação.
9. Worker processa o lote com progresso e cancelamento.
10. Saídas são gravadas como temporárias e promovidas por renomeação após sucesso.
11. Erros ficam associados aos arquivos afetados e podem ser reprocessados seletivamente.
12. Histórico e auditoria são sincronizados quando houver conexão.

## 9. Histórico, versões e lixeira

- Histórico compartilhado entre os usuários.
- Registros nunca serão sobrescritos.
- Mesmo mês poderá ter várias versões com autor e horário.
- Exclusão será lógica.
- Itens permanecerão 30 dias na lixeira.
- Somente Administradores poderão restaurar ou excluir definitivamente.
- A expiração será avaliada quando um Administrador abrir ou sincronizar o aplicativo; não dependerá de função paga em nuvem.

## 10. Auditoria

Serão registrados:

- login e logout relevantes;
- aprovação e alteração de perfil;
- criação e alteração de configurações;
- início, cancelamento, falha e conclusão de processamento;
- confirmação de duplicidades;
- criação de nova versão;
- envio à lixeira, restauração e exclusão definitiva.

O registro conterá identificadores, ação, data/hora, usuário e computador, sem planilhas, CPF, contratos, nomes de clientes ou caminhos completos.

## 11. Interface

O Dashboard continuará sendo a tela inicial e receberá ações rápidas para os fluxos principais.

Melhorias previstas:

- hierarquia visual consistente;
- componentes reutilizáveis para botões, campos, tabelas, diálogos, status e notificações;
- estados vazios e mensagens acionáveis;
- indicador global de online/offline e sincronização;
- área de tarefas com progresso e cancelamento;
- conferência clara de duplicidades;
- acessibilidade por teclado e foco visível;
- responsividade para resoluções menores;
- preservação do tema escuro;
- remoção de emojis quebrados e textos inconsistentes;
- logs técnicos acessíveis sem expor dados sensíveis.

## 12. Estabilidade e proteção de arquivos

- Operações pesadas não bloquearão a interface.
- Arquivos de saída incompletos usarão extensão temporária e serão removidos em falha/cancelamento.
- Promoção para o nome final será atômica quando suportada pelo volume de destino.
- Em falhas de rede durante gravação, a operação será classificada e não será apresentada como concluída.
- Validações rejeitarão extensões duplas, assinaturas incompatíveis, arquivos corrompidos e conteúdo inesperado.
- Fórmulas e conteúdo potencialmente perigoso serão sinalizados sem alterar silenciosamente a lógica de comissão.
- Erros serão estruturados por categoria e arquivo, com mensagens sanitizadas.

## 13. Distribuição e compatibilidade

Serão gerados dois executáveis portáteis:

- x64 para Windows 10/11 de 64 bits;
- x86 para Windows 10/11 de 32 bits.

O x86 usará a última linha do Electron que oferece binários de 32 bits e terá descontinuação planejada até janeiro de 2027. O x64 continuará recebendo atualizações.

Não haverá investimento em uma nova tecnologia para prolongar o suporte x86 após janeiro de 2027, pois essa data coincide com o encerramento previsto do projeto. Se o uso for prorrogado, a continuidade deverá ser reavaliada antes dessa data.

O aplicativo será disponibilizado na rede compartilhada. A execução deverá manter dados de cache e sessão no perfil do usuário, sem gravar credenciais na pasta compartilhada.

## 14. Testes e critérios de aceitação

### 14.1 Regressão da lógica

- Gerar saídas de referência com o aplicativo atual e o arquivo fornecido.
- Comparar valores, fórmulas, estrutura relevante e textos após cada refatoração.
- Ignorar apenas metadados voláteis documentados, como horários de criação.
- Nenhuma diferença de cálculo será aceita sem pedido explícito do usuário.

### 14.2 Testes automatizados

- parsing de HTML `.xls` e `.xlsx`;
- números e moedas brasileiras;
- identificação e agrupamento de corretoras/vendedores;
- consolidação de totais;
- PDF e relatório geral;
- hashes e idempotência;
- duplicidades confirmadas e possíveis;
- workers, cancelamento e reprocessamento;
- escrita temporária e limpeza;
- fila offline e conflitos de sincronização;
- regras do Firebase por perfil;
- lixeira e auditoria;
- fluxos essenciais da interface.

### 14.3 Verificação manual

- Executável x64 no ambiente disponível.
- Executável x86 compilado e validado em máquina Windows 32 bits fornecida para homologação.
- Execução a partir da pasta compartilhada.
- Teste simultâneo com 2–3 usuários.
- Teste de queda e retorno da internet.
- Teste de cancelamento durante leitura e geração.
- Teste de arquivos repetidos com nomes diferentes.
- Teste de clientes repetidos entre arquivos do mesmo lote.

## 15. Migração e implantação

1. Caracterizar comportamento atual e criar testes.
2. Separar módulos sem mudanças de resultado.
3. Introduzir workers e gravação segura.
4. Modernizar componentes e fluxos existentes.
5. Integrar Firebase Authentication e Firestore com emulador.
6. Adicionar modo offline, auditoria, versões e lixeira.
7. Adicionar análise local de duplicidades.
8. Configurar projeto Firebase de produção em São Paulo.
9. Validar Security Rules e ausência de dados proibidos.
10. Gerar x86/x64 e realizar homologação.
11. Disponibilizar na rede e documentar recuperação/backup.
12. Documentar exportação e arquivamento dos dados ao final dos seis meses.

## 16. Fora de escopo

- Integração direta com o sistema terceirizado.
- Alteração das regras de comissão.
- Remoção automática de clientes duplicados.
- Upload de planilhas para Firebase Storage.
- Armazenamento de dados pessoais no Firestore.
- Automação de tarefas dentro do sistema terceirizado.
- Arquitetura para uso plurianual, múltiplas empresas ou integrações futuras não solicitadas.
- Substituição tecnológica do Electron apenas para manter Windows 32 bits depois de janeiro de 2027.

## 17. Riscos e mitigação

- **Alteração acidental da lógica:** testes de caracterização antes da refatoração.
- **Diferenças entre downloads equivalentes:** impressão digital normalizada além do hash bruto.
- **Concorrência offline:** versões idempotentes e resolução no servidor sem sobrescrita.
- **Ausência de backup gerenciado gratuito:** snapshots sanitizados e procedimento documentado de restauração.
- **Credencial antiga no ZIP:** remoção do artefato e rotação das credenciais relacionadas.
- **Fim do Electron 32 bits:** distribuição x86 temporária e migração até janeiro de 2027.
- **Teste insuficiente em x86:** homologação obrigatória em máquina física de 32 bits.
- **Pasta de rede permissiva:** manter arquivos sensíveis fora da nuvem e recomendar restrição de acesso SMB/Windows aos usuários autorizados.
- **Prorrogação além dos seis meses:** executar uma revisão de continuidade, dependências e segurança antes de janeiro de 2027.

## 18. Definição de pronto

O trabalho estará pronto quando:

- os testes de regressão confirmarem os resultados atuais;
- todos os fluxos atuais estiverem funcionais;
- a interface aprovada estiver implementada;
- autenticação, perfis, Firestore, offline, versões, auditoria e lixeira funcionarem;
- dados proibidos não aparecerem no Firestore, logs ou snapshots;
- duplicidades do lote forem classificadas e revisáveis sem modificar cálculos;
- cancelamento e reprocessamento seletivo funcionarem;
- builds x64 e x86 forem produzidos;
- documentação de uso, administração, backup e implantação estiver disponível.
- procedimento de exportação e arquivamento ao encerramento do projeto estiver documentado.
