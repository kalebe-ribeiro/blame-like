---
status: decidida em princípio (2026-10-04) — dano variável, a arma continua overpowered; os números D1–D5 são propostas a confirmar
prioridade: alta — junto da [[Barra-de-vida]] (as duas mexem em dano)
tags: [futuro, arma, dano, safeguards, npcs]
---

# O dano do emissor nos seres

> Usuário (2026-10-04): "inclua variação de dano na arma também, pros inimigos não tomarem hitkill em qualquer tiro. Mas lembre que a arma é pra ser overpowered de fato."

## Hoje (feito)
- **Todo tiro mata** o que o feixe atravessa: `app/beam.js` (`fire`, ~l. 340) testa cada ser contra o eixo (`< r + 0,45 m` do centro do corpo, a 1,1 m dos pés) e chama `world.entities.kill(e, 'beam')`. Um toque de 0,25 s mata um Safeguard tanto quanto o colapso.
- **O que já existe para o dano**: cada corpo tem `e.hp` (1 = inteiro) e `entities.damage(e, quanto, causa)`, que mata ao zerar e emite `being:hurt` (`world/entities.js`). Hoje só a queda dos seres usa isso.

## O princípio (decidido)
- **O tiro cheio mata qualquer ser que existe hoje**, acertando em cheio. Da sobrecarga para cima, mata **até de raspão**. É a arma de Killy: decide uma luta.
- **Os tiros fracos não matam tudo**: um toque fere; quem atira por reflexo, sem carregar, pode precisar de mais de um tiro. Carregar (e se expor: andar a 60%, C2) é o que compra a morte certa.

## A conta (propostas)

**D1 — o dano do tiro**, em "vidas" de um corpo de resistência 1, contínuo com a carga `k` (0..1) e a sobrecarga `o` (0..2), como o resto de `shotOf`:

`D = 0,25 + 0,75·k + 1,0·o`

| tiro | D |
|---|---|
| toque (0,25 s, k ≈ 0) | 0,25 |
| meia carga (k = 0,5) | 0,63 |
| cheio (k = 1) | 1,0 |
| limite (o = 1) | 2,0 |
| colapso (o = 2) | 3,0 |

**D2 — onde pega**: o centro do corpo **dentro do raio do furo** (`< r`) → **cheio** (×1); só **de raspão** (entre `r` e `r + 0,45 m`) → **×0,5**. (O raio cresce com a carga, 0,6 → 2,8 m → 18,7 m, então tiros maiores também acertam "em cheio" com mais facilidade.)

**D3 — a resistência de cada ser** (o quanto de `D` tira 100% da vida dele; `damage(e, D·local / resistência)`):

| ser | resistência | toque | meia | cheio | raspão do cheio |
|---|---|---|---|---|---|
| morador (humano) | 0,4 | 2 tiros | morre | morre | morre |
| andarilho transumano | 0,7 | 3 | 2 | morre | 2 |
| vida de silício | 1,0 | 4 | 2 | morre | 2 |
| Safeguard (o de hoje) | 1,0 | 4 | 2 | morre | 2 |
| Safeguards de nível alto (futuro, [[NPCs-e-Safeguards]]) | 2–3 | 8–12 | 4–5 | 2–3 | 4–6 |

Da sobrecarga para cima (D > 1), tudo de hoje morre em cheio, e **de raspão a partir do limite** (2,0 × 0,5 = 1,0). Os de nível alto: o tiro do limite em cheio mata o de resistência 2; o colapso em cheio, o de 3.

**D4 — ferido**: um ser que leva dano e não morre **cambaleia** (~0,6 s, a pose de recuo em `world/bodies.js`) e solta faíscas (Safeguard, silício) ou um baque (humanos); **a vida dele não volta** (nada de regeneração dos seres, por enquanto). O Safeguard ferido **não foge**: continua a caçada, e o alerta do setor sobe como hoje (`player:beam`). Moradores e andarilhos feridos fogem e lembram de você (a troca fica fechada com aquele ser).

**D5 — o que não muda**: o corte no mundo (o furo, a brasa, os detritos), o alcance, o raio, o gasto, o coice e a sobrecarga continuam iguais. O dano é só a conta nos seres. O modo Livre também usa o dano variável (o Livre não gasta a célula, mas um toque continua sendo um toque).

## Implementação
1. `app/beam.js` `fire`: no lugar de `kill`, `damage(e, D·local / resist(e), 'beam')`, com `D` saindo de `shotOf(k, o)` (um campo novo, `dmg`) e `local` = 1 ou 0,5 pela distância ao eixo.
2. `resist(e)` por tipo de ser (uma tabela em `world/entities.js`, junto do `hp`; os seres das vilas e os andarilhos vêm de `world/npcs.js` — conferir como o tipo deles chega ao corpo).
3. D4: a pose de recuo e as faíscas no `being:hurt` com `cause: 'beam'`; o Safeguard ferido segue no estado de caçada; o morador/andarilho ferido foge (o estado `flee` de `world/npcs.js`) e marca o jogador.
4. `lastShot.kills` continua; ganha `hurt` (feridos).
5. **Testes** — `check:beam` caso `dano`: um Safeguard de teste em cheio com toque (sobra 75%), meia (morre no 2º), cheio (morre); de raspão com o cheio (sobra 50%); o limite de raspão (morre); um morador com toque (morre no 2º). E `check:safeguards` (o ferido continua caçando).
