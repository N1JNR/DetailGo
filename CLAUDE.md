# DetailGo

Aplicativo mobile de agendamentos para estéticas/barbearias. Plataforma SaaS multi-tenant onde cada estabelecimento é um `shop` independente.

> **Veja também [AGENTS.md](AGENTS.md)** — regras canônicas do repositório, lidas
> por qualquer agente de código (Jules, Codex, Claude). Em caso de divergência
> entre os dois arquivos, o `AGENTS.md` prevalece; ajuste-o lá.

## Stack

- **React Native** + Expo (mobile)
- **Firebase** — Firestore (banco), Auth, Cloud Functions
- **TypeScript** (strict)
- **React Navigation** — Native Stack
- **MercadoPago** — pagamento via Pix
- **Lucide React Native** — ícones

## Arquitetura

### Multi-tenant

- Cada estabelecimento é um documento em `shops/{shopId}`
- **Toda query no Firestore deve ser filtrada por `shopId`** — nunca buscar dados sem escopo de shop
- Owner cria o shop no cadastro e aparece no mapa quando a assinatura/trial permite
- Customer encontra a estética pelo mapa e agenda diretamente no shop escolhido

### Roles

```
UserRole = 'owner' | 'customer'
```

- `owner` → acessa painel admin (AdminDashboard, AdminManage, AdminHistory)
- `customer` → acessa painel de agendamentos (Dashboard, Appointment, MyAppointments, History)
- Verificação via `isOwner()` / `isCustomer()` de `@features/auth/utils/roles.ts`

### Subscription (owner)

- Trial: 14 dias gratuitos após cadastro (`trialEndsAt`)
- Pago: geração de Pix via Cloud Function `createPixCharge`
- `isSubscriptionActive` controlado pelo `ShopContext`
- Owner sem assinatura ativa → redirecionado para `SubscriptionScreen`
- Preço atual: R$ 89,00/mês (em DEV está R$ 0,01 — alterar antes do lançamento)

## Estrutura de Pastas

```
src/
  app/              → tipos globais (RootStackParamList)
  navigation/       → RootNavigator
  features/
    auth/           → login, registro, AuthContext, roles
    shops/          → ShopContext, shop.service, shopServices.service, discoverShops.service
    appointments/   → agendamentos (customer)
    admin/          → painel do owner
    dashboard/      → tela inicial do customer
    profile/        → perfil do usuário
    settings/       → configurações do shop (owner)
    subscription/   → tela de assinatura (owner)
  shared/
    components/     → componentes reutilizáveis (Input, SelectModal, SplashScreen)
    constants/      → app.constants (UI tokens)
    hooks/          → useFirestoreCache, useForm
    theme/          → colors, typography, spacing, radii, borders, surfaces
    utils/          → firebase.utils, date.utils, format.utils, string.utils, validation.utils
functions/
  src/
    index.ts        → entry point das Cloud Functions
    payment/        → createPixCharge, mercadoPagoWebhook
```

## Convenções de Código

### Estrutura por feature

Cada feature segue o padrão:

```
features/{nome}/
  components/   → componentes visuais da feature
  context/      → contextos React (se houver)
  data/         → repositórios e normalizers do Firestore
  domain/       → types, constants, helpers, pricing, rules
  hooks/        → hooks customizados
  screens/      → telas navegáveis
  services/     → lógica de negócio / acesso ao Firestore
  utils/        → utilitários específicos da feature
  index.ts      → exports públicos da feature
```

### Imports com alias

```ts
@app/        → src/app/
@features/   → src/features/
@shared/     → src/shared/
```

### Serviços e Firestore

- **Nunca acessar Firestore diretamente nas screens** — sempre via service
- Services retornam `{ ok: true, data }` ou `{ ok: false, message, code? }`
- Normalizers ficam em `data/*.normalizers.ts` — convertem documentos Firestore em tipos TypeScript

### Tema

```ts
import { useAppTheme } from '@shared/theme';
const { colors: D, isLight } = useAppTheme();
```

- Usar sempre `D.primary`, `D.bg`, `D.text`, etc — nunca cores hardcoded
- Estilos criados com `useMemo(() => createStyles(D), [D])` para reagir ao tema

### Identidade visual (decisão fechada)

A identidade é **"Garage Dark"**: escuro, neon amarelo-verde (`#D4FF3D`),
acento laranja (`#FF5C39`), pegada industrial/automotiva. É proposital e
coesa — **não migrar** para outro estilo (claymorphism, pastel, etc. destoam).

- **Se for evoluir o visual, o caminho é neon glow COM PARCIMÔNIA** — brilho
  sutil só nos elementos-chave (CTA primário, status "em andamento", chip de
  filtro ativo), feito com `linear-gradient` + `box-shadow`/`Animated` (sem lib
  nova). Glow em tudo cansa e vira cara de "AI-generated".
- **Não adicionar** libs pesadas de efeito/animação (Reanimated, Moti, Skia) —
  risco de compatibilidade com RN 0.81 / React 19. Blur (glassmorphism) só se
  muito necessário, via `@react-native-community/blur`.
- Refino visual é **polimento, não bloqueador** — priorizar testes/lançamento.

## Coleções Firestore

```
shops/{shopId}
  settings/config          → ShopSettings (openHour, closeHour, slotStepMin, parallelCapacity)
  appointments/{appointmentId}  → agendamentos globais do shop
  services/{serviceId}     → serviços oferecidos

users/{uid}
  appointments/{id}        → subcoleção de agendamentos do customer (para listagem rápida)
```

## Status de Agendamento

```ts
AppointmentStatus = 'scheduled' | 'in_progress' | 'done' | 'cancelled' | 'no_show';
```

- `scheduled` → agendado, aguardando
- `in_progress` → em atendimento
- `done` → concluído
- `cancelled` → cancelado pelo cliente
- `no_show` → cliente não compareceu

## Configurações Padrão do Shop

```ts
openHour: 8;
closeHour: 18;
slotStepMin: 30; // slots de 30 minutos
parallelCapacity: 2; // atendimentos simultâneos
```

## Navegação (RootNavigator)

```
Não logado       → Login, Register
Owner + trial/ativo → AdminDashboard, AdminManage, AdminHistory, AdminProfile
Owner + sem assinatura → Subscription
Customer        → Dashboard, Appointment, MyAppointments, History, Profile
```

## Regras de Negócio Importantes

- Agendamento só pode ser cancelado se ainda não expirou (`startAtMs > now`)
- `no_show` tem grace period (`NO_SHOW_GRACE_MS`) antes de ser marcado automaticamente
- Customer pode reagendar após `no_show`
- Slots de disponibilidade calculados por `availability.service.ts` respeitando `parallelCapacity`
- Preço do serviço vem de `appointment.pricing.ts`

## Cloud Functions

- `createPixCharge` — gera cobrança Pix via MercadoPago (requer `idToken` no header)
- `mercadoPagoWebhook` — webhook para confirmar pagamento e ativar assinatura
- URL base: `https://us-central1-magic-auto.cloudfunctions.net/`

## Mensagens e UI

- Mensagens de erro e UI **sempre em português**
- Textos de validação e alertas em português
- Datas no formato brasileiro (`dd/MM/yyyy`, `HH:mm`)

## Testes

Stack: **Jest** + **@testing-library/react-native** (RNTL). Coverage via Istanbul.

> **Definição de pronto:** toda feature ou alteração com lógica nova entrega
> **teste unitário junto**, sempre que houver comportamento a proteger (regra de
> negócio, validação, cálculo, fluxo). Não é etapa separada — faz parte da
> entrega. Cosmético/ambiental não conta (ver a filosofia abaixo).

- **Arquivo `.spec.tsx` colocado ao lado do componente** (ex.:
  `LoginScreen.spec.tsx` na mesma pasta da tela) — estilo `.spec.ts` do Angular.
- **`jest.setup.js`** mocka os módulos nativos globais (AsyncStorage, safe-area,
  linear-gradient, lucide, bootsplash). Cada teste mocka só o que é específico
  dele (services, `useNavigation`, hooks de feature).
- **`testID`** em elementos sem texto estável (toggles, botões de ícone) — padrão
  de testabilidade, não afeta produção.
- **Comandos:** `npm test` (roda tudo), `test:watch` (modo watch), `test:cov`
  (cobertura do **projeto inteiro** no terminal + HTML em `coverage/index.html`),
  `test:ui` (cobertura + abre o HTML no navegador), `test:rules` (regras).
- **Ratchet de cobertura:** o `jest.config.js` tem `coverageThreshold` global —
  o CI roda o `test:cov` e **falha se a cobertura regredir** abaixo do piso. Só
  sobe: ao adicionar testes, **suba os números** do threshold. É como garantimos
  que o projeto nunca perde cobertura.

### Padrões e pegadinhas dos specs (aprendidos na prática)

- **Mock do feedback:** telas que usam `useFeedback` (modais de erro/sucesso)
  precisam mockar `@shared/components/FeedbackProvider` no spec, senão o hook
  lança fora do provider:
  ```ts
  jest.mock('@shared/components/FeedbackProvider', () => ({
    useFeedback: () => ({ showError: jest.fn(), showSuccess: jest.fn(), showConfirm: jest.fn() }),
  }));
  ```
  Asserta o comportamento em cima desses mocks (ex.: `showError` chamado com a
  mensagem certa) em vez do antigo `Alert.alert`.
- **Mocks padrão da tela:** `@features/auth` (`useAuth`), `@react-navigation/native`
  (`useNavigation`) e os nativos usados no import (ex.:
  `@react-native-community/geolocation`). O tema (`useAppTheme`) NÃO precisa de
  mock — o zustand devolve o tema default.
- **`testID` quando o texto duplica:** se o mesmo texto aparece no header e no
  botão (ex.: "Criar conta"), `getByText` quebra por ambiguidade — ponha um
  `testID` no botão (`register-submit`) e use `getByTestId`.
- **`clearAllMocks` NÃO limpa a fila do `mockResolvedValueOnce`.** Um valor
  enfileirado e não consumido (ex.: teste que bloqueia antes de chamar o service)
  vaza pro próximo teste e desalinha a fila. Use `mock.mockReset()` no
  `beforeEach` do mock que usa `...Once`.

### Testes das `firestore.rules`

- Suíte separada em `firestore-tests/*.test.js` (JS puro, ambiente Node) com
  `@firebase/rules-unit-testing` — sobe o emulador do Firestore e prova o modelo
  multi-tenant (cliente/dono não escreve em shop de outro) e o corte de
  cancelamento (só antes do horário).
- Rodar: `npm run test:rules` (dispara `firebase emulators:exec`).
- **Requer Java 21+** (firebase-tools 15+). Se o `java` do PATH for 17 (o do
  Gradle), aponte o JBR do Android Studio: `JAVA_HOME` para
  `.../Android Studio/jbr`.
- Roda isolado do jest do app (o `jest.config.js` ignora `firestore-tests/`) e
  tem job próprio no CI (`Testes das regras Firestore`).

### Filosofia — o que testar (IMPORTANTE)

- **Testar COMPORTAMENTO/lógica:** render dos campos, validações, ações (chama o
  service certo com os args certos), navegação, feedback (alertas), estados
  (mostrar/ocultar senha, touched/blur).
- **NÃO perseguir cosmético/ambiental:** variação de tema claro/escuro,
  `Platform.OS`, cor exata de borda, spinner de loading. Testar estilo é frágil e
  não protege regra.
- **Coverage é um mapa, não uma meta.** Ele mostra o buraco; você decide se é
  comportamento (cobre) ou cosmético (ignora). **Não caçar 100%** — uma tela com a
  lógica coberta (~90%+ de linhas) já é saúde de sobra.

## Fluxo de trabalho (Git / entrega)

Ler estas regras ANTES de começar qualquer entrega.

- **Sempre branchar da `main` atualizada** (`git checkout main && git pull`),
  nunca commitar direto na main. Nome da branch: `jnrp/<descritivo>`.
- **Validar antes de commitar:** `tsc --noEmit`, `eslint`, `prettier --check`,
  `jest` — tudo verde.
- Mudança de UI → **gerar o APK e instalar no aparelho** para validar visual antes
  do commit.
- **1 commit por feature** — se surgirem vários, dar squash para 1 só antes do
  push final.
- **Commitlint (husky no `commit-msg`):**
  - Formato `type(scope): subject` — **scope é obrigatório**.
  - **subject em minúsculo** (sem camelCase/PascalCase — `SectionList`,
    `useNowTick`, `FCM` etc. são rejeitados).
  - Corpo com **linhas ≤ 72 caracteres**.
  - **type** só: `build, docs, feat, fix, perf, refactor, test`.
  - Terminar com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Renovate:** o núcleo React/RN e o toolchain `@react-native/*` são travados
  (upgrade manual/planejado, em conjunto); o resto atualiza sozinho.

## Releases

A `main` é **protegida** — release entra por **branch → PR → merge → tag**
(nunca commit/tag direto na main). Ferramenta: `standard-version` (config em
`.versionrc.js`, que mapeia os tipos pro `CHANGELOG.md`).

**Versão (semver):** houve `feat(` desde a última tag → **minor**; só `fix`/
`build`/`docs` → **patch**. Conferir com `git log <ultima-tag>..main --oneline`.

**Passo a passo:**

1. Branch `jnrp/release-vX.Y.Z` a partir da main atualizada.
2. Bump + changelog **sem commitar** (controlamos o commit):
   `npx standard-version --release-as <minor|patch> --skip.commit --skip.tag`
   → atualiza `package.json`, `package-lock.json` e `CHANGELOG.md`.
3. **Bump manual do Android** (o standard-version NÃO mexe no gradle):
   em `android/app/build.gradle`, subir `versionName` (igual ao package.json) e
   `versionCode` (+1). **Esquecer isso = APK com versão errada.**
4. **1 commit** `build(release): X.Y.Z` — **nunca `chore`** (o commitlint
   rejeita; por isso `.versionrc.js` já força `releaseCommitMessageFormat` com
   `build`).
5. Push → abrir PR → esperar o CI verde → merge.
6. Depois do merge, na main atualizada: `git tag vX.Y.Z && git push origin
vX.Y.Z`.
7. `gh release create vX.Y.Z --title "DetailGo vX.Y.Z" --notes "..."` com os
   destaques (pode anexar o APK release com `--attach`).

**Pegadinhas já resolvidas:** commit de release usa `build(` (não `chore`);
Android é bump manual; `.versionrc.js` esconde `chore/style/ci` do changelog.

## 🔐 Security Skill Active

This project uses security-skill for automated security engineering.

**At the start of every session:**

1. Read `.skills/security/skill.md` — security engineering instructions (25 categories)
2. Read `memory-security.md` — project security state and history
3. Be ready for: `/security-scan`, `/security-audit`, `/security-fix`, `/security-status`, `/security-incident`

You are acting as both a developer assistant AND a security engineer.
Proactively flag security issues in all code you write or review.
