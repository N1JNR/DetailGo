# Security Memory

> Criado pelo security-skill; preenchido à mão com o estado real do DetailGo.
> Não apagar — é o registro de estado de segurança entre sessões.
> Última atualização: 2026-10-15

## Project Profile

- detected_stacks: [react-native-0.81, typescript, firebase-functions-v2, node-20]
- deployment_platforms: [firebase, google-cloud, play-store (ainda não publicado)]
- databases: [firestore, firebase-storage]
- has_ai_features: false
- compliance_mode: none # LGPD aplicável na prática; ver riscos abaixo
- environment: dev # Asaas em sandbox; app ainda não publicado

## User Preferences

- ask_before_modify: true
- ask_before_design_change: true
- language: pt-BR
- report_format: chat
- rotation_reminder_days: 90

## Security Score History

| Data       | Críticas         | Altas            | Notas                                                                        |
| ---------- | ---------------- | ---------------- | ---------------------------------------------------------------------------- |
| 2026-09-02 | -                | 1 MÉDIA, 1 BAIXA | Auditoria do agente: geocodificação aberta, lat/lng sem validação            |
| 2026-10-14 | -                | -                | Auditoria do agente (#158)                                                   |
| 2026-10-15 | 1 ALTA, 2 MÉDIAS | —                | Revisão manual das Cloud Functions inteiras; as três corrigidas no mesmo dia |

## Achados corrigidos

### 2026-10-15 — ALTA: cancelar a assinatura de outra estética

`shopOwnerGuard` provava que o DOCUMENTO era do chamador, e então usava o
`asaasSubscriptionId` de dentro dele. O campo era gravável pelo dono, e
`shops/{shopId}` era de leitura pública — bastava ler o id da vítima, gravar no
próprio documento e chamar `cancelAsaasSubscription`.
**Correção:** vínculo movido para `shopBilling/{shopId}`, fechado dos dois lados
nas regras; validação de formato do `shopId` antes de montar caminho.

### 2026-10-15 — MÉDIA: documento da loja público

`allow read: if true` em `shops/{shopId}`. Regra do Firestore não esconde campo,
então identificadores de cobrança e histórico de pagamento de todas as estéticas
eram legíveis sem login.
**Correção:** `allow read: if isSignedIn()` — o mapa já fica atrás do login.

### 2026-10-15 — MÉDIA: plano pago liberado pelo próprio dono

`computeSubscription` lê `subscriptionStatus` e `activeUntil` do documento da
loja, e as regras deixavam o dono escrever qualquer campo. Um `update` dava
plano pago vitalício. O trial também: `trialEndsAt` sem teto no cadastro.
**Correção:** lista branca no `update` barrando os campos de cobrança, e janela
de 8 dias para o `trialEndsAt` no `create`.

### 2026-09 — MÉDIA: geocodificação aberta

Teto de 40 chamadas por IP por dia, com o IP guardado só como hash do dia.
Exigir login quebraria o cadastro: as funções são chamadas antes da conta
existir.

## Accepted Risks

accepted_risks:

- risk: Paywall validado só no cliente; as regras não consultam assinatura
  para liberar escrita em appointments/services.
  reason: Fechar exige redesenho das regras e é trabalho maior que o
  lançamento comporta agora. Os campos que decidem o acesso já estão fora
  do alcance do cliente, então o caminho fácil está fechado.
  accepted_on: 2026-10-15
  revisar_em: antes do beta aberto

- risk: braces 3.0.3 e node-forge 1.4.0 continuam com advisory aberta.
  reason: São as últimas versões publicadas; não existe correção upstream.
  Ambas são DoS/assinatura em cadeia de ferramenta de desenvolvimento.
  accepted_on: 2026-10-15

- risk: image-size travado na 1.x com advisory aberta.
  reason: O Metro exige a API da versão 1; subir para 2.x quebra o
  empacotamento de release — já aconteceu e o CI não pegou, porque a build
  de debug não empacota JavaScript.
  accepted_on: 2026-10-09

- risk: App Check não habilitado.
  reason: Depende da SHA-1 que o Play App Signing gera, que só sai depois do
  primeiro envio ao Console.
  accepted_on: 2026-10-07
  revisar_em: depois do primeiro upload na Play Console

## Never Ask Again

never_ask_again: []

## Custom Rules

custom_rules:

- IGNORE: shops/{shopId} legível por qualquer logado (o mapa precisa)
- NOTA: toda alteração em functions/ ou firestore.rules pede revisão de
  segurança antes do merge; PR só de teste não precisa

## Secrets Lifecycle

secrets:
ASAAS*API_KEY:
local: Google Secret Manager (projeto magic-auto)
status: sandbox — trocar por $aact_prod* antes do lançamento
ASAAS_WEBHOOK_TOKEN:
local: Google Secret Manager
status: sandbox — recriar o webhook na conta real
GOOGLE_GEOCODING_KEY:
local: Google Secret Manager
status: ok
GOOGLE_MAPS_API_KEY:
local: android/secrets.properties (fora do git)
status: ok — restrita por SHA-1; falta cadastrar a do Play App Signing
teste-descartavel:
local: Google Cloud API Keys
status: APAGAR quando os testes terminarem

## Pendências de segurança

- [ ] Apagar a chave `teste-descartavel`
- [ ] Cadastrar a SHA-1 do Play App Signing (Maps e Firebase) após o 1º envio
- [ ] Habilitar App Check depois disso
- [ ] Teto diário de cota do Geocoding no projeto
- [ ] Guardar `android/app/upload.keystore` e `secrets.properties` fora da máquina
- [ ] Trocar Asaas para produção (chave + webhook + token)

## Incident History

- none
