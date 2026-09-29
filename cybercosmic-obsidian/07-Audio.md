# 07 — Áudio

Tudo sintetizado em Web Audio (`src/audio/audio.js`, ~1100 linhas). Nenhum sample.

## Camadas contínuas

- **Drone** em ré grave (36,7 Hz + parciais), com filtro que abre com a velocidade.
- **Vento em dutos** e vento de queda (cresce com a velocidade).
- **Cascata** mais próxima (rugido posicionado).
- **Reverberação que responde ao espaço**: três convoluções (sala 0,9 s, salão 3,2 s, abismo 8,5 s) misturadas por `setSpace(tamanho)`, estimado pelo Field (`World.spaceSize`).

## Eventos

| som | origem |
|---|---|
| obra distante: bate-estacas, golpes metálicos, rangidos | loop aleatório |
| Construtores: marteladas e solda **no lugar certo** | `builders.events` |
| apagão / religamento | `outages` |
| colapso: estalo + impacto atrasado pela distância | `collapses` |
| **baque das garras das máquinas colossais** | `colossi.events` → `colossusClamp` |
| vagões passando, juntas do trilho a bordo | `app/body.js` |
| passos por superfície: concreto, aço, grade, poça | `footstep(k, surface)` |
| pouso, zumbido após queda forte, "abafado" | `land`, `impact` |
| gotas posicionadas | `particles.onDrip` |
| obturador da foto, transferência do transporte | interface |

Sons posicionados usam `_placed(pan, dist)` (volume e agudos caem com a distância) e chegam atrasados por `dist / 340`.

## Trilha

`_chord()` a cada 60–150 s: acorde grave que sobe em ~7 s, fica e se desfaz em ~14 s na reverberação; duas ondas levemente desafinadas por voz, filtro que respira; **sem melodia**. A harmonia vem da região (`HARMONY`): quintas abertas na deriva, segundas menores no abismo, quintas paralelas no maciço, clusters na colmeia, quase nada no vazio, quartas nas camadas. Liga/desliga nas configurações.

## Onde mexer

`app/sound.js` liga os acontecimentos do mundo aos sons (e à vibração do controle e aos avisos do HUD). Um som novo = um método em `AudioEngine` + a chamada em `sound.js`.
