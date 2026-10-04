---
status: decidida (2026-10-04) — aceleração e velocidade terminal, mais rápidos que hoje; M1–M4 e a distribuição dos níveis aprovados (números para ajustar jogando)
prioridade: alta — junto do [[Dano-do-emissor]] (é o que equilibra a arma)
tags: [futuro, safeguards, npcs, movimento, dificuldade]
---

# O movimento dos inimigos — a dificuldade

> Usuário (2026-10-04): "o nível de dificuldade vai se dar por conta da movimentação dos NPCs. Faça uma nota que os inimigos têm que se mover mais rápido, com uma aceleração e velocidade terminal, e não velocidade constante desde o início. Então vai ser mais difícil ficar atirando sem ser pego."
>
> **Aprovado (2026-10-04, usuário):** M1–M4 e a distribuição dos níveis como propostos; **a vida de silício também em três níveis** (M4).

## Por quê
A arma é overpowered de propósito ([[Dano-do-emissor]]): de perto, quase tudo morre. O que deixa o jogo difícil é **não ter tempo de carregar**: carregando você anda a 60% (C2 — [[Arma-do-Killy]]), sem correr nem pular, e um tiro forte pede segundos. Inimigos que ganham velocidade transformam cada segundo de carga numa aposta.

## Hoje (feito)
- **Safeguard em caçada**: ~**5,2 m/s** (`world/safeguards.js` `HUNT_SCALE` 1,25 × 4,2 m/s do `Walker`), atingidos em ~0,1 s — na prática **velocidade constante desde o início** (o `Walker` puxa a velocidade para o alvo a 12/s no chão — `controls/walker.js` ~l. 174).
- Ronda ~`PATROL.speed`; voltando à ronda, ×1,4–1,6.
- **O jogador**: anda 4,2 m/s, **corre 8,5 m/s**, carregando o emissor ~2,5 m/s. → **Hoje correndo você sempre escapa de um Safeguard.**
- Os moradores e andarilhos andam a ~2,3 m/s (`entities.js`, `speedScale 0,55`).

## A regra (decidida)
- Os inimigos **arrancam e aceleram**: começam devagar (ou na velocidade da ronda) e ganham velocidade com **uma aceleração** até **uma velocidade terminal**.
- A terminal é **maior que a corrida do jogador** a partir do Safeguard médio — fugir em linha reta deixa de bastar; o que salva é **quebrar a corrida** (curvas, quinas, escadas, vãos, portas, elevadores).
- **Curvas custam**: virar forte faz o inimigo perder velocidade (tem de acelerar de novo). Isso é o que dá ao jogador uma saída — e é o "jogo" da fuga.
- **Parar, perder a vista**: desacelera até a ronda; o próximo arranque começa de baixo de novo.

## Os números (aprovados — para ajustar jogando)

**M1 — por nível de Safeguard** (os níveis são os mesmos do [[Dano-do-emissor]]):

| nível | velocidade inicial | aceleração | terminal | até a terminal | comparado ao jogador |
|---|---|---|---|---|---|
| **baixo** (o de hoje) | 3 m/s | 2,5 m/s² | **8 m/s** | ~2 s | um pouco mais lento que a sua corrida (8,5): correndo, escapa — mas por pouco |
| **médio** | 3 m/s | 4 m/s² | **11 m/s** | ~2 s | **mais rápido** que a sua corrida |
| **alto** | 4 m/s | 7 m/s² | **14 m/s** | ~1,4 s | muito mais rápido; só quebrando a corrida |

**M2 — curvas**: a velocidade cai com o ângulo da curva (proposta: `v ← v · (0,5 + 0,5·cos θ)` por mudança de direção acima de 30°, θ = o ângulo virado); subir/descer escada e entrar em elevador zeram (o arranque recomeça).

**M3 — o que isso faz com a carga** (de onde ele começa a correr, parado, até te alcançar; você carregando, andando para longe a 2,5 m/s):

| nível | a 15 m | a 30 m |
|---|---|---|
| baixo | ~3,4 s (dá um cheio de 2,5 s; não dá o limite) | ~6,1 s |
| médio | ~2,5 s (o cheio é no limite exato) | ~4,3 s |
| alto | ~1,8 s (só médio-fracos) | ~3,1 s (dá um cheio) |

(Simulado em linha reta, alcance do golpe 1,5 m, sem curvas — o teste mede de verdade.) Ou seja: contra o alto, **ou** um tiro cheio de longe, **ou** vários médio-fracos rápidos, **ou** quebrar a corrida antes de carregar.

**M4 — os outros hostis**: **moradores de uma vila hostil** ([[Dano-do-emissor]] §4) — humanos: inicial 2,3, aceleração 2 m/s², terminal **7 m/s** (correndo, você escapa). **Vida de silício** (quando atacar — hoje drena a célula): **três níveis também** — baixa, média e alta, com o movimento do Safeguard do mesmo nível (M1) e a resistência própria ([[Dano-do-emissor]] §3).

## Onde entra no código
- `controls/walker.js`: hoje a velocidade alvo é atingida a 12/s — para os seres, uma **aceleração limitada** (`maxAccel` no `Walker`, só dos seres; o jogador não muda) e a terminal por `speedScale`.
- `world/safeguards.js`: a caçada sobe `speedScale` com o tempo em linha (`e.huntV`), cai nas curvas (M2), recomeça em escadas/elevadores; `e.level` (baixo/médio/alto) com a terminal e a aceleração — o mesmo `e.level` na vida de silício (`world/npcs.js`); **a distribuição dos níveis (aprovada)**: perto do começo só baixos; médios e altos mais longe, nas camadas fundas e perto das únicas (o limiar exato se ajusta com o mapa).
- Os corpos (`world/bodies.js`): a animação de correr acompanha a velocidade (já é por `e.speed`).
- **Testes**: `check:safeguards` ganha `arranque` (o perfil de velocidade de cada nível em linha reta: inicial, terminal, tempo até ela) e `curva` (perde velocidade ao virar 90°); `check:beam` caso `fuga` (um médio a 15 m: carregar um cheio e atirar antes de ser pego).

## Desempenho
A caçada roda só nos perto (`tier 'near'`); os de longe continuam abstratos. A aceleração é uma conta a mais por ser por quadro — desprezível.
