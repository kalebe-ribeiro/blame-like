# 08 — Interface e travessia

## Controles

| tecla | ação |
|---|---|
| clique | entrar (trava o mouse, liga o áudio) |
| F | andar ↔ voar |
| WASD + mouse | mover |
| ESPAÇO | pular / subir voando |
| SHIFT | correr / acelerar voando |
| P | piloto automático (voo contemplativo) |
| T | transporte · O configurações · M mapa · H interface · F2 foto · R mundo novo |

**Controle de videogame** suportado (entra direto, vibração em quedas, apagões, colapsos, máquinas).

## Modos e mundos (tela de entrada, painel MUNDOS — `ui/worlds.js`)

- **Livre** e **Peregrinação**, escolhidos antes de entrar; na primeira vez o painel abre sozinho.
- **Um mundo salvo por modo**; um mundo nunca troca de modo. No painel: continuar o mundo do outro modo, ou começar um mundo novo (substitui o daquele modo, com confirmação). Trocar de mundo **recarrega o jogo**.
- A tela de entrada mostra o modo e a seed; na Peregrinação somem o botão TRANSPORTE e as teclas de voo/transporte/mundo novo/interface.

## Interface (`ui/hud.js`) — só no modo Livre

Leitura seca de instrumento: **registro de acontecimentos** (apagões, colapsos, quedas, transferências…) digitado linha a linha e sumindo com o tempo; **posição em metros**, região e seed no canto. Nada de glifos. Na Peregrinação, desligada (ver [[Ideias/Gameplay/Interface-diegetica]]).

## Idiomas (`src/i18n/`)

Inglês padrão, português opção (primeira linha das configurações; os painéis se reescrevem na hora). Todo texto novo entra nos dois arquivos com a mesma chave.

## Transporte (T — `ui/transport.js`, `world/teleport.js`)

21 destinos em grupos: regiões, interiores do maciço, estruturas, outros (Construtores, cemitério, cascata, transportador, máquina colossal, ponte). Vai ao exemplar **mais próximo**; repetir leva a outro (os últimos 8 são pulados). Busca só no Field; o corpo paira até a geometria chegar. Destinos com `fly: true` chegam voando.

## Configurações (O — `ui/settings.js`)

Distância (240–2400 m), névoa (0–200%), FOV, sensibilidade, resolução, SSAO, TAA, apagões, colapsos, raios na névoa, reflexo, **trilha**, balanço da cabeça, efeitos de queda, inverter Y, realocar ao cair. Salvas em localStorage; padrões novos entram sozinhos (`{...DEFAULTS, ...salvo}`).

## Travessia

- **Continuar de onde parou**: tudo vai para o mundo salvo do modo (`app/saves.js`) a cada 5 s, ao soltar o mouse e ao fechar: seed, posição, olhar, andar/voar, diário, rastro do mapa, estado do corpo e o que mudou no mundo. O salvamento de antes dos modos virou o mundo do modo Livre (migração automática, uma vez).
- **Diário** (na tela de entrada): distância andada/voada/de vagão, tempo, quedas, maior profundidade, regiões, apagões e colapsos vistos, fotos.
- **Mapa da travessia** (M — `ui/trailmap.js`): o caminho em 3D, com marcas de quedas e fotos.
- **Foto** (F2): até 4K, 16 quadros de TAA, sem HUD e sem grão → Imagens/CYBERCOSMIC.
- **Só o `npm start` normal lê e grava** a travessia, e só com um mundo escolhido (`ctx.saving`); sessões com flags não tocam no salvamento.

## Modo andar (`controls/walker.js`, `world/collision.js`)

Colisão BVH sob demanda; sobe degraus/rampas até ~55°; escadas (W/S); elevadores e vagões carregam o corpo; queda com peso (FOV, tremor, riscos de poeira, pouso proporcional); cair é para sempre (realocação opcional).
