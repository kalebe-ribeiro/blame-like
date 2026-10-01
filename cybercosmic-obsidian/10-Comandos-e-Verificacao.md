# 10 — Comandos e verificação

## Rodar

```bash
npm install
npm start
```

## Teste de fumaça (antes de todo commit)

```bash
npm run check
npm run check:pilgrimage
```
O segundo roda o mesmo roteiro no modo Peregrinação. Seed fixa `abc`, visita todos os destinos do transporte; em cada um espera 6 s, mede 2,5 s (fps médio e pior quadro) e confere se o corpo não está em queda livre. Antes do roteiro, clica num botão de verdade do painel de transporte (a interface também é testada). Força um apagão e um colapso no meio. Erros de script/shader/WebGL reprovam. Sai com 0 ou 1. Usa um perfil temporário (não toca no salvamento).

```bash
npx electron . --check=trelica,escadaria --pos=3082,-1388,-1256
```
Só esses destinos, nessa ordem, partindo desse ponto. **Falhas dependem do ponto de partida** — ao reproduzir, use o `@ x,y,z` que o relatório imprime.

### Sem GPU (contêiner na nuvem)

Com `xvfb-run -a -s "-screen 0 1600x900x24" npx electron . --no-sandbox …` o jogo roda, mas por software, a ~1 fps. O `--check` inteiro passa do limite de 6 min do `main.js`: rode em partes (`--check=a,b,c`). O tempo do jogo anda mais devagar que o relógio, então `--read=N`/`--map=N` disparam atrasados em relação a `--delay` da captura (deixe folga, ex. `--read=30 --delay=75`).

## Medir

```bash
npx electron . --stats [--novsync] [--goto=inundado] [--autopilot=6] --seed=abc --profile=%TEMP%\cc
```
Ver o que é impresso em [[06-Render-e-Desempenho]]. Use `--profile` para não tocar no salvamento.

## Capturar imagem

```bash
npx electron . --capture=shot.png --pos=x,y,z,yaw,pitch --mode=fly --seed=abc --fog=0 --delay=25 --show
```
- `--view=spawn|abyss|up|far` pontos prontos · `--goto=<tipo>` começa transportado.
- `--fog` e `--dist` valem só na sessão.
- **Sempre `--show`** (janela oculta desacelera o loop) e `--mode=fly` quando o ponto não tem chão.
- Validar com névoa 0 / 0,3 / 1 ([[02-Direcao-de-Arte]]).

## Outras flags

`--game=free|pilgrimage` (modo de jogo da sessão), `--sensor=terminal|energy|motion` (sensor já ligado), `--map=N` (abre o mapa aos N s), `--wake=N` (desmaio aos N s), `--lantern` (lanterna acesa), `--read=N` (abre a leitura do terminal em frente), `--mark=N` (pinta uma marca onde se olha aos N s), `--ride=N` (aos N s põe o corpo numa longarina da máquina mais perto e mede se ele vai junto; use com `--goto=colosso`), `--restore=N` (religa o setor da subestação em frente aos N s; use com `--goto=subestacao`), `--lexicon=N` (entende as palavras até a classe N, só na sessão), `--archive=records|leads|lexicon` (aba do diário), `--gate` (captura com a tela de entrada aberta — para conferir textos e painéis), `--outage=4` / `--collapse=4` (força o evento aos N s), `--body=N` (um corpo de teste aos N s; `--bodydist=200`, `--bodyseed=1`, `--follow` a câmera atrás dele, `--followside` de lado na altura do joelho), `--gounique=village|graveyard|cradle|…` (a estrutura única desse tipo mais perto), `--wakeas=safeguard|npc` (força o sorteio do despertar), `--sgwatch` (estado dos Safeguards a cada 3 s), `--sgnear=N` (aos N s, de pé no circuito do Safeguard de ronda mais perto, `--sgdist` m à frente dele), `--sgcam=N` (a câmera, voando, acompanha o Safeguard mais perto de frente; com `--followside`, de lado), `--sgemerge=N` (força um caçador sair de uma parede), `--autopilot=N`, `--mode=fly`, `--seed=<base36>`, `--profile=<pasta>`, `--novsync`.

## Git

- Repositório público: https://github.com/kalebe-ribeiro/blame-like (branch `main`).
- `.gitattributes` normaliza para LF (os avisos "CRLF will be replaced" são normais).
- Mensagens de commit em inglês, terminando com `Co-Authored-By: Claude …`.

- `npm run check:pad` — o controle sozinho, nos dois modos (`dev/padtest.js`): um controle falso navega a tela de entrada, configurações, aba CONTROLES (troca um botão), abas do diário, transporte, mapa, tela cheia, leitura, lanterna e MUNDOS. **Rodar sempre que mexer em interface ou teclas** (regra absoluta).

- `npm run check:beings` — os seres (`dev/beingtest.js`): 4 corpos de teste em plataformas da teia andam ~200 m cada até um destino; reprova se empacam, se perdem, caem, atravessam parede ou chegam longe. Uns 7 min (andam de verdade). Rastro a cada 10 s (`BEING …`).

- `npm run check:safeguards` — os Safeguards na Peregrinação (`dev/sgtest.js`): rondas, visto, captura (acordar no cemitério), escondido (perde o rastro), parede (saem e voltam), chamado, fiscal (nada atravessa parede nem cai). ~4 min.

- `npm run check:npcs` — os raros vivos na Peregrinação (`dev/npctest.js`): vila, conversa, carga, entrega, despertar numa vila, andarilhos, ladrão, vida de silício, terceira força, fiscal. ~8 min (teleporta entre vilas a dezenas de km).

- `npm run check:beam` — o emissor de feixe (`dev/beamtest.js`): potência, camada, única, buraco atravessável, morte, 5 tiros. ~3 min.
- `npm run check:climb` — as quinas (`dev/climbtest.js`): vault e agarrar em quinas de verdade em vários destinos, pegar a borda de uma plataforma e o piso de uma ponte suspensa caindo. ~6 min.

## Qual check rodar (pedido do usuário, 2026-09-30)

Cada check leva minutos: rodar **só os pertinentes** à mudança.

| mudança | check |
|---|---|
| geração do mundo, shaders, render | `npm run check` (ou `--check=<destinos>` do que mudou) |
| mecânica da Peregrinação (célula, lanterna, leitura, pistas, sensor, subestação, despertar) | `npm run check:pilgrimage` (+ `check` se tocou código comum) |
| teclas, bindings, interface, painéis, navegação pelo controle | `npm run check:pad` (obrigatório — regra absoluta do controle) |
| seres: entidades, navegação, corpos, `Walker` (e mudanças na rede andável ou nas passarelas, que o grafo espelha) | `npm run check:beings` |
| Safeguards: rondas, percepção, caçada, captura, paredes, alerta, despertar | `npm run check:safeguards` (+ `check:beings` se mexeu nas entidades) |
| NPCs: vilas, conversa, cargas, andarilhos, vida de silício | `npm run check:npcs` (+ `check:pad` se mexeu no painel da conversa) |
| arma: `app/beam.js`, `world/holes.js`, buracos nos shaders | `npm run check:beam` (+ `check` pelos shaders) |
| movimento do corpo: quinas, `Walker` | `npm run check:climb` (+ `check:beings` — os seres usam o mesmo `Walker`) |
| só textos/i18n, documentação, cofre | nenhum (no máximo importar o módulo) |
| mudança que toca tudo | os três |

