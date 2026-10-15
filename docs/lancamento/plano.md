# Plano de lançamento do DetailGo

Escopo: lançar Android e iOS, nessa ordem, com iOS por último.

Estado em 15/10/2026: 1140 testes do app, 122 das Cloud Functions e 60 das
regras do Firestore no emulador. Cobertura 96,1% statements · 86,4% branches.
TypeScript estrito e lint limpos. `npm audit` sem nenhuma crítica nas duas
pontas. Pagamento Asaas validado ponta a ponta em sandbox. Esteira em ~1min35s
na maioria das PRs.

> **Vulnerabilidade crítica volta sozinha.** Em 09/10 o `npm audit` ficou sem
> nenhuma crítica nas duas pontas; em 15/10 havia uma de novo, sem ninguém
> mexer em nada — advisories novas do `handlebars` publicadas no meio. Medir
> contra um número anotado dias antes dá conclusão errada: a comparação só vale
> se as duas pontas forem medidas no mesmo dia.

Este arquivo é a fonte de verdade do progresso. Cada item fechado é marcado
aqui, no mesmo PR que o resolve.

---

## Bloco 0 — Fechar o que está aberto

Nove PRs do agente autônomo parados, com duplicação entre eles. Enquanto não
forem mergeados, cada rodada semanal refaz o mesmo trabalho.

- [x] Mergear #146 (dependências, superset de #140 e #143) e fechar os outros dois
- [x] Mergear #141, #144 e #147 (testes, arquivos distintos entre si)
- [x] Mergear #148 (auditoria) e fechar #142 e #145
- [x] Rodada de 07/10: #153 e #154 (testes e auditoria) e #150 (dependências)

---

## Bloco 1 — Publicabilidade Android

O bloco que, se ficar para o fim, custa o lançamento.

### 1.1 Assinatura

Hoje o `buildType release` usa `signingConfigs.debug`. A Play Store rejeita APK
assinado com chave de debug.

- [x] Gerar keystore de **upload** (não de assinatura final — ver nota abaixo)
- [x] Configurar `signingConfigs.release` lendo senha de `secrets.properties`
- [x] Trocar o `release` para usar `signingConfigs.release`
- [x] Passar a gerar **AAB** além de APK — `build-apk.ps1 -Bundle`
- [ ] Guardar a keystore e a senha em lugar seguro, fora da máquina

> **Play App Signing.** O Google passa a guardar a chave de assinatura final; o
> desenvolvedor guarda só a chave de _upload_. Isso importa porque perder a
> chave de upload é recuperável (o Google reseta), e perder a de assinatura
> final não seria. Por isso a keystore gerada é de upload.
>
> A keystore é `android/app/upload.keystore` e a senha está em
> `android/secrets.properties`. **Os dois são ignorados pelo git**, então não
> existe cópia no servidor: se a máquina morrer, some com eles. Guardar fora
> daqui é o único item deste bloco que depende de você.

> **Trocar a assinatura obriga a desinstalar o app.** O Android recusa instalar
> por cima quando a chave muda. Em quem já tem a versão antiga — aparelho de
> teste, estética piloto — é desinstalar e instalar de novo, perdendo o estado
> local e a sessão. Dado nenhum se perde, porque tudo vive no Firestore.

### 1.2 A armadilha encadeada do Maps

> **Validado em 02/10/2026.** APK assinado com a keystore de upload instalado no
> aparelho e mapa aberto: `MapsInitializer: preferredRenderer: LATEST` dentro do
> processo do app, sem nenhuma `Authorization failure`. A troca de assinatura
> não quebrou o mapa.
>
> Confirmado de quebra que instalar por cima falha com
> `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — quem já tem a versão antiga precisa
> desinstalar antes.

A chave do Google Maps está restrita à SHA-1 `21bfa7de...`, que é a da
`debug.keystore`. Ao trocar a assinatura, o fingerprint muda e **o mapa para de
funcionar em produção** se a nova SHA-1 não for cadastrada antes.

- [x] Cadastrar a SHA-1 da keystore de upload na chave do Maps
- [ ] Cadastrar também a SHA-1 que o **Play App Signing** gera (sai no Console
      depois do primeiro envio) — são duas, e esquecer a segunda quebra o mapa
      só na versão publicada, não na que você testa localmente
- [x] Cadastrar as mesmas SHA-1 no Firebase (o app `com.jnrpalma.detailgo` não
      tinha nenhuma cadastrada)

### 1.3 Play Console

- [ ] Conta de desenvolvedor criada e taxa paga
- [ ] Ficha da loja: nome, descrição curta e longa, ícone, capturas de tela
- [ ] Classificação indicativa
- [ ] **Política de privacidade** publicada numa URL acessível — obrigatória
- [ ] Formulário de Segurança de Dados: declarar localização, dados de
      pagamento, identificadores e dados de conta
- [ ] Faixa de **teste interno** com o AAB assinado

> O teste interno não é formalidade: é o que valida a cadeia
> assinatura → Play App Signing → Maps com o app realmente distribuído, antes
> de qualquer usuário real. É onde o problema da SHA-1 aparece se aparecer.

---

## Bloco 2 — Dinheiro e segurança

### 2.0 Isolamento entre estéticas

Revisão manual das Cloud Functions inteiras em 15/10, depois que a revisão por
diff voltou vazia — ela só olha o que mudou, e estas três eram de desenho.

- [x] `asaasSubscriptionId` fora do documento gravável pelo cliente
- [x] `shops/{shopId}` deixa de ser legível sem login
- [x] Campos que decidem acesso pago travados contra escrita do dono
- [x] `shopId` validado antes de virar caminho de documento

> **O que estava aberto.** A função de cancelamento conferia que o _documento_
> era de quem chamou, e então usava o `asaasSubscriptionId` de dentro dele — um
> campo que o dono podia escrever. Como `shops` era de leitura pública, dava
> para ler o id da vítima, gravar no próprio documento e **cancelar a assinatura
> dela**. Junto disso, `subscriptionStatus` e `activeUntil` também eram
> graváveis: um `update` dava plano pago vitalício, e o `trialEndsAt` não tinha
> teto no cadastro.
>
> Provar que o documento é seu não prova que o conteúdo dele é seu. O vínculo
> com o Asaas passou para `shopBilling/{shopId}`, que as regras fecham dos dois
> lados — só o Admin SDK escreve.
>
> **Migração:** estéticas que assinaram antes desta mudança têm o id no
> documento antigo e vão aparecer sem assinatura até o próximo pagamento
> confirmado recriar o vínculo. Em sandbox isso não custa nada; se houvesse
> conta real, seria preciso copiar o campo antes de publicar.

> **O paywall continua sendo validado no cliente.** As regras liberam escrita
> por `isShopOwner`, nunca por assinatura — então quem mexer na API alcança a
> agenda sem pagar. Fechar isso é redesenho das regras, registrado em
> `memory-security.md` como risco aceito até o beta aberto. O que esta mudança
> fez foi tirar o caminho fácil.

### 2.1 Asaas em produção

- [ ] Trocar o segredo `ASAAS_API_KEY` para a chave `$aact_prod_`
- [ ] Recriar o webhook na conta real, com token novo em `ASAAS_WEBHOOK_TOKEN`
- [ ] Validar um pagamento real de ponta a ponta

> O código já deriva o ambiente do prefixo da chave (`resolveAsaasConfig`), então
> não há código a mudar — só os dois segredos e o webhook.

### 2.2 Geocodificação exposta

Achado MÉDIO da auditoria de 02/09.

- [x] Teto de 40 chamadas por IP por dia em `geocode` e `reverseGeocode`
- [x] Validar intervalo de lat/lng em `reverseGeocode` (achado BAIXO)
- [ ] Definir teto diário de cota do Geocoding no projeto
- [ ] Apagar a chave `teste-descartavel` quando os testes terminarem

> **Exigir login aqui não dá.** A primeira versão do plano dizia "exigir Firebase
> ID Token", e isso quebraria o cadastro: as duas funções são chamadas na tela de
> registro, antes de a conta existir. O que entrou foi um teto por IP, com o
> endereço guardado só como hash do dia — um cadastro real faz menos de dez
> chamadas, então 40 corta o abuso automatizado sem atrapalhar ninguém. Se o
> contador falhar, a chamada passa: derrubar cadastro por causa de um soluço no
> contador troca um problema de custo por um de receita.

---

## Bloco 3 — Risco técnico

A média esconde onde estão os buracos. Ordem abaixo é a ordem do estrago, não
a do tamanho.

Estado em 15/10/2026: 1140 testes, 96,1% statements · 86,4% branches · 95,2%
funções · 97,3% linhas. Piso do ratchet em 95/85/94/96.

**Nenhuma área abaixo de 96%. Bloco fechado** — inclusive a decisão de
Proguard/minify, registrada no fim desta seção.

| Área            | Início | Hoje |         |
| --------------- | ------ | ---- | ------- |
| `profile`       | 0%     | 97%  | fechado |
| `notifications` | 10%    | 98%  | fechado |
| `shops`         | 41%    | 99%  | fechado |
| `subscription`  | 67%    | 99%  | fechado |
| `settings`      | 70%    | 100% | fechado |

- [x] `subscription` — estados de assinatura, carência, cancelamento. Serviços
      e as duas telas em 100%, 12 de 12 mutantes mortos na tela de pagamento
- [x] `profile/screens/ProfileScreen.tsx` — 0% para 97%, 63 casos, 23 de 23
      mutantes mortos
- [x] `notifications` — registro de token, recebimento em foreground, navegação
      ao tocar (PR #157 do agente)
- [x] `shops/context/ShopContext.tsx` — a fronteira multi-tenant na interface.
      11 de 11 mutantes mortos depois de reforçar o spec do agente
- [x] `settings/services/shopSettings.service.ts` — 70% para **100%** nas quatro
      métricas, 44 casos, 17 de 17 mutantes mortos. Achou dois defeitos: lista
      de dias só com lixo virava zero dias de trabalho, e `workingDays` com
      tipo torto derrubava a leitura inteira das configurações
- [x] `notifications/components/NotificationsScreenView.tsx` — as faixas de
      tempo relativo, com teste nas duas bordas de cada uma (59min/60min,
      23h/24h, 6d/7d)
- [x] `shops/screens/ShopProfileScreen.tsx` — 0% para 98%, 23 casos
- [x] `shops/utils/shopServiceIcons.ts` — 100%. Registrado no spec que `polish`
      e `default` apontam para o mesmo ícone, então nenhum teste separa os
      dois; dar ícone próprio ao polimento é decisão de produto
- [x] Decidir sobre Proguard/minify no release — **adiado conscientemente**,
      ver abaixo

> **O que sobra não é por área, é disperso.** Os maiores restos são 23
> statements no `AdminManageScreen` e 6 no `ProfileScreen` — ramos defensivos e
> caminhos que a interface não alcança. Perseguir os últimos pontos daqui para
> a frente dá número, não segurança.

### Decisão: Proguard/minify fica desligado no lançamento

Decidido em 15/10/2026. `enableProguardInReleaseBuilds = false` em
`android/app/build.gradle`, e o `proguard-rules.pro` está vazio — só
comentários.

**O que se ganha.** O R8 encolhe, ofusca e otimiza a camada **Java/Kotlin**. No
React Native quase toda a lógica é JavaScript, que vai no bundle Hermes e o R8
não toca — então ele só mexe no React Native em si, nos SDKs do Firebase e nas
bibliotecas nativas. O APK tem 76,8 MB; a economia realista fica entre 5 e
15 MB, e menos ainda no AAB, porque a Play já entrega só a ABI de cada
aparelho. Ofuscação aqui vale pouco: não há segredo no código nativo — as
chaves estão no Secret Manager e a lógica de negócio está no JavaScript.

**O que se arrisca.** O R8 remove o que _parece_ não ser usado, e tudo que é
alcançado por reflexão parece não ser usado. Firebase e React Native usam
reflexão para registrar módulos e desserializar documentos. Sem regras de
`keep` — e o arquivo está vazio — isso quebra.

**Por que adiar e não só "fazer com cuidado".** O modo de falhar é compilar,
passar no CI e quebrar **só na build de release, em runtime, numa tela
específica**. E o CI roda `assembleDebug` (ci.yml:350), então não existe nada
entre o R8 e a Play Store. É o mesmo padrão que já nos mordeu: o override do
`image-size` para 2.x quebrou todas as builds de release e passou verde,
porque a build de debug não empacota JavaScript.

**Quando revisitar.** Depois da faixa de teste interno funcionando — aí existe
um AAB real sendo instalado e exercitado antes de ir para produção, que é
exatamente a rede que falta hoje. O caminho seguro então: ligar, gerar o AAB,
instalar no aparelho e abrir **todas** as telas na mão. Mapa, agendamento,
pagamento, relatórios, perfil e notificações — toda tela que usa Firebase ou
biblioteca nativa é candidata a quebrar.

**Custo de adiar:** um APK maior do que precisava. Não bloqueia lançamento.

> **Cobertura alta não é teste bom.** O `ProfileScreen` chegou a 95% de linhas
> com 5 mutantes vivos: validava o nome mas não o sobrenome, aceitava telefone
> de 9 dígitos, regravava máscara em telefone legado e comparava e-mail sem
> normalizar os dois lados. Nenhum apareceu no relatório de cobertura — todos
> apareceram ao quebrar o código de propósito.

> **O isolamento entre lojas tem prova nos dois lados.** No cliente,
> `shops/services`, `shops/hooks` e o `ShopContext` — onde vivem as consultas
> com `shopId` e a resolução de qual loja é a sessão. No servidor, os 60 casos
> de `firestore.rules` no emulador. O que falta em `shops` é tela e ícones.

> **Teste de regra também pode ser vazio.** Ao cobrir a trava dos campos de
> cobrança, dois casos passaram sem significar nada: `affectedKeys()` só lista
> campo cujo **valor mudou**, e a semente já tinha o valor que o teste gravava.
> Escrita sem efeito, diff vazio, regra aprova. Só apareceu porque os mutantes
> das regras foram rodados — a cobertura não mostra isso.

---

## Bloco 4 — Beta fechado Android

- [ ] Duas ou três estéticas reais usando de verdade
- [ ] Crashlytics monitorado por uma semana sem crash novo
- [ ] Ajustes do que o beta revelar

---

## Bloco 5 — iOS

Praticamente um segundo projeto. Hoje existe um `Podfile` sem `Podfile.lock` e o
projeto Xcode ainda se chama `testapp`.

- [ ] Renomear o projeto Xcode de `testapp` para DetailGo
- [ ] `pod install` e primeiro build local
- [ ] App iOS no Firebase + `GoogleService-Info.plist`
- [ ] APNs: certificado/chave de push no Firebase
- [ ] Chave do Maps para iOS, restrita ao bundle id
- [ ] Permissões no `Info.plist` com textos em português (localização, câmera,
      fotos, notificações)
- [ ] `PrivacyInfo.xcprivacy` revisado com o que o app realmente coleta
- [ ] Conta Apple Developer e App Store Connect
- [ ] Build assinada e TestFlight
- [ ] Revisão da App Store

> A revisão da Apple costuma ser o item mais imprevisível do cronograma. Entrar
> no TestFlight cedo, mesmo com o app incompleto, antecipa a descoberta de
> problemas de permissão e de política.

---

## Fora de escopo, registrado

- **Contas duplicadas:** a mesma pessoa com dois cadastros conta como dois
  clientes nos relatórios. Só casar por telefone ou documento resolve, e é
  decisão de produto.
- **`image-size` vulnerável:** preso na 1.2.1 porque o Metro exige a API da
  versão 1. A correção existe na 2.0.3+, que quebra o empacotador. Revisitar
  quando o React Native subir a versão do Metro.
- **Massa de teste:** 46 agendamentos com id `teste-` e campo `seedDeTeste`
  no Firestore de produção, a limpar antes do beta.
