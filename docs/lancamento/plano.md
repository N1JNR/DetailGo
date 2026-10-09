# Plano de lançamento do DetailGo

Escopo: lançar Android e iOS, nessa ordem, com iOS por último.

Estado em 09/10/2026: 926 testes verdes, cobertura 82,8% statements · 74,0%
branches, TypeScript estrito e lint limpos. Pagamento Asaas validado ponta a
ponta em sandbox. Esteira em ~1min35s na maioria das PRs. `npm audit` sem
nenhuma vulnerabilidade crítica, no app e nas Cloud Functions.

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

Estado em 09/10/2026: 926 testes, 82,8% statements · 74,0% branches.

| Área            | Cobertura | Por que primeiro                                             |
| --------------- | --------- | ------------------------------------------------------------ |
| `profile`       | 0%        | 229 statements num só arquivo, sem nenhuma proteção          |
| `notifications` | 33%       | push é o que mais custa depurar depois de publicado          |
| `shops`         | 52%       | o que falta é contexto e tela — os serviços já estão em 100% |
| `settings`      | 70%       | horário de funcionamento; erra e a agenda aceita fora dele   |

- [x] `subscription` — estados de assinatura, carência, cancelamento. Serviços
      e as duas telas em 100%, 12 de 12 mutantes mortos na tela de pagamento
- [ ] `profile/screens/ProfileScreen.tsx` — 229 statements
- [ ] `notifications` — registro de token, recebimento em foreground, navegação
      ao tocar
- [ ] `shops/context/ShopContext.tsx` — 45 statements; é ele que resolve em que
      loja a sessão está, a fronteira multi-tenant no lado da interface
- [ ] `settings/services/shopSettings.service.ts`
- [ ] Decidir sobre Proguard/minify no release (hoje desligado)

> **O isolamento entre lojas já tem prova.** `shops/services` e `shops/hooks`
> estão em 100%, e é ali que vivem as consultas com `shopId`. O que falta em
> `shops` são `ShopContext`, `ShopProfileScreen` e os ícones de serviço.

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
