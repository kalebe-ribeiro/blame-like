---
status: proposta (planejada — pedido do usuário, 2026-10-03); decisões V1–V7 em aberto
prioridade: a decidir
tags: [futuro, gameplay, vida, arma, safeguards]
---

# Barra de vida

> Pedido do usuário (2026-10-03): "a arma não é pra se perder na potência máxima. Se for pra ter um drawback, vai ser numa futura barra de vida. Planeje essa barra de vida no cofre." — o custo da sobrecarga do emissor ([[Arma-do-Killy]]) sai do braço (que se perdia por 90 s) e vem para cá.

## 1. A ideia

O corpo do jogador aguenta muito — como o de Killy, que se desfaz e se refaz —, mas não infinitamente. Uma **vida** (0–100%) que cai com o que machuca e volta devagar sozinha. **Zerar não é fim de jogo**: é o desmaio que já existe ([[Queda-e-despertar]] — `app/wake.js`): o corpo cai, é arrastado e descartado, e você acorda noutro lugar, com os custos já decididos (Safeguards: perde a energia e a carga; NPCs: ficam com algo; ninguém: só o deslocamento).

Separada da **célula de energia** (luz, sensor, leitor, emissor): a célula é o que você gasta; a vida é o que o mundo (e o emissor) tira de você.

## 2. O que machuca (proposta)

| fonte | hoje | com a vida |
|---|---|---|
| **sobrecarga do emissor** | nada (o braço se perdia — retirado) | dano pelo estágio: azul 0 · violeta 5% · a singularidade se formando 12% · **limite 30%** — o braço "se desfaz" (a mão queimada, a mira tremendo alguns segundos), mas a arma continua na mão |
| **quedas** | > 38 m/s: desmaio direto | dano a partir de ~14 m/s, crescendo até 100% em 38 m/s (o desmaio de hoje vira "a vida zerou") |
| **empurrão contra a parede** (o coice do emissor) | um baque | dano acima de ~20 m/s contra a parede (`walker.onSlam` já existe) |
| **Safeguards** | o toque = captura (desmaio, cemitério) | golpes tiram vida; a captura acontece quando zera — ou continua imediata (V3) |
| **o feixe de outro** (futuro: Safeguards armados, Killy-like NPCs) | — | dano por proximidade do traço |

## 3. Voltar

- **Regeneração lenta e sempre** (o corpo de Killy se refaz): proposta ~1%/s depois de 6 s sem dano — de 0 a cheio em ~2 min.
- Mais rápida **parado no escuro**? perto de uma **tomada**? gastando **célula**? (V4)
- O efeito visível: a mão do emissor vai de queimada a normal conforme regenera; a respiração acalma.

## 4. Como se vê e se ouve

- **Barra**: fina, sem moldura de jogo, no canto do HUD (o mesmo estilo dos textos do HUD — monoespaçado, cinza) — ou **dentro do aparelho**, ao lado da carga (o aparelho já é a interface diegética: [[Interface-diegetica]]). (V1)
- **Sem barra quando cheia**? aparece ao levar dano e some depois de alguns segundos cheia. (V2)
- **O corpo fala**: com pouca vida, as bordas da tela fecham um pouco (o `uFaint` do desmaio, fraco), a imagem perde foco de leve (`uBlur`), batimento e respiração (`audio.heartbeat` já existe); a mira treme.
- **Controle**: nada novo de entrada. A REGRA do controle vale para qualquer painel que mostrar a vida.

## 5. Modos

- **Peregrinação**: vida ligada.
- **Livre**: sem vida (como hoje: sem custos) — ou uma opção nas configurações. (V5)

## 6. A arma com a vida (o que muda no emissor)

- A sobrecarga continua igual (estágios, cores, a singularidade, o furo de 7,7 m, o empurrão de ~95 m/s).
- No disparo em sobrecarga: `health.damage('emissor', dano do estágio)`; a mão queima e a mira treme por uns segundos — **sem bloquear a arma**.
- **Atirar no limite com pouca vida pode zerar** — o desmaio. É o "drawback" no lugar do braço perdido. (V6: pode zerar, ou o emissor recusa o limite se o tiro mataria?)

## 7. Implementação (quando for decidido)

- `ctx.player.health = { value: 1, max: 1 }` — salva no slot com o resto do `player` (`app/player.js`).
- `app/health.js`: `damage(fonte, quanto)`, `heal(quanto)`, a regeneração no `update`, eventos `player:hurt` / `player:healed`; ao zerar, `ctx.wake.start('impact', …)` — e a vida volta cheia no despertar.
- HUD (`ui/hud.js`) ou o aparelho (`app/carried.js`) — conforme V1.
- `app/body.js` (quedas → dano em vez de desmaio direto), `app/beam.js` (sobrecarga), `app/safeguards.js` (golpes), `walker.onSlam`.
- Teste novo **`npm run check:health`**: dano por queda (alturas conhecidas), sobrecarga por estágio, a regeneração no tempo, zerar → desmaio → acorda cheio; e o `check:pad` se a barra entrar num painel.

## 8. Decisões para o usuário

| # | pergunta | proposta |
|---|---|---|
| V1 | onde mostrar a vida | no aparelho, ao lado da carga (diegético) |
| V2 | sempre visível ou só quando muda | só quando muda (some cheia) |
| V3 | Safeguards: golpes tiram vida, ou o toque continua captura imediata | golpes (3–4 para zerar) — dá chance de fugir ferido |
| V4 | regeneração: só o tempo, ou também tomada/célula/escuro | só o tempo (~1%/s depois de 6 s) |
| V5 | modo Livre com vida? | não (opção nas configurações) |
| V6 | o tiro no limite pode zerar a vida? | pode — o risco é a escolha |
| V7 | os números do §2 | os da tabela, para ajustar jogando |
