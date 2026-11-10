# Formulário de Segurança de Dados — folha de respostas

Para preencher a seção **Segurança dos dados** na Play Console.

Cada resposta aqui tem o arquivo do código que a justifica. Preencher errado
reprova igual a não preencher — e é fácil errar de boa fé, marcando "sim" para
algo que o app nem faz.

Lido do código em 10/11/2026. **Se o app mudar, confira esta folha antes de
reenviar.**

---

## Antes de começar: três conceitos do Google

Errar aqui é o que mais reprova.

**"Coletado"** significa que o dado **sai do aparelho**. Dado que o app lê e usa
só na memória, sem mandar para lugar nenhum, **não** é coletado.

**"Compartilhado"** significa transferir para **outra empresa**. Mandar para a
sua própria infraestrutura (Firebase) ou para quem processa em seu nome não
conta como compartilhar.

**"Processado temporariamente"** é o dado que sai do aparelho mas não é
guardado, usado só para responder àquele pedido.

---

## Perguntas iniciais

| Pergunta                                                         | Resposta | Por quê                                                |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| Seu app coleta ou compartilha algum dos tipos de dados exigidos? | **Sim**  | Conta, agendamento, foto e token de notificação        |
| Todos os dados são criptografados em trânsito?                   | **Sim**  | Tudo passa por Firebase e HTTPS                        |
| Você fornece um jeito de o usuário pedir a exclusão dos dados?   | **Sim**  | Perfil → Excluir conta, e a página pública de exclusão |

> O "sim" da exclusão só é verdade desde o PR #173. Antes dele, essa resposta
> teria que ser "não" — e isso sozinho reprovaria o app.

**URL de exclusão a informar:** <https://detailgo.com.br/excluir-conta/>

---

## Localização

| Tipo                   | Coletado | Compartilhado | Obrigatório  | Finalidade            |
| ---------------------- | -------- | ------------- | ------------ | --------------------- |
| Localização aproximada | **Não**  | —             | —            | —                     |
| Localização precisa    | **Sim**  | Não           | **Opcional** | Funcionalidade do app |

**Por que "sim" na precisa.** No cadastro da estética o app lê o GPS para
preencher o endereço do negócio, e esse endereço **fica gravado**
(`auth.service.ts:67`) — é ele que põe a loja no mapa.

**Por que "não" na aproximada.** Quando o cliente abre o mapa, o app lê o GPS
mas calcula a distância **dentro do aparelho**: ele baixa as estéticas visíveis
e ordena localmente (`discoverShops.service.ts:39`). A posição do cliente não é
enviada nem gravada.

> Marque **Opcional**: quem recusa a permissão continua usando o app e escolhe a
> estética pela lista.

---

## Informações pessoais

| Tipo                                                  | Coletado | Compartilhado | Obrigatório  | Finalidade                             |
| ----------------------------------------------------- | -------- | ------------- | ------------ | -------------------------------------- |
| Nome                                                  | **Sim**  | Não           | Obrigatório  | Funcionalidade, Gerenciamento da conta |
| Endereço de e-mail                                    | **Sim**  | Não           | Obrigatório  | Funcionalidade, Gerenciamento da conta |
| Números de telefone                                   | **Sim**  | Não           | Obrigatório  | Funcionalidade                         |
| Endereço                                              | **Sim**  | Não           | **Opcional** | Funcionalidade                         |
| IDs do usuário                                        | **Sim**  | Não           | Obrigatório  | Funcionalidade, Gerenciamento da conta |
| Raça e etnia, convicções políticas, orientação sexual | **Não**  | —             | —            | —                                      |
| Outras informações                                    | **Não**  | —             | —            | —                                      |

Nome, e-mail e telefone vêm do cadastro (`auth.service.ts:93-96`). O endereço é
só da estética, por isso **Opcional** — cliente não informa endereço. O ID do
usuário é o `uid` do Firebase.

---

## Informações financeiras

| Tipo                                | Coletado | Compartilhado | Obrigatório | Finalidade     |
| ----------------------------------- | -------- | ------------- | ----------- | -------------- |
| Informações de pagamento do usuário | **Não**  | —             | —           | —              |
| Histórico de compras                | **Sim**  | Não           | Obrigatório | Funcionalidade |
| Pontuação de crédito                | **Não**  | —             | —           | —              |
| Outras informações financeiras      | **Não**  | —             | —           | —              |

> **Atenção, é aqui que quase todo mundo erra.** O instinto é marcar "sim" em
> informações de pagamento, porque o app tem assinatura. Mas **cartão e CPF
> nunca passam pelo DetailGo**: o checkout abre no site do Asaas e a pessoa
> digita lá. O que mandamos ao Asaas é identificador da loja, nome dela e valor
> do plano (`asaasCheckoutRequest.ts:51-54`).

Histórico de compras é "sim" porque guardamos o registro dos pagamentos da
assinatura — valor, status e data (`asaasWebhook.ts:96`).

---

## Fotos e vídeos

| Tipo   | Coletado | Compartilhado | Obrigatório  | Finalidade     |
| ------ | -------- | ------------- | ------------ | -------------- |
| Fotos  | **Sim**  | Não           | **Opcional** | Funcionalidade |
| Vídeos | **Não**  | —             | —            | —              |

Só a foto de perfil, e só se a pessoa escolher uma. Vai para o Firebase Storage
em `users/{uid}/profile.jpg`.

---

## Atividade no app

| Tipo                               | Coletado | Compartilhado | Obrigatório | Finalidade     |
| ---------------------------------- | -------- | ------------- | ----------- | -------------- |
| Interações no app                  | **Sim**  | Não           | Obrigatório | Funcionalidade |
| Histórico de pesquisa              | **Não**  | —             | —           | —              |
| Apps instalados                    | **Não**  | —             | —           | —              |
| Outro conteúdo gerado pelo usuário | **Não**  | —             | —           | —              |
| Outras ações                       | **Não**  | —             | —           | —              |

"Interações" aqui são os agendamentos: serviço escolhido, tipo e porte do
veículo, preço, data e horário (`availability.service.ts:322`). É o histórico do
atendimento, não telemetria de uso.

---

## Informações e desempenho do app

| Tipo                       | Coletado | Compartilhado | Obrigatório | Finalidade |
| -------------------------- | -------- | ------------- | ----------- | ---------- |
| Registros de falhas        | **Sim**  | Não           | Obrigatório | Análises   |
| Diagnósticos               | **Sim**  | Não           | Obrigatório | Análises   |
| Outros dados de desempenho | **Não**  | —             | —           | —          |

O Crashlytics envia relatório de falha com modelo do aparelho e versão do
sistema. E ele **associa ao identificador da conta**
(`crashlytics.service.ts:24`), o que torna o dado vinculado ao usuário — não
marque como anônimo.

---

## IDs de dispositivo ou outros

| Tipo                         | Coletado | Compartilhado | Obrigatório  | Finalidade     |
| ---------------------------- | -------- | ------------- | ------------ | -------------- |
| IDs de dispositivo ou outros | **Sim**  | Não           | **Opcional** | Funcionalidade |

O token de notificação (`fcmTokens` em `users/{uid}`, `push.service.ts:35`)
identifica o aparelho. **Opcional** porque quem recusa a permissão de
notificação continua usando o app.

---

## Tudo que é "Não"

Para não hesitar ao percorrer a lista: **mensagens, arquivos de áudio,
arquivos e documentos, calendário, contatos, histórico de navegação, saúde e
condicionamento físico** — nada disso é coletado. O app não pede nenhuma dessas
permissões (confira em `AndroidManifest.xml`: só `INTERNET`, localização,
`POST_NOTIFICATIONS` e leitura de imagens).

E **nenhum dado é coletado para publicidade ou marketing**. O app não tem
anúncios, não tem SDK de anúncio e não vende dado.

---

## Por que "Compartilhado: Não" em tudo

Os dados vão para Google (Firebase, Maps, Crashlytics) e Asaas. Nenhum conta
como compartilhamento pela definição do Google, porque processam **em seu
nome**, como prestadores de serviço, e não para uso próprio.

> **Ponto de atenção honesto.** O nome e o endereço da estética ficam visíveis
> para outros usuários dentro do app — é o que faz o mapa funcionar. Isso é
> funcionalidade, não transferência para terceiro, e por isso não entra como
> "compartilhado". Mas é a resposta menos óbvia desta folha: se a revisão
> questionar, a justificativa é essa, e ela está escrita na política de
> privacidade.

---

## Práticas de segurança

| Pergunta                                      | Resposta          |
| --------------------------------------------- | ----------------- |
| Dados criptografados em trânsito              | **Sim**           |
| Usuário pode pedir exclusão dos dados         | **Sim**           |
| Passou por revisão de segurança independente  | **Não**           |
| Segue a Política para Famílias do Google Play | **Não se aplica** |

O app é para maiores de 18 que contratam ou prestam serviço automotivo, então
não é direcionado a crianças.

---

## Antes de enviar

- [ ] A política em <https://detailgo.com.br/privacidade/> está no ar e abre
- [ ] A URL de exclusão em <https://detailgo.com.br/excluir-conta/> está no ar
- [ ] O e-mail de contato da política **recebe mensagem de verdade** — mande uma
      e confirme, não confie no painel do provedor
- [ ] Esta folha bate com o código de hoje

> O último item não é formalidade. O site publicou por meses um endereço de
> contato num domínio que nem era nosso e que recusava e-mail por definição.
> Ninguém percebeu porque ninguém testou.
