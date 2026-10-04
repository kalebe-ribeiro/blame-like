---
status: feita (2026-10-04) — decidida e confirmada em 2026-10-03 — dano variável por nível (Safeguards e vida de silício); o tiro máximo (o colapso) mata qualquer ser; vilas hostis; a dificuldade vem do movimento dos inimigos
prioridade: alta — junto da [[Barra-de-vida]] (as duas mexem em dano)
tags: [futuro, arma, dano, safeguards, npcs, vilas]
---

# O dano do emissor nos seres

> Usuário (2026-10-03): "inclua variação de dano na arma também, pros inimigos não tomarem hitkill em qualquer tiro. Mas lembre que a arma é pra ser overpowered de fato."
>
> **Revisto (2026-10-03, usuário):** "um hit médio-fraco tem que matar um low level; um Safeguard mediano tem que tomar mais tiros médios-fracos; um high level tem que tomar vários tiros; **o tiro nível máximo tem que dar instakill em todos**. O nível de dificuldade vai se dar por conta da movimentação dos NPCs" → [[Movimento-dos-inimigos]]. E: matar um andarilho ou morador só perde a troca com ele; **ferir ou matar um morador numa vila deixa os outros hostis** (§4).
>
> **Confirmado (2026-10-03, usuário):** "nível máximo é o que perde o braço, o literal nível máximo" — **o colapso (estágio 7)**; e todos os detalhes do §4 (a vila hostil). **A vida de silício também tem níveis** (§3).

## Hoje (feito)
- **Todo tiro mata** o que o feixe atravessa: `app/beam.js` (`fire`, ~l. 340) testa cada ser contra o eixo (`< r + 0,45 m` do centro do corpo, a 1,1 m dos pés) e chama `world.entities.kill(e, 'beam')`.
- **O que já existe para o dano**: cada corpo tem `e.hp` (1 = inteiro) e `entities.damage(e, quanto, causa)`, que mata ao zerar e emite `being:hurt` (`world/entities.js`). Hoje só a queda dos seres usa isso.
- **Só existe um tipo de Safeguard** (`world/safeguards.js`). Os níveis baixo/médio/alto abaixo são novos — entram com [[Movimento-dos-inimigos]] (onde cada nível também ganha a sua velocidade).

## 1. O dano do tiro (D1)
Em "vidas" de um ser de resistência 1, contínuo com a carga `k` (0..1) e a sobrecarga `o` (0..2), como o resto de `shotOf`:

| faixa | fórmula |
|---|---|
| carga (até o cheio) | `D = 0,3 + 0,7·k` |
| sobrecarga (estágios 1–4) | `D = 1 + 2·o` → 3 no limite |
| além do limite (estágios 5–6) | `D = 3 + 3·(o − 1)` → 4 na espaguetificação, 5 no horizonte |
| **estágio 7 — colapso (o tiro máximo)** | **mata qualquer ser, em cheio ou de raspão** (sem conta) |

O tiro "médio-fraco" = carga `k` ≈ 0,3–0,45, que é **segurar ~0,6–0,85 s** (pela curva de `chargeK`): `D` ≈ 0,5–0,6.

| tiro | segurando | D |
|---|---|---|
| toque | 0,25 s | 0,3 |
| médio-fraco | ~0,6–0,85 s | 0,5–0,6 |
| meia carga | ~1 s | 0,65 |
| cheio | 2,5 s | 1,0 |
| limite (estágio 4) | 6,5 s | 3,0 |
| espaguetificação / horizonte (5–6) | 8 / 9,5 s | 4 / 5 |
| **colapso (7)** | 11 s | **instakill** |

## 2. Onde pega (D2)
O centro do corpo **dentro do raio do furo** (`< r`) → **em cheio** (×1); só **de raspão** (entre `r` e `r + 0,45 m`) → **×0,5**. O colapso ignora isto (mata de raspão também).

## 3. A resistência de cada ser (D3)
`damage(e, D·onde / resistência)` — a resistência é o `D` que tira 100% da vida dele. Quantos tiros **em cheio** para matar:

| ser | resistência | toque | **médio-fraco** | cheio | limite | colapso |
|---|---|---|---|---|---|---|
| morador (humano) | 0,3 | morre | morre | morre | morre | morre |
| andarilho transumano | 0,4 | 2 | morre | morre | morre | morre |
| vida de silício baixa | 0,8 | 3 | 2 | morre | morre | morre |
| vida de silício média | 2 | 7 | 4 | 2 | morre | morre |
| vida de silício alta | 5 | 17 | 9–10 | 5 | 2 | **morre** |
| **Safeguard baixo** (o de hoje) | 0,5 | 2 | **morre** | morre | morre | morre |
| **Safeguard médio** | 1,5 | 5 | **3** | 2 | morre | morre |
| **Safeguard alto** | 4 | 14 | **7–8** | 4 | 2 | **morre** |

- **Baixo**: um médio-fraco mata (pedido do usuário).
- **Médio**: precisa de vários médio-fracos (3) ou de um tiro cheio e meio; a sobrecarga mata.
- **Alto**: vários tiros — 4 cheios, 2 no limite; os estágios 5–6 matam de um tiro (D 4–5), mas **custam o braço** ([[Recuperar-o-braco]]).
- **A vida de silício** tem os mesmos três níveis, um pouco mais dura que o Safeguard do mesmo nível (é a ameaça a todos — [[NPCs-e-Safeguards]]); números para ajustar jogando.
- **O colapso mata qualquer um** — e também custa o braço. A arma continua overpowered: o preço é o braço, o tempo carregando (11 s, andando a 60%) e o risco de ser pego enquanto carrega ([[Movimento-dos-inimigos]]).

## 4. Ferido, morto — e as vilas (D4)
- **Ferido** (levou dano e não morreu): **cambaleia** (~0,6 s, uma pose de recuo em `world/bodies.js`) e solta faíscas (Safeguard, silício) ou faz um baque (humanos); **a vida dele não volta** (nada de regeneração dos seres, por enquanto).
- **Safeguard ferido**: não foge — continua a caçada; o alerta do setor sobe como hoje (`player:beam`).
- **Andarilho**: ferido, foge (o estado `flee` de `world/npcs.js`); **morto, a troca com ele simplesmente se perde** (não há mais com quem trocar). Nenhuma outra consequência.
- **Morador fora de uma vila**: como o andarilho.
- **Morador numa vila — ferido OU morto: a vila inteira fica hostil.**
  - Os outros moradores **atacam**: entram na regra dos hostis da [[Barra-de-vida]] (§3 — o golpe de curta distância com arremesso), com **força de humano: −25% da vida** por golpe (o Safeguard tira 50%). Zerou por moradores → o desmaio dos NPCs ([[Queda-e-despertar]]: eles ficam com algo seu), mas **você acorda longe da vila**, não nela.
  - **As trocas da vila fecham** — inclusive refazer o braço ([[Recuperar-o-braco]] R5) — e uma vila hostil **não é mais lugar de despertar**.
  - **Para sempre** naquele mundo (salvo em `slot`, por vila).
  - O aparelho avisa ao ferir o primeiro: "a vila viu" — sem aviso antes (atirar é escolha).
- **O que não muda**: o corte no mundo (o furo, a brasa, os detritos), o alcance, o raio, o gasto, o coice e a sobrecarga. O modo Livre também usa o dano variável.

## Implementação
1. `app/beam.js` `fire`: no lugar de `kill`, `damage(e, D·onde / resist(e), 'beam')`; `D` em `shotOf(k, o)` (campo novo `dmg`; `Infinity` no estágio 7); `onde` = 1 ou 0,5 pela distância ao eixo.
2. `resist(e)` pelo tipo e nível (tabela em `world/entities.js`, junto do `hp`); o nível (`e.level`: baixo/médio/alto) dos Safeguards e da vida de silício vem de [[Movimento-dos-inimigos]].
3. Ferido: a pose de recuo e as faíscas no `being:hurt` com `cause: 'beam'`; Safeguard segue na caçada; andarilho/morador foge.
4. Vilas: `being:hurt`/`being:die` de um morador dentro de uma vila → `slot.villages[id].hostile = true`; os moradores dela passam ao estado hostil (o golpe com arremesso, −25%); a conversa recusa; o despertar pula vilas hostis.
5. `lastShot.kills` continua; ganha `hurt`.
6. **Testes** — `check:beam` caso `dano`: Safeguard baixo morre com médio-fraco (0,7 s); médio sobrevive a 2 médio-fracos e morre no 3º; alto sobrevive ao cheio (sobra 75%); colapso de raspão mata o alto; raspão ×0,5. `check:npcs`: ferir um morador numa vila → a vila hostil, a conversa recusa, o despertar não vai para ela; matar um andarilho → nada além.

## Andamento

- **Feito (2026-10-04)**:
  - `app/beam.js` `shotOf().dmg` (D1) — o colapso é `Infinity`; em cheio ×1, de raspão ×0,5 (D2); `entities.damage(e, D·onde / resistOf(e))`.
  - `world/levels.js`: a resistência (D3) e o nível de cada um (`e.level`). **Escolha de implementação**: o Safeguard baixo com resistência **0,48** (não 0,5) — o médio-fraco mais curto (0,6 s) dá D 0,501, no fio; assim o "médio-fraco mata o baixo" não depende de arredondamento.
  - **A distribuição** (aprovada: só baixos perto do começo; médios e altos longe, fundo, perto das únicas): `levelAt` — uma nota `s = distância do começo da travessia / 4 km + 0,9 × camadas abaixo + 0,8 se a < 600 m de uma única`; abaixo de 0,5 só baixos; depois, P(alto) = (s − 1)·0,2 até 35%, P(médio) = (s − 0,5)·0,4 até 55%. Pelo hash do lugar: o mesmo lugar, o mesmo nível. Números para ajustar jogando.
  - Ferido (D4): cambaleia 0,6 s (`world/bodies.js` `stagger`); faíscas nos Safeguards e na vida de silício, um baque nos humanos; o andarilho foge; a vida de silício disfarçada se mostra; Safeguard ferido segue caçando (e o arranque recomeça de baixo).
  - **Vila hostil** (§4): `slot.villages[id].hostile` ao ferir ou matar um morador com o emissor; "A VILA VIU" no aparelho; os moradores vêm e golpeiam (−25%, o arremesso — `app/health.js` `struck`, o mesmo golpe dos Safeguards); sem conversa, fora das vilas habitadas (sem carga para ela, sem despertar nela). Zerou por eles: o desmaio com taker `npc` — acorda noutra vila. No Livre sem a vida, o golpe deles só arremessa.
  - **Ainda não**: o jogador não distingue os níveis de longe — o corpo é o mesmo; o design por nível é do [[Rework-grafico]] (decidido). Se pesar jogando, dá para adiantar uma diferença simples (tamanho, uma luz).
- **Testes**: `check:beam` parte `dano` (`--beampart=dano`): baixo morre com médio-fraco · médio 63% → 26% → morre · alto sobra 75% no cheio · colapso de raspão mata o alto · raspão ×0,5 · silício baixo morre no 2º médio-fraco · **fuga**: o baixo a 13 m, andando para trás, dá um cheio e morre; o médio chega em ~1,9 s (antes do cheio). `check:npcs`: `hostil` (salvo, fora das vilas, sem conversa, golpe de humano −25%) e `andarilho` (ferido foge; morto, nada além).
