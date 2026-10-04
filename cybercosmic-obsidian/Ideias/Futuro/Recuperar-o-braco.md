---
status: decidida (2026-10-04) — os três caminhos (estrutura única nova, loot, NPCs) e R1–R7
prioridade: alta — depois da [[Barra-de-vida]] (hoje a Peregrinação pode ficar presa sem os dois braços)
tags: [futuro, gameplay, corpo, arma, estruturas-unicas, loot, npcs]
---

# Recuperar o braço

> Pedido do usuário (2026-10-03): níveis do emissor além do limite em que "o braço usado pra atirar é perdido" — e "deixa registrado no cofre uma futura mecânica que permite recuperar o braço em algumas estruturas específicas, ou loot, não sei. Deixa em aberto."
>
> **Decidido (2026-10-04, usuário):** três caminhos — **um tipo novo de estrutura única**, **loot** e **NPCs**. Ficaram de fora a regeneração lenta e a combinação com ela.
>
> **R1–R6 aprovadas (2026-10-04)** com os preços alinhados (o caminho mais completo custa mais) e sem a R6(c): "mesmo que seja difícil chegar numa vila, ainda tem outras duas alternativas". **R7 nova**: o aviso de um braço só.

## O que existe hoje (feito)

- O emissor ([[Arma-do-Killy]]) tem estágios além do limite: **5 espaguetificação (8 s) · 6 horizonte (9,5 s) · 7 colapso (11 s)**. Disparar num deles **desfaz o braço que segura o emissor** (`app/beam.js` `loseArm`, `ARM_LOSS_STAGE`).
- O estado: `player.arms = { right, left }` (salvo no slot, `app/player.js`). Um braço perdido não segura nada (`app/inventory.js` `equip` — o emissor volta ao inventário e o outro braço o pega); **sem os dois braços**, o corpo não agarra quinas nem sobe escadas de marinheiro (`walker.canGrab` / `walker.canClimb` — `app/beam.js`, basta um braço para os dois).
- **Peregrinação: o braço não volta** — até existir esta mecânica. O despertar também não o devolve. **Livre** (sem custos): volta sozinho em 30 s (`ARM_REGROW_FREE`) — continua assim.
- Teste: `check:beam` caso `alem`.

### O risco que esta nota resolve
Com um braço só, atirar de novo além do limite perde o outro. Sem os dois, nada de quinas e escadas — e hoje **para sempre** na Peregrinação: o mundo salvo pode ficar preso se a saída de onde se está pede uma escada. Por isso a prioridade alta e a regra R6.

## Os três caminhos

### 1. A estrutura única nova — a **câmara de reconstrução**
Em *Blame!*, a Cidade ainda tem máquinas que fazem e consertam corpos ([[14-Universo-Blame]]); é a peça que falta entre as [[Estruturas-unicas]].
- **O que é**: uma sala fechada com um berço de montagem (braços mecânicos, cabos descendo do teto, um tanque) — geometria própria na macro, como as outras únicas (`uniqueSite`/`buildUnique`), **protegida do emissor** (C3, `B.protect`) como todas.
- **Como funciona**: entrar, deitar no berço (usar — `E`/botão 3), ~20 s de montagem com a câmera presa olhando o teto (os braços mecânicos trabalhando, faíscas, o som); sai com **os dois braços**.
- **Onde**: sorteio à parte (hash novo, ex. 985) para os mundos antigos manterem as suas únicas; frequência como a das outras (~uma por 16 km), no fim de cadeias de [[Pistas]] como todas.
- **Também é onde se implanta o gene de terminal** ([[Gene-terminal]] G6, 2026-10-04): com o gene ou a amostra no inventário, o berço implanta — o objetivo final passa por aqui.
- **Diferente das outras únicas**: o efeito **não é de uma vez só** (as outras gravam em `slot.uniques` e acabou) — a câmara serve sempre, com custo (R2: 50% da célula).

### 2. Loot — a **prótese**
- **O que é**: um braço de reposição (prótese mecânica, visivelmente diferente — R4), achado como objeto no mundo.
- **Onde aparece**: raro, nos **cemitérios de vítimas** (os corpos descartados pelos Safeguards — [[Queda-e-despertar]]) e nos **depósitos** (os ocos do maciço — `gen/closed.js`) (proposta R3).
- **Como funciona**: pegar (vai para o inventário, como uma [[Cargas|carga]] — ocupa espaço), e instalar parado (~5 s, do inventário) — devolve **um** braço. Sem os dois braços dá para pegar e instalar (o corpo usa o que sobra: a boca, o cotovelo — não precisa de mão; R6).

### 3. NPCs — os **moradores das vilas**
- **O que é**: uma troca nova na conversa (`app/people.js`, `ui/talk.js`): "refazer o braço".
- **O preço** (R5): uma carga entregue, ou 30% da célula — como as trocas de hoje, pela conversa curta. Refazem **um** braço.
- **Andarilhos transumanos**: não refazem, mas podem **vender uma prótese** (o loot do caminho 2) por 40% da célula — os que roubam, não.
- **O despertar numa vila** (desmaio arrastado por NPCs, fase 7): acordar lá dá a chance de pedir na hora.
- **Vila hostil** (você feriu ou matou um morador dela — [[Dano-do-emissor]] §4): ali não se refaz nada, para sempre.

## Decisões (aprovadas em 2026-10-04)

**Os preços, do mais completo ao mais simples** — o caminho que dá mais custa mais:

| caminho | devolve | custa |
|---|---|---|
| câmara de reconstrução | **os dois** braços | **50% da célula** + ~20 s parado |
| prótese de um andarilho | **um** (prótese) | **40% da célula** |
| moradores de uma vila | **um** | **uma carga entregue ou 30% da célula** |
| prótese achada (loot) | **um** (prótese) | achar (raro) + ~5 s para instalar |

| # | pergunta | decidido |
|---|---|---|
| R1 | a câmara refaz um braço ou os dois? | **os dois**; a prótese e os moradores, **um** |
| R2 | a câmara custa? | **50% da célula** e os ~20 s parado; serve quantas vezes quiser |
| R3 | onde a prótese aparece | cemitérios de vítimas (1 em ~3 tem uma) e depósitos (raro); andarilhos que trocam vendem por **40%** |
| R4 | o braço novo é igual? | **câmara e moradores: igual** (a luva de sempre); **prótese: diferente** — metal à vista, outra cor na mão em primeira pessoa (`app/hands.js`) |
| R5 | o preço dos moradores | uma carga entregue **ou 30% da célula** |
| R6 | saída garantida sem os dois braços | (a) instalar a prótese não pede mão; (b) sem os dois braços, o aparelho marca a vila ou a câmara mais perto no mapa como pista ([[Pistas]], `lead:reveal`). **Sem garantia de caminho sem escada até a vila** (a antiga R6c, descartada): as outras duas saídas bastam |
| R7 | o aviso de um braço só | ver abaixo |

### R7 — o aviso de um braço só
Para o jogador ficar precavido antes de perder a mobilidade:
- **Ao perder o primeiro braço**: o aparelho diz, além de "BRAÇO DIREITO PERDIDO", **"um braço só — sem os dois, nada de quinas nem escadas"** (uns 5 s, uma vez).
- **Carregando o emissor com um braço só**: ao passar para o **estágio 5** (o primeiro que custa o braço), o anúncio do estágio vem com um aviso próprio — **"ÚLTIMO BRAÇO"** no aparelho, piscando, e um tom grave diferente do baque dos estágios (`audio.beamStage` com uma variação). Não bloqueia nada: soltar ali é escolha.
- **No inventário**: a linha do braço perdido diz também "(o outro é o último)".
- Só na **Peregrinação** (no Livre o braço volta em 30 s — o aviso seria ruído).
- Teste: `check:beam` caso `alem` confere o aviso ao perder o primeiro e o "ÚLTIMO BRAÇO" no estágio 5 com um braço.

## Implementação (ordem proposta, depois da [[Barra-de-vida]])
1. `restoreArm(which, kind)` em `app/beam.js` (hoje só existe `restoreArms` dos testes) — com o tipo (`flesh` / `prosthesis`) salvo em `player.arms`; `app/hands.js` desenha a prótese.
2. **NPCs** (o mais barato: a conversa já existe) — a troca nova.
3. **Loot** — o objeto prótese (geração nos cemitérios/depósitos, determinística pela seed), o item no inventário, instalar.
4. **A câmara** — o tipo novo de única (sorteio à parte), a geometria, a sequência no berço.
5. **R6** — a pista automática sem braços; **R7** — os avisos de um braço só.
6. **Testes**: `check:beam` caso `alem` ganha a volta (perder os dois → cada caminho devolve o certo); um mundo de teste sem braços chega a uma vila sem escada.
