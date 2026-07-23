# Configuração do Firebase

Este projeto usa Firebase Authentication e Cloud Firestore somente para contas, permissões, auditoria e metadados operacionais. Arquivos importados e dados detalhados permanecem no computador e na pasta de rede escolhida.

## Projeto gratuito

1. Crie um projeto no Firebase no plano Spark.
2. Crie o banco Cloud Firestore na região `southamerica-east1`.
3. Ative Authentication > Método de login > E-mail/senha.
4. Registre um aplicativo Web e copie a configuração pública para um arquivo `.env`, usando `.env.example` como modelo.
5. Instale a Firebase CLI, autentique-se e associe esta pasta ao projeto.
6. Publique as regras com `firebase deploy --only firestore:rules`.

As chaves `VITE_FIREBASE_*` identificam o aplicativo Web e não substituem as regras de segurança. Não use credenciais de conta de serviço neste aplicativo portátil.

## Primeiro Administrador

1. Abra o aplicativo e crie a primeira solicitação de acesso.
2. No console do Firestore, abra `users/{uid}` dessa conta.
3. Altere `role` para `admin` e `status` para `approved`.
4. Saia e entre novamente no aplicativo.

Depois disso, o próprio Administrador pode aprovar Operadores pela interface.

## Chave de criptografia da equipe (ranking de vendedores)

O histórico de relatórios salvos (`saved_reports`) guarda o nome e a comissão de cada
vendedor cifrados no navegador antes de ir para o Firestore. Depois de aprovar o
primeiro Administrador:

1. Entre como Administrador e abra **Configurar corretoras**.
2. Clique em **Gerar chave de equipe** (aparece só se ainda não existir).
3. A partir daí, todo relatório salvo por qualquer usuário aprovado passa a
   sincronizar o ranking de vendedores de forma cifrada.

**Limitação da Fase 1:** como não há servidor nesta fase, a chave fica em
`system_config/team_key`, legível por qualquer usuário aprovado — o mesmo grupo que
já acessa o dado cifrado. Isso protege contra acesso via console/API por quem não é
usuário do app e contra bugs de regra que exponham a coleção sem querer, mas não
protege um dispositivo roubado com o cache offline do Firestore ativo. Entrega de
chave via servidor fica para uma Fase 2 futura.

## Dados que podem ir para o Firestore

- identificador e mês do processamento;
- totais agregados e quantidades;
- versão, datas e estado da lixeira;
- caminho da pasta compartilhada;
- impressões SHA-256 dos arquivos e do lote;
- identidade do usuário que executou uma ação.

Não são sincronizados arquivos, CPF, nomes de clientes, contratos, parcelas, pagamentos, comissões por cliente nem detalhes internos das planilhas. A persistência offline do Firestore armazena apenas os mesmos metadados permitidos e sincroniza alterações quando a conexão volta.
