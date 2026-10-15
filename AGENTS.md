# AGENTS.md — DetailGo

Instruções para agentes de código autônomos (Jules, Codex, Claude e afins).
Este arquivo é a fonte canônica de regras do repositório.

## O projeto

SaaS mobile **multi-tenant** para estéticas automotivas. Cada estabelecimento é
um `shop` independente. Dois papéis: `owner` (dono da estética) e `customer`.

React Native 0.81 · React 19 · TypeScript estrito · Firebase (Auth, Firestore,
Storage, Messaging, Crashlytics, Cloud Functions) · Zustand · React Navigation ·
Jest + React Native Testing Library · MercadoPago (Pix).

```
src/
  app/          → tipos globais
  navigation/   → RootNavigator
  features/     → admin, appointments, auth, dashboard, map,
                  notifications, profile, settings, shops, subscription
  shared/       → components, hooks, theme, utils, constants
functions/src/  → appointments, geo, notifications, payment, scheduled
firestore-tests/→ testes das firestore.rules (Jest separado, ambiente Node)
```

Cada feature segue `components/ context/ data/ domain/ hooks/ screens/
services/ utils/ index.ts`. Imports por alias: `@app/`, `@features/`, `@shared/`.

## Regras invioláveis

Estas são as que um agente quebra sem perceber. Violar qualquer uma reprova a
entrega, mesmo que os testes passem.

**0. `docs/criterios-de-aceite.md` é obrigatório.** Leia antes de começar
qualquer atividade. Ele define o que conta como pronto, inclusive quando a
mutação é exigida e o catálogo de teste vazio — teste verde que não afirma
nada. Cada item de lá nasceu de uma falha real deste projeto, com o caso
citado. A seção "Definição de pronto" no fim deste arquivo é o resumo; o
documento é a norma.

**1. Isolamento multi-tenant.** Toda query no Firestore deve ter escopo de
`shopId`. Nunca leia coleções de agendamentos, serviços ou configurações sem o
shop no caminho ou num `where` validado. Um cliente jamais pode ler ou escrever
dados de outra estética.

**2. As `firestore.rules` são a fronteira de segurança.** Validação no cliente é
usabilidade, não proteção. Se uma mudança altera quem acessa o quê, as rules
precisam refletir isso — e ganhar teste em `firestore-tests/`.

**3. Nunca commitar segredo.** Chaves, tokens, credenciais de service account,
access token do MercadoPago, `google-services.json`, keystores. Antes de abrir
PR, revise o diff procurando isso. Em documentação use `<variavel-de-ambiente>`,
nunca o valor real. O repositório é público.

**4. Nunca baixar o `coverageThreshold`.** O `jest.config.js` tem um piso
(`statements 14 · branches 10 · functions 14 · lines 15`) que só sobe. Se a
cobertura reprovar, escreva teste — não afrouxe o piso. Também não escreva teste
vazio só para inflar percentual.

**5. Não vazar dado sensível em log.** Sem `console.log` de usuário, token,
telefone, e-mail ou payload de pagamento.

**6. Pagamento não se confirma no cliente.** Ativação de assinatura vem do
webhook do MercadoPago via Cloud Function. O app nunca escreve estado de
pagamento por conta própria.

**7. Não mexer no núcleo de dependências.** Nunca rode `npm audit fix --force`.
Nunca atualize React, React Native ou o toolchain `@react-native/*` — o
`renovate.json` os trava de propósito, por compatibilidade entre RN 0.81 e
React 19. Upgrade desses é manual e planejado. Corrigir vulnerabilidade é
bem-vindo, mas só com mudança verificável e sem breaking change; o resto vira
recomendação para decisão humana.

**8. Módulo nativo não sobe sem teste em aparelho.** `react-native-maps`,
`@notifee/*`, `@react-native-firebase/*`, `react-native-screens`,
`react-native-svg` e afins carregam código nativo: **nenhum teste do Jest cobre
a mudança**, porque são mockados. Se uma atualização (mesmo dentro da faixa do
`package.json`, mesmo vinda do `npm audit fix`) mexer num deles, **declare isso
em destaque no PR** — o merge depende de build e verificação manual no
dispositivo. Não afirme que a mudança é segura só porque a suíte passou.

## Comandos

```bash
npx tsc --noEmit       # tipos
npm run lint           # eslint
npm run format:check   # prettier
npm test               # suíte completa
npm run test:cov       # cobertura (respeita o piso)
npm run test:rules     # regras do Firestore (sobe emulador; exige Java 21+)

npx commitlint --from=main --to=HEAD   # valida as mensagens de commit
```

As Cloud Functions têm dependências próprias em `functions/package.json` — o
`npm install` da raiz não as instala. Ao mexer em `functions/`, rode antes
`cd functions && npm install`, senão o TypeScript não resolve `firebase-admin`.

Não afirme que um comando passou sem tê-lo executado. Se não conseguiu rodar,
diga qual e por quê.

## Testes

Teste faz parte da entrega, não é etapa seguinte. Toda alteração com lógica nova
(regra de negócio, validação, cálculo, fluxo) vem com teste no mesmo PR.

- Arquivo `.spec.ts`/`.spec.tsx` **ao lado** do código testado.
- `jest.setup.js` já mocka os nativos globais (AsyncStorage, safe-area,
  linear-gradient, lucide, bootsplash). No teste, mocke só o que é específico
  dele: services, `useNavigation`, hooks da feature.
- Telas que usam `useFeedback` precisam mockar `@shared/components/FeedbackProvider`,
  senão o hook lança fora do provider.
- `clearAllMocks()` **não** limpa a fila de `mockResolvedValueOnce`. Use
  `mockReset()` no `beforeEach` do mock que usa `...Once`.
- Use `testID` quando o texto for ambíguo (mesmo rótulo no header e no botão).
- Nunca toque em Firebase real. Testes determinísticos, sem rede.

**Teste comportamento:** validações, regras, cálculos, autorização, navegação,
estados, erros. **Não persiga cosmético:** cor exata, margem, variação de tema,
`Platform.OS`. Cobertura é mapa de risco, não meta — não cace 100%.

**Ao corrigir bug:** escreva primeiro o teste que reproduz a falha, veja
falhar, corrija, veja passar.

## Segurança

Ao receber uma tarefa de auditoria de segurança, **primeiro analise e reporte —
não saia corrigindo.** Entregue os achados classificados:

```
CRÍTICO · ALTO · MÉDIO · BAIXO
```

Para cada um: arquivo afetado, comportamento vulnerável, impacto possível,
correção recomendada e se cabe teste de regressão. Só implemente correções
quando a tarefa pedir explicitamente, ou depois da revisão humana do relatório.

Superfícies que merecem atenção nesta base:

- travessia entre shops (cliente ou dono alcançando dados de outra estética)
- `firestore.rules` e `storage.rules`
- autenticação nas Cloud Functions e no webhook do MercadoPago
- ativação de assinatura e estado de pagamento
- escalação de papel (`customer` virando `owner`)
- credenciais expostas e histórico do Git
- tokens de FCM e dados pessoais em log
- validação de entrada
- dependências vulneráveis

## Mudanças de código

Mudanças pequenas e focadas. Não refatore arquivo não relacionado à tarefa. Não
misture correção de bug com redesign de UI ou migração de dependência — se um
refactor maior parecer necessário, explique antes em vez de executar.

Antes de criar abstração nova, verifique se já existe. Antes de adicionar
dependência, verifique se dá para resolver com o que já está instalado, e
considere compatibilidade com RN 0.81 / React 19.

TypeScript é estrito: evite `any` e não silencie erro com `@ts-ignore` para o CI
passar.

**Identidade visual:** "Garage Dark" — escuro, neon amarelo-verde (`#D4FF3D`),
acento laranja (`#FF5C39`), pegada automotiva. É decisão fechada; não migre para
outro estilo. Use os tokens do tema (`const { colors: D } = useAppTheme()`),
nunca cor hardcoded.

**Mensagens ao usuário sempre em português**, datas no formato brasileiro.

## Git e PR

Nunca commite direto na `main` (é protegida). Branch a partir da `main`
atualizada, nomeada `jnrp/<descritivo>`.

Commitlint (hook `commit-msg`) exige:

- formato `type(scope): subject` — **escopo obrigatório**
- subject em **minúsculo** (sem PascalCase/camelCase) e ≤ 100 caracteres
- corpo com linhas ≤ 72 caracteres
- type ∈ `build, docs, feat, fix, perf, refactor, test`

O erro mais comum é citar nome de função no subject, que traz camelCase junto:

```
✅ test(appointments): cobre cancelamento e limpeza de favorito
❌ test(appointments): add tests for cancelAppointment
❌ corpo com uma linha única de 200 caracteres
```

**Valide antes de enviar** — não confie na leitura:

```bash
npx commitlint --from=main --to=HEAD
```

**Nunca use `--no-verify`** nem desative os hooks do husky. Eles existem para
pegar exatamente esse tipo de erro antes do CI.

Um commit por entrega. Se a mensagem sair errada, **refaça o commit**
(`git commit --amend`, ou `git reset --soft main` e commite de novo) — não
empilhe um commit novo por cima tentando corrigir. O commitlint valida todos os
commits do PR, então o commit ruim continua reprovando mesmo depois do
"conserto".

Descrição do PR deve responder: o que mudou, por quê, como foi testado,
implicações de segurança e limitações conhecidas.

## Definição de pronto

Resumo. A norma completa é `docs/criterios-de-aceite.md`.

```
implementação completa
+ tsc, lint, format e testes passando (executados de verdade)
+ testes novos para a lógica nova
+ mutação quando o arquivo toca dinheiro, segurança ou shopId,
  com o placar no PR ("17 de 17 mortos")
+ nenhum dos padrões de teste vazio do catálogo
+ isolamento multi-tenant preservado
+ nenhum segredo no diff
+ diff revisado, sem arquivo não relacionado
```

> **Cobertura não é evidência.** O `ProfileScreen` chegou a 95% de linhas com 5
> mutantes vivos. Subir o número do ratchet não prova nada sobre a qualidade do
> teste — só que ele não regrediu.

Não relate tarefa como concluída com falha conhecida em aberto. Ao terminar,
resuma: o que mudou, testes, implicações de segurança, arquivos tocados e riscos
remanescentes (ou "nenhum identificado no escopo desta tarefa").

## 🔐 Security Skill Active

This project uses security-skill for automated security engineering.

**At the start of every session:**

1. Read `.skills/security/skill.md` — security engineering instructions (25 categories)
2. Read `memory-security.md` — project security state and history
3. Be ready for: `/security-scan`, `/security-audit`, `/security-fix`, `/security-status`, `/security-incident`

You are acting as both a developer assistant AND a security engineer.
Proactively flag security issues in all code you write or review.
