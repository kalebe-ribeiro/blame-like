---
status: feita (1–3); 4 pendente — 2026-10-08: nada novo de mobilidade por ora
prioridade: alta
tags: [gameplay, movimento, corpo]
---

# Mobilidade do corpo

> Pedido do usuário (2026-10-05), depois de um playtest: "a mobilidade ainda é algo praticamente impossível. Não culpo a arquitetura, pois ela é indiferente aos que vivem na Cidade. O que se pode fazer é criar novos recursos dos quais os players possam usufruir para se movimentar melhor — algo inerente do humano, como agarrar nas quinas." Das sugestões, escolhidos: **1, 2, 3 e 4**.
>
> Fora (por enquanto): fôlego (7), o coice do emissor como impulso (8), carona agarrado em algo que anda (9), as ferramentas antes recusadas (guincho, garras, acoplador — [[Ferramentas]]).

Tudo parte das [[Quinas-e-maos]] (`controls/walker.js`: `_findLedge`, `_hangStep`, `_startMantle`; as mãos em `app/hands.js`). Nada mágico: o corpo só se segura onde há onde segurar; nenhuma tecla nova (o controle e o teclado fazem tudo com mover, pular e voltar — regra absoluta).

## 1. Pendurado: andar pela borda, contornar, saltar, descer

Já existia: pendurado, os lados andam pela borda (0,9 m/s, mão por mão). Falta:
- **Contornar cantos**: no fim da borda, se ela continua na face ao lado (canto de fora) ou na parede à frente (canto de dentro), o corpo vira e segue.
- **Saltar entre bordas**: pulo + lado → um salto curto de lado até outra borda na mesma altura (até ~2 m); pulo + trás → vira e salta para uma borda atrás (até ~3 m, a parede em frente de um vão estreito).
- **Soltar e pegar a de baixo**: trás solta; se houver uma borda até ~3 m abaixo na mesma parede, as mãos a pegam (descer uma parede de borda em borda).

## 2. Descer pela borda

Andando **de costas** para fora de uma beirada com queda de mais de ~2,5 m, o corpo se vira e fica pendurado nela em vez de cair. De frente, cai como hoje (pular de propósito continua possível).

## 3. Rolamento

Apertar pulo pouco antes de tocar o chão (janela de ~0,25 s), numa queda de mais de ~4 m: o corpo rola — menos dano e se levanta mais rápido, mantendo o embalo. Só ajuda quedas médias: as grandes continuam fatais.

## 4. Escalar pelos apoios da parede

Um **apoio**: um rebordo na parede onde cabe a mão, mas não o corpo (a borda de cima de um painel saliente, uma nervura, um cano horizontal, a verga de uma abertura). Hoje uma quina só conta se o topo der para ficar de pé; o apoio é a mesma busca sem isso.
- Pendurado num apoio: frente sobe para o apoio de cima (até ~1,5 m), se houver; num topo onde se fica de pé, sobe por cima como hoje.
- De pé ou no ar diante da parede, as mãos pegam um apoio ao alcance.
- **Primeiro, um levantamento** (como o `--ledgestats` fez com as quinas): quantos apoios a Cidade tem de verdade, por região. Se forem raros demais, decidir com o usuário se a geração ganha relevo onde faria sentido (sem inventar apoio do nada).

## Feito (2026-10-05) — `controls/walker.js`

- **Descer pela borda**: andando de costas (sem correr, sem carga) para uma beirada com mais de 2,5 m de queda, o corpo vai até ela e desce rente à face em ~0,6 s (`_edgeBehind`, `_startLower`), ficando pendurado de frente para ela.
- **Soltar e pegar a de baixo**: pendurado, "trás" solta, mas só se for apertado de novo (quem desceu de costas ainda o segura). O corpo cai rente à parede, sem controle horizontal até pegar outra borda ou pousar (`dropping`), e as mãos pegam a próxima borda que passar por elas, abaixo da solta (`ignoreAbove`).
- **Contornar cantos**: no fim da borda, a parede à frente (canto de dentro) ou a face do lado (canto de fora): o corpo vira e segue (`_cornerLedge`). Uma parede do lado no caminho do corpo agora acaba a borda (antes ele a atravessava). Também corrigido: no fim da borda, o corpo voltava a um ponto qualquer (a posição guardada num vetor que o `_findLedge` reescreve).
- **Saltos pendurado**: pulo + lado → a borda do outro lado de um vão até ~2,9 m (sem vão, um pulo de 1,5 m ao longo da mesma borda); pulo + trás → vira e salta para a parede de trás até 3,2 m (`_leapTarget`, `_startLeap`, ~0,45 s em arco).
- **Rolamento**: caindo rápido, o pulo APERTADO até 0,3 s antes do toque (segurado desde antes não conta), num impacto entre 9 m/s e o letal (38): o rolamento absorve 8 m de queda (20 m: 26% → 7% de dano). O corpo segue para a frente 0,65 s com a cabeça mergulhando (`rollPitch`), agachado; o pulo ainda segurado não vira salto (`jumpLatch`). Som, vibração e o evento `player:roll`.
- Testes: `npm run check:climb` (`--climbonly=mobilidade`): na arena (`dev/arena.js`, opções `facade` e `gym`), os casos `descer-borda`, `soltar-baixo`, `canto-fora`, `canto-dentro`, `salto-lado`, `salto-tras`, todos verdes; `npm run check:health` com `rolamento` e `rolamento:cedo`.

## O levantamento dos apoios (2026-10-05, `--holdstats=N`)

Em 10 lugares (teia, colmeia, maciço, galeria, poço, estrato, treliça, camada, máquinas, escadaria): **nenhuma coluna de parede escalável** (apoios encadeados a ≤ 1,5 m por ≥ 4 m). Apoios soltos existem (bordas de pontes, degraus de escadarias, nervuras de poço), nunca em sequência. As paredes são caixas lisas, então a escalada (§4) não teria onde se segurar. **Pendência (usuário, 2026-10-05: "deixa como pendência")**: dar relevo à geração onde faria sentido (cornijas, nervuras horizontais, grampos de manutenção nas paredes de galerias, poços, colmeia e maciço — coisas que a Cidade teria), ou deixar a §4 de lado.

## Ordem

1. Descer pela borda (2) e soltar pegando a de baixo (1).
2. Contornar cantos e saltar entre bordas (1).
3. Rolamento (3).
4. O levantamento dos apoios, e então a escalada (4).

Cada etapa com casos novos no `npm run check:climb` e uma captura.
