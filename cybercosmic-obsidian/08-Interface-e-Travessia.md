# 08 — Interface e travessia

## Controles (aba CONTROLES — `controls/bindings.js`, `ui/controlsPanel.js`)

**Todas** as teclas e botões do controle vivem numa lista só (`ACTIONS` em `controls/bindings.js`): cada ação tem tecla, botão do controle e os modos em que existe. A aba **CONTROLES** (K, ou o botão na tela de entrada) mostra só as do modo aberto e deixa trocar: clicar e apertar; ESC cancela; BACKSPACE apaga; conflito no mesmo modo → as duas trocam (avisa). Salvo no localStorage (`cybercosmic.bindings.v1`). A tela de entrada **não lista mais teclas** (estava inchada).

| ação | teclado | controle | modo |
|---|---|---|---|
| mover / olhar | WASD / mouse | analógicos (fixos) | |
| pular · subir voando | ESPAÇO | A | |
| descer voando | CTRL | B | Livre |
| correr | SHIFT | LT | |
| andar ↔ voar / piloto automático | F / P | X / ↑ | Livre |
| ler terminal · tomada | E | Y | |
| lanterna / sensor | F / G | X / ↓ | Peregrinação |
| foto / mapa | F2 / M | RB / SELECT | |
| menu (tela de entrada) | ESC | START | |
| interface / transporte / mundo novo | H / T / R | → / — / — | Livre |
| configurações / controles | O / K | — | |
| tela cheia | F11 | ← | |
| fixos | F12 | | |

Regras: F serve a voar (Livre) e à lanterna (Peregrinação) — duas ações podem dividir tecla se nunca existirem no mesmo modo. Textos que citam tecla usam `bindings.label(ação)` (mostra o botão do controle se o controle foi o último usado). Enquanto a aba espera uma tecla, `bindings.capturing` faz o jogo ignorar tudo. Saíram os atalhos duplicados de antes (E/Q/C para subir/descer voando: E era também "ler").

**Controle de videogame — REGRA ABSOLUTA: independente do teclado.** Menus pelo controle em `ui/padNav.js` (foco com direcional, A aperta, B volta, ← → valores, LB/RB abas, analógico direito rola, START abre/fecha a tela de entrada; mapa com analógicos e gatilhos). Painel aberto no jogo pelo controle volta ao jogo. Tela cheia pelo controle via `preload.js`. Vibração em quedas, apagões, colapsos, máquinas; gatilhos contam a partir de 40%. Teste: `npm run check:pad`.

## Modos e mundos (tela de entrada, painel MUNDOS — `ui/worlds.js`)

- **Livre** e **Peregrinação**, escolhidos antes de entrar; na primeira vez o painel abre sozinho.
- **Um mundo salvo por modo**; um mundo nunca troca de modo. No painel: continuar o mundo do outro modo, ou começar um mundo novo (substitui o daquele modo, com confirmação). Trocar de mundo **recarrega o jogo**.
- A tela de entrada mostra o modo e a seed; na Peregrinação somem o botão TRANSPORTE e as teclas de voo/transporte/mundo novo/interface.

## Interface (`ui/hud.js`) — só no modo Livre

Leitura seca de instrumento: **registro de acontecimentos** (apagões, colapsos, quedas, transferências…) digitado linha a linha e sumindo com o tempo; **posição em metros**, região e seed no canto. Nada de glifos. Na Peregrinação, desligada (ver [[Ideias/Gameplay/Interface-diegetica]]).

## Idiomas (`src/i18n/`)

Inglês padrão, português opção (primeira linha das configurações; os painéis se reescrevem na hora). Todo texto novo entra nos dois arquivos com a mesma chave.

## Transporte (T — `ui/transport.js`, `world/teleport.js`)

24 destinos em grupos: regiões, interiores do maciço, estruturas, outros (Construtores, cemitério, cascata, transportador, máquina colossal, terminal, estrutura única, início da Peregrinação, ponte). Vai ao exemplar **mais próximo**; repetir leva a outro (os últimos 8 são pulados). Busca só no Field; o corpo paira até a geometria chegar. Destinos com `fly: true` chegam voando.

## Configurações (O — `ui/settings.js`)

Distância (240–2400 m), névoa (0–200%), FOV, sensibilidade, resolução, SSAO, TAA, apagões, colapsos, raios na névoa, reflexo, **trilha**, balanço da cabeça, efeitos de queda, inverter Y, realocar ao cair. Salvas em localStorage; padrões novos entram sozinhos (`{...DEFAULTS, ...salvo}`).

## Travessia

- **Continuar de onde parou**: tudo vai para o mundo salvo do modo (`app/saves.js`) a cada 5 s, ao soltar o mouse e ao fechar: seed, posição, olhar, andar/voar, diário, rastro do mapa, estado do corpo e o que mudou no mundo. O salvamento de antes dos modos virou o mundo do modo Livre (migração automática, uma vez).
- **Diário** (na tela de entrada): distância andada/voada/de vagão, tempo, quedas, maior profundidade, regiões, apagões e colapsos vistos, fotos.
- **Mapa da travessia** (M — `ui/trailmap.js`): o caminho em 3D, com marcas de quedas e fotos; as descobertas (setores atravessados, terminais lidos, estruturas únicas) e, na Peregrinação, as pistas abertas com a área de incerteza e a rota.
- **Foto** (F2): até 4K, 16 quadros de TAA, sem HUD e sem grão → Imagens/CYBERCOSMIC.
- **Só o `npm start` normal lê e grava** a travessia, e só com um mundo escolhido (`ctx.saving`); sessões com flags não tocam no salvamento.

## Modo andar (`controls/walker.js`, `world/collision.js`)

Colisão BVH sob demanda; sobe degraus/rampas até ~55°; escadas (W/S); **quinas** — pular de frente: até 1,3 m passa por cima, até 2,25 m agarra e sobe; no ar as mãos pegam bordas, inclusive o piso de uma ponte de onde se caiu ([[Ideias/Gameplay/Quinas-e-maos]]); elevadores e vagões carregam o corpo; queda com peso (FOV, tremor, riscos de poeira, pouso proporcional); cair é para sempre (realocação opcional).
