# Critérios de aceite do DetailGo

Vale para todo mundo que mexe neste código: eu, você e o agente autônomo.

Nenhum item aqui é boa prática genérica. Cada um existe porque **este projeto
já falhou exatamente assim**, e o caso real está citado junto. Quando um
critério parecer burocracia, leia o caso — ele é a resposta.

---

## Antes de começar

Responda três perguntas e escreva as respostas no PR. Se não souber responder,
a atividade ainda não está pronta para começar.

1. **O que muda para o dono ou para o cliente?** Se a resposta for "nada",
   isto é refatoração — e refatoração não altera teste existente.
2. **O que quebra se eu errar?** Dinheiro, isolamento entre lojas, agenda e
   autenticação são de risco alto. Cor e margem não.
3. **Como eu provo que funciona, sem abrir o app?** Se a única prova for
   "testei na mão", falta teste.

---

## Antes de abrir o PR

Tudo executado de verdade, não presumido.

```bash
npx tsc --noEmit
npm run lint
npx prettier --check "src/**/*.{ts,tsx,js}"
npx jest --coverage
```

Mexeu em `functions/`:

```bash
cd functions && npm run build && npx jest
```

Mexeu em `firestore.rules`:

```bash
npm run test:rules
```

> **Não confie em `comando | tail`.** O código de saída que sobra é o do
> `tail`, sempre zero. Já declarei "LINT OK" com dois erros na tela por causa
> disso. Rode o comando sozinho e olhe o `$?`.

> **Java 21 é exigido pelo firebase-tools atual.** Com JDK 17 na máquina, use
> `npx firebase-tools@13.35.1 emulators:exec --only firestore "npx jest
--config jest.config.rules.js --runInBand"`.

---

## Teste

Teste entra no mesmo PR da mudança. Não existe "depois eu escrevo".

### Cobertura não é evidência

O piso do `jest.config.js` é rede de segurança contra regressão, **não** meta.
Subir o número não prova nada sobre a qualidade do teste.

> O `ProfileScreen` chegou a **95% de linhas com 5 mutantes vivos**: validava o
> nome mas não o sobrenome, aceitava telefone de 9 dígitos, regravava máscara
> em telefone legado e comparava e-mail sem normalizar os dois lados. Nenhum
> apareceu no relatório de cobertura.

### Mutação

**Obrigatória** quando o arquivo toca dinheiro, segurança ou isolamento entre
lojas: `functions/`, `firestore.rules`, pagamento, autenticação, e qualquer
coisa que leia ou escreva com `shopId`.

**Recomendada** no resto.

O método: quebre o código de propósito, rode a suíte, confirme que **algum
teste falha**. Reverta. Repita para cada decisão que o arquivo toma.

Mutantes que valem a pena, porque foram os que acharam defeito aqui:

| Tipo                                      | Exemplo real                               |
| ----------------------------------------- | ------------------------------------------ |
| Trocar `>=` por `>` numa borda            | telefone de 9 dígitos passava              |
| Remover metade de um `\|\|`               | validava nome, ignorava sobrenome          |
| Inverter uma condição                     | `canOpenURL` do WhatsApp                   |
| Apagar uma limpeza de estado              | `reset()` do store ao deslogar             |
| Apagar um `return unsub`                  | listener da loja anterior seguia vivo      |
| Trocar a origem de um dado                | ler o id da assinatura do documento errado |
| Escrever valor fixo no lugar da constante | dias de carência na mão                    |

Registre o placar no PR: `17 de 17 mortos`. Mutante que sobrevive vira teste ou
vira comentário explicando por que não dá para matar — nunca some em silêncio.

### Teste vazio: o catálogo

Teste verde que não afirma nada é pior que teste ausente, porque dá confiança.
Todos estes aconteceram aqui:

**A semente é igual ao que o teste afirma.**
Semeei a loja com `subscriptionStatus: 'active'` e o teste gravava `'active'`.
O `affectedKeys()` do Firestore só lista campo cujo **valor mudou** — diff
vazio, regra aprovou, teste passou sem significar nada. A semente tem que estar
no estado de onde o ataque parte.

**O `beforeEach` já fez o que o teste ia verificar.**
O teste do `ShopContext` afirmava que o store ficava vazio depois do logout —
mas o `beforeEach` já chamava `reset()`. Passava com ou sem o reset no código.

**O mock usa o valor real da constante.**
Se o mock de `GRACE_DAYS` vale 5 e o real vale 5, o teste passa mesmo se a tela
escrever "5" na mão. Use um valor **diferente** do real de propósito.

**A asserção procura só uma das formas de errar.**
Afirmei que item sem data não mostra `há ...` nem `agora`. Sem a guarda, a
conta partia de 1970 e caía na faixa de **data** — o item exibia `01/01` e meu
regex não via nada.

**Só o caso negativo foi afirmado.**
Afirmei que `setDoc` **não** é chamado quando nada muda, mas nunca que **é**
chamado quando muda — e é essa gravação que cura documento legado.

**A borda foi testada de um lado só.**
Testar 7 dígitos não prova nada sobre o limite de 10, porque 7 falha nos dois
lados. Teste 9 e 10.

**A guarda nunca foi vista falhando.**
Antes de confiar num piso, num `assertFails` ou num lint, quebre de propósito e
veja falhar. O ratchet só vale depois de eu ter subido o piso acima da
cobertura real e visto o jest recusar.

### Ao corrigir bug

Escreva primeiro o teste que reproduz a falha. Veja falhar. Corrija. Veja
passar. Sem isso não há prova de que o teste pega o bug.

---

## Segurança

Mexeu em `functions/`, `firestore.rules` ou `storage.rules`: revisão de
segurança antes do merge, do **código inteiro da área**, não do diff.

> A revisão por diff voltou vazia numa branch que só tinha teste, e logo depois
> a revisão do código completo achou três falhas de desenho — entre elas um
> caminho para **cancelar a assinatura de outra estética**. Falha de desenho
> não aparece no diff porque ela não mudou.

Três perguntas que acharam defeito aqui:

1. **Este campo é gravável pelo cliente?** Provar que o documento é de quem
   chamou não prova que o conteúdo dele é. O `asaasSubscriptionId` vivia no
   documento da loja, que o dono edita.
2. **Esta regra esconde campo?** Não esconde. `allow read` libera o documento
   inteiro, e os identificadores de cobrança estavam num documento público.
3. **Este valor vira caminho?** `shops/${shopId}` com barra dentro do `shopId`
   aponta para outro documento. Valide o formato antes de concatenar.

Checklists em `.skills/security/checklists/`. O de Firebase foi quem lembrou
que as regras do **Storage** nunca tinham sido revisadas.

---

## Dependências

Mexeu em `package.json` ou `package-lock.json`, dos dois lados:

- [ ] `npm audit` **medido hoje nas duas pontas**, antes e depois, na mesma
      sessão
- [ ] Bundle de release gerado à mão:
      `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/b.js`

> **Comparar com número anotado dias antes dá conclusão errada.** Concluí que
> um PR "piorava a segurança" comparando 18 contra 56 — mas a `main` daquele
> dia tinha 69. Advisories novas tinham sido publicadas no meio.

> **O CI não pega quebra de empacotamento.** Um override do `image-size` para
> 2.x quebrou todas as builds de release e passou verde, porque a build de
> debug do CI não empacota JavaScript.

---

## Medição

Antes de afirmar que algo ficou mais rápido ou mais lento, meça as duas pontas
na mesma máquina, no mesmo dia.

> Li intervalo de log como custo sequencial e propus cortar ABIs. Elas são
> compiladas **em paralelo**: cortar de 4 para 1 deu 442s contra 443s. Na mesma
> investigação, remover `--no-daemon` _acrescentou_ 46 segundos.

---

## Git e PR

- Branch a partir da `main` atualizada. `git pull --ff-only` antes de criar.
- Valide a mensagem antes de commitar: `npx commitlint < msg.txt`.
  Escopo obrigatório, assunto todo minúsculo, linhas do corpo até 72
  caracteres — o travessão conta como um caractere, não três bytes.
- Descrição do PR objetiva, dizendo **o que muda e o que não muda**. Sem a
  linha "Generated with Claude Code".
- Mergeie o que ficou verde. Branch esquecida já custou o `plano.md` sumir da
  `main` sem ninguém notar.

---

## Documentação

`docs/lancamento/plano.md` é a fonte de verdade do progresso. Item fechado é
marcado **no mesmo PR que o resolve**, com o número real medido na hora.

> O plano ficou desatualizado duas vezes em uma semana, marcando como aberto o
> que já estava fechado e citando contagem de teste de dois dias antes.

---

## O que **não** é exigido

Para o documento não virar ritual:

- Perseguir os últimos pontos de cobertura. Ramo defensivo inalcançável pela
  interface é comentário no spec, não teste forçado.
- Testar cosmético: cor exata, margem, variação de tema, `Platform.OS`.
- Mutação em mapeamento de ícone, formatação de texto e constante.
- Teste de rede ou de Firebase real. Nunca.
