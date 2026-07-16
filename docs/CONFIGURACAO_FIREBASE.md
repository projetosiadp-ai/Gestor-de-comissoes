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

## Dados que podem ir para o Firestore

- identificador e mês do processamento;
- totais agregados e quantidades;
- versão, datas e estado da lixeira;
- caminho da pasta compartilhada;
- impressões SHA-256 dos arquivos e do lote;
- identidade do usuário que executou uma ação.

Não são sincronizados arquivos, CPF, nomes de clientes, contratos, parcelas, pagamentos, comissões por cliente nem detalhes internos das planilhas. A persistência offline do Firestore armazena apenas os mesmos metadados permitidos e sincroniza alterações quando a conexão volta.
