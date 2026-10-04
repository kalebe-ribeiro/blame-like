---
status: feita (2026-10-04) — V1–V7, quedas pela altura, o emissor, o golpe com arremesso; check:health 12/12
prioridade: — (feita)
tags: [futuro, gameplay, vida, arma, safeguards, quedas, animacao]
---

# Barra de vida

> Pedido do usuário (2026-10-03): "a arma não é pra se perder na potência máxima. Se for pra ter um drawback, vai ser numa futura barra de vida. Planeje essa barra de vida no cofre." — o custo da sobrecarga do emissor ([[Arma-do-Killy]]) sai do braço (que se perdia por 90 s) e vem para cá.
>
> **Decidido (2026-10-03, usuário):** "gostei de todas" (V1–V7, §9) — "altere e adicione somente alguns detalhes aos ataques dos NPCs" (§3) · "com a adição da barra de vida, a queda agora tem dano, a partir de certa altura, até o limiar do desmaio" (§4) · as animações por enquanto únicas, com as variações registradas para depois (§5) · e o grande rework gráfico depois de toda a gameplay ([[Rework-grafico]]).
>
> **Revisto (2026-10-03, usuário):** (1) **o choque contra um obstáculo pelo próprio coice do emissor não tira vida** — só o arremesso de um hostil (§2); (2) **a queda corrigida** (§4): a nota dizia "14 m/s ≈ 10 m de queda", mas a gravidade do jogo é **15 m/s²** (`controls/walker.js`), não 9,8 — 14 m/s seriam ~6,5 m. Agora a regra é **pela altura**: dano a partir de 10 m de queda.

## 1. A ideia

O corpo do jogador aguenta muito — como o de Killy, que se desfaz e se refaz —, mas não infinitamente. Uma **vida** (0–100%) que cai com o que machuca e volta devagar sozinha. **Zerar não é fim de jogo**: é o desmaio que já existe ([[Queda-e-despertar]] — `app/wake.js`): o corpo cai, é arrastado e descartado, e você acorda noutro lugar, com os custos já decididos (Safeguards: perde a energia e a carga; NPCs: ficam com algo; ninguém: só o deslocamento). **No despertar, a vida volta cheia.**

Separada da **célula de energia** (luz, sensor, leitor, emissor): a célula é o que você gasta; a vida é o que o mundo (e o emissor) tira de você.

## 2. O que machuca

| fonte | hoje | com a vida |
|---|---|---|
| **o golpe de um hostil** (hoje: Safeguards — §3) | o toque = captura (desmaio, cemitério) | **um golpe de curta distância com arremesso: tira METADE da vida** (50%) e joga o corpo longe; o que acontece depois depende de onde ele cai (§3) |
| **quedas** (§4) | > 38 m/s: desmaio direto | **dano a partir de 10 m de queda** (17,3 m/s de impacto), crescendo com a altura até **100% em 38 m/s** (~48 m) — o limiar do desmaio de hoje |
| **bater num obstáculo — só arremessado por um hostil** (§3) | um baque (`walker.onSlam`) | dano acima de ~12 m/s contra o obstáculo, crescendo com a velocidade (~25% a 30 m/s) |
| **bater num obstáculo pelo próprio coice do emissor** | um baque | **sem dano** (decidido 2026-10-03) — o baque, o tremor e o som continuam. Se o empurrão te tira de uma plataforma, **a queda** conta (§4) — **confirmado pelo usuário (2026-10-03)** |
| **sobrecarga do emissor** | nada até o limite; além do limite (5–7) o braço que atira é perdido — [[Recuperar-o-braco]] | dano pelo estágio: azul 0 · violeta 5% · a singularidade se formando 12% · limite 30%; a mão queima, a mira treme uns segundos, **a arma continua na mão**; além do limite o braço se perde (como hoje) e o dano é o do limite |
| **o feixe de outro** (futuro: hostis armados) | — | (sem tiro inimigo por enquanto — ver §3) |

## 3. O golpe dos hostis — o arremesso

> Usuário: "o golpe (curta distância por enquanto, sem mecânica de tiro inimigo) deverá iniciar uma animação, onde o NPC hostil vai atacar o usuário e arremessar ele. Isso deve arrancar metade da vida do jogador. A partir desse arremesso, devem [haver] alguns caminhos: ele cair da estrutura, e acabar sofrendo o desmaio da queda; ele cair no chão normalmente, no mesmo plano, sem ter caído de uma estrutura; ele colidir com um obstáculo."

**Hostis**: hoje os Safeguards (a caçada da fase 6); **os moradores de uma vila que você feriu** (golpe de humano: **−25%**, não 50% — [[Dano-do-emissor]] §4); no futuro, os outros que forem hostis (ver [[NPCs-e-Safeguards]]). A velocidade com que chegam: [[Movimento-dos-inimigos]]. **Só curta distância** — nada de tiro inimigo por enquanto.

### 3.1 O golpe (a animação)
1. **Alcance**: o hostil em caçada chega a ~1,5 m (a distância do toque de hoje). No lugar da captura imediata, começa o **golpe**.
2. **Preparação** (~0,35 s): o hostil para, gira para você e recolhe o braço (o corpo dele — `world/bodies.js` — já tem pose de agarrar: o golpe é uma pose nova). A câmera percebe: um tranco curto de alerta, o som do metal (Safeguard: o zumbido que sobe).
3. **O impacto**: o braço vem; **−50% da vida**; vibração forte; a tela pisca o escuro (`uBlack` por um instante) e a visão borra um pouco (`uBlur`).
4. **O arremesso**: o corpo do jogador é jogado **para longe do hostil** — um impulso horizontal (~12–16 m/s, na direção do golpe) e para cima (~4–6 m/s). **O controle sai** durante o voo (o corpo vai, a câmera gira/tomba um pouco, sem você comandar); volta ao tocar o chão (depois de se levantar — §3.2).
5. O hostil, depois do golpe, **espera um pouco** (~1,5–2 s) antes de vir de novo — dá a chance de fugir ferido.

### 3.2 Os três caminhos depois do arremesso
A física decide (o arremesso é um impulso de verdade no `Walker` — o mesmo empurrão do coice do emissor, `walker.shove` — e o mundo resolve onde ele termina):

| caminho | o que acontece |
|---|---|
| **cai da estrutura** (o arremesso leva o corpo para fora da plataforma/passarela) | a queda segue a regra das quedas (§4): o impacto lá embaixo tira vida pela altura — e uma queda grande **zera e desmaia** ([[Queda-e-despertar]]: a sequência inteira, acorda noutro lugar) |
| **cai no chão, no mesmo plano** | aterrissa, rola/desliza um pouco, fica **caído ~1 s** (a câmera baixa, perto do chão) e se levanta; nenhum dano além dos 50% do golpe (o salto é baixo — abaixo do limiar das quedas) |
| **bate num obstáculo** (parede, pilar, corrimão no caminho) | para de repente (o `_slide` do `Walker` já para o corpo na parede); dano pelo choque (§2: ~12 m/s em diante) e o mesmo caído ~1 s; a câmera dá o tranco |

- **Zerou** (o segundo golpe, ou golpe + queda, ou golpe + obstáculo): o desmaio. Se foi um hostil que zerou, é **a captura de hoje** (a animação de ser agarrado — `wake 'caught'` — e o cemitério de vítimas, com os custos dos Safeguards). Se foi uma queda, a sequência da queda.
- Com 100%, **dois golpes zeram** (50% + 50%) — menos, se a queda ou o obstáculo ajudarem.

## 4. Quedas com dano — pela altura
- Hoje: impacto > 38 m/s (`app/body.js` `LETHAL_IMPACT`) → desmaio direto; abaixo disso, só tremor e som.
- **A física do jogo**: gravidade **15 m/s²** e queda máxima de **60 m/s** (`controls/walker.js`, `vel.y - 15·s·dt`, teto `-60·s`). Então impacto `v` ↔ altura `h = v² / 30` (até o teto, ~120 m).
- **A regra** (decidida 2026-10-03): o dano é proporcional à **energia** do impacto (`v²` — a altura caída), não à velocidade:
  - **abaixo de 10 m** (v < 17,3 m/s): nada;
  - **de 10 m a ~48 m** (17,3 → 38 m/s): `dano = (v² − 300) / (1444 − 300)`;
  - **acima de 38 m/s**: zera — o desmaio de sempre (o `LETHAL_IMPACT` não muda).

| queda | impacto | dano |
|---|---|---|
| 6,5 m | 14 m/s | 0 |
| 10 m | 17,3 m/s | 0 (o limiar) |
| 20 m | 24,5 m/s | 26% |
| 30 m | 30 m/s | 52% |
| 40 m | 34,6 m/s | 79% |
| 48 m | 38 m/s | 100% — desmaio |

- Na conta entra só a componente **vertical** do impacto (`vel.y` no pouso) — o empurrão do emissor é horizontal e decai à parte (`walker.shove`), não vira dano de queda por si.
- Uma queda média com a vida já baixa também zera.
- O pulo normal (5,4 m/s → ~1 m) e o arremesso de um hostil no mesmo plano (4–6 m/s para cima → ~1,2 m) ficam bem abaixo do limiar — conferido com a gravidade de 15.
- O que já existe continua: o som do pouso, o tremor, o "afundar" da câmera (`motionFx`).
- **De onde vem o número**: o `Walker` já entrega os dois no pouso — `onLand(impact, height)`, com o impacto **já dividido pela escala** `s` do corpo (`walker.js` ~l. 231). Usar o **impacto** (`v²/30` = a altura equivalente), não o `height` (`fallStartY − feet.y`): o `height` é zerado por escadas, quinas e vagões e não vê o empurrão para cima do emissor (atirar para baixo joga até 7 m/s para cima); o impacto mede a energia que de fato chegou ao chão.

## 5. As animações — por enquanto uma só, as variações registradas
> Usuário: "as animações devem ser default única por enquanto, mas deixe registrado que deverão haver variações, tanto por ângulo do ataque (por trás, de frente, de baixo, lateral, com pelo menos 2 variações de cada ângulo), tipo de NPC etc."

**Agora**: um golpe e um arremesso padrão (o hostil de frente para você; o arremesso para longe dele, qualquer que seja o ângulo).

**Depois** (registrado — entra com o [[Rework-grafico]] ou antes, se a gameplay pedir; o design e a animação de cada hostil também variam **pelo nível** e dentro do mesmo nível — ver lá):
| eixo | variações (mínimo) |
|---|---|
| **ângulo do ataque** | **por trás** (2+) · **de frente** (2+) · **de baixo** (2+ — de um nível abaixo, agarrando a borda, por um vão) · **lateral** (2+, esquerda e direita) |
| **tipo de NPC** | cada tipo de Safeguard; a vida de silício; os hostis futuros — golpe, alcance e força próprios |
| **outros** (etc.) | a situação (na borda, numa escada, no ar, carregando uma carga), a força (empurrão × arremesso × agarrar), o jogador caído — a escolher na hora |

## 6. Voltar (regeneração)
- **Só o tempo** (V4): ~1%/s depois de 6 s sem dano — de 0 a cheio em ~2 min.
- O efeito visível: a mão do emissor vai de queimada a normal; a respiração acalma.

## 7. Como se vê e se ouve
- **No aparelho, ao lado da carga** (V1 — a interface diegética: [[Interface-diegetica]]).
- **Só quando muda** (V2): aparece ao levar dano e some uns segundos depois de cheia.
- **O corpo fala**: com pouca vida, as bordas da tela fecham um pouco (`uFaint`, fraco), a imagem perde foco de leve (`uBlur`), batimento e respiração (`audio.heartbeat` já existe); a mira treme.
- **Controle**: nada novo de entrada. A REGRA do controle vale para qualquer painel que mostrar a vida.

## 8. Modos e a arma
- **Peregrinação**: vida ligada. **Livre**: sem vida (V5 — uma opção nas configurações para ligar).
- **A arma** (V6): o disparo em sobrecarga tira vida pelo estágio (§2); **atirar no limite com pouca vida pode zerar** — o risco é a escolha. A sobrecarga continua igual (estágios, cores, a singularidade, o furo, o empurrão).

## 9. Decisões — aprovadas (2026-10-03)

| #   | pergunta | decidido |
| --- | --- | --- |
| V1  | onde mostrar a vida | no aparelho, ao lado da carga (diegético) |
| V2  | sempre visível ou só quando muda | só quando muda (some cheia) |
| V3  | Safeguards: golpes ou captura imediata | **golpes — cada um arremessa e tira 50%** (§3); zerou por um hostil → a captura de hoje |
| V4  | regeneração | só o tempo (~1%/s depois de 6 s) |
| V5  | modo Livre com vida? | não (opção nas configurações) |
| V6  | o tiro no limite pode zerar a vida? | pode — o risco é a escolha |
| V7  | os números | os das tabelas, para ajustar jogando |

## 10. Implementação (ordem proposta)
1. **A vida** — `ctx.player.health = { value: 1, max: 1 }` (salva no slot — `app/player.js`); `app/health.js`: `damage(fonte, quanto)`, `heal`, a regeneração, eventos `player:hurt` / `player:healed`; ao zerar, o desmaio (`ctx.wake.start(...)` com a causa certa) e a vida cheia no despertar; o aparelho mostra (V1/V2); os sinais do corpo (§7).
2. **Quedas com dano** (§4) — `app/body.js` `onLand`, pela altura (`v²`); e o obstáculo — `walker.onSlam` **só durante o arremesso de um hostil** (uma marca no `Walker` enquanto o controle está fora; o empurrão do emissor nunca a liga).
3. **O emissor** (§2, §8) — o dano por estágio no disparo.
4. **O golpe e o arremesso** (§3) — o estado novo do Safeguard (`world/safeguards.js`: em vez de `onCatch` no toque, o golpe; a pose nova do corpo em `world/bodies.js`); o arremesso no `Walker` (impulso + controle fora até pousar; caído ~1 s); a captura só ao zerar; o hostil esperando depois do golpe.
5. **Testes** — `npm run check:health` (novo): dano por queda em alturas conhecidas (9 m nada; 20 m ≈ 26%; 30 m ≈ 52%; 50 m zera), o choque no obstáculo arremessado (com dano) **e pelo coice do emissor contra uma parede (sem dano)**, a sobrecarga por estágio, a regeneração no tempo, zerar → desmaio → acorda cheio; **o golpe**: um Safeguard de teste golpeia o jogador em três lugares preparados — no meio de uma plataforma larga (cai no mesmo plano: 50%), perto de uma borda alta (cai da estrutura: zera e desmaia), de costas para uma parede próxima (bate: 50% + o choque); e o segundo golpe zera → a captura. Mais `check:safeguards` (as rondas e a caçada continuam), `check:beam`, `check:pad` (o aparelho).

## 11. Andamento

- **Feita (2026-10-04)**, na ordem do §10:
  1. **A vida** — `app/health.js`: `player.health` (salva no slot), `damage(fonte, quanto)`, a regeneração (1%/s depois de 6 s), `player:hurt` / `player:healed` / `player:zero`; zerou → o desmaio; no despertar, cheia. Ligada na Peregrinação; no Livre, a opção "vida no modo Livre" nas configurações (V5) — sem o aparelho, uma linha no HUD ("VIDA n%"). **No aparelho**: um traço contínuo abaixo dos gomos da carga, só quando muda (V1/V2); abaixo de 35% pisca. **O corpo fala**: a tela pisca o escuro ao levar dano (`uBlack`), o foco borra (`uBlur`), com pouca vida as bordas fecham (`uFaint`, somado ao do emissor) e o coração bate (`audio.heartbeat`).
  2. **Quedas** — `app/body.js` `onLand`: `fallDamage(impacto)` (energia, `v²`; de 10 m a 38 m/s). Sem a vida (Livre), a regra de antes (> 38 m/s desmaia). O choque — `walker.onSlam` — só tira vida com `walker.thrown`.
  3. **O emissor** — `app/beam.js` `fire`: `BEAM_DAMAGE[estágio]` (`lastShot.hurt`); a mira treme uns segundos (proporcional ao dano). Carregar fica bloqueado enquanto se é arremessado.
  4. **O golpe** — `world/safeguards.js`: o estado `strike` (a ~1,5 m: preparar 0,35 s girando para você → o braço em 0,15 s → recolher 0,4 s → **esperar 1,5–2 s**); **se você saiu para mais de 2,3 m durante a preparação, ele erra** (escolha de implementação: a chance de esquivar). A pose nova em `world/bodies.js` (`strike(w, s)`: o braço direito recolhido com o tronco torcido; depois cruzando à frente do peito). `app/safeguards.js`: −50%, o arremesso (`walker.throwBody`: 12–16 m/s para longe dele, 4–6 m/s para cima; o controle sai até pousar; caído ~1 s com os olhos rente ao chão) e a captura de antes só ao zerar.
  5. **Testes** — `npm run check:health` 12/12 (ver [[10-Comandos-e-Verificacao]]); `check:safeguards` 9/9 (a captura agora vem pelo segundo golpe).
- **Imagens conferidas**: o traço da vida no aparelho (30%), e as três poses do golpe lado a lado (`--strikepose=cycle,N` com `--capture`; `--hurt=v` põe a vida em v aos 5 s).
- **Observação para jogar**: com os números decididos (arremesso de 12–16 m/s, choque a partir de 12 m/s, ~25% a 30 m/s), **bater num obstáculo arremessado tira pouco — de 0 a ~5%** (medido: 0,8–2,8%). Se o choque deve pesar mais, é baixar o limiar ou subir a inclinação (V7: ajustar jogando).
