# 05 — Sistemas vivos (o que se move ou acontece)

Todos vivem em `src/world/`, são atualizados em `World.update`, implementam `rebase(delta)` e contribuem com luzes para o `LightRig` (16 luzes dinâmicas escolhidas por importância). **Nenhum é uma entidade** — são máquinas e fenômenos.

| sistema | arquivo | como funciona |
|---|---|---|
| **Elevadores** | `elevators.js` | colossais nas passagens das camadas + de carga no maciço; carregam o corpo (`userData.dx/dy/dz`) |
| **Construtores** | `builders.js` | pórticos em canteiros erguendo estruturas ao vivo (solda, marteladas); ~30% são **cemitérios** (mortos) |
| **Transportadores** | `transitCars.js` + `gen/transit.js` | vagões com horário determinístico (ACC 0,9 m/s², espera 14 s, estações a 1440 m); relógio por linha; dá para embarcar |
| **Máquinas colossais** | `colossi.js` | pórticos de 260 m nas trincheiras sob as camadas; "esteira" determinística a 3,2 m/s; cones de luz; baque das garras a cada 6,5 s |
| **Setores apagados / instáveis** (permanentes) | `gen/field.js` + `outages.power` | ~30% sem energia, ~15% em ondas; `outages.power` devolve 0 num setor apagado (trens, elevadores e terminais param); o `LightRig` ainda multiplica pela onda dos instáveis |
| **Apagões de setor** | `outages.js` | um setor apaga em onda e religa em cascata; `power(x,y,z,…)` consultado por luzes, trens e elevadores (param junto) |
| **Colapsos distantes** | `collapses.js` | pedaços de pilares se soltam e caem; som chega atrasado pela distância |
| **Cascatas** | `gen/cascades.js` | canos rompidos em poços e galerias; coluna d'água, poça, névoa, rugido |
| **Setores inundados** | `gen/floods.js` | lâmina d'água sobre placas de camadas/estratos, com diques; reflexo planar |
| **Partículas** | `particles.js` | gotas e vapor animados no vertex shader |
| **Terminais mortos** | `terminals.js` | telas (CanvasTexture) com registros procedurais e horário dos vagões — **base da ideia [[Ideias/Gameplay/Terminais-com-conteudo]]** |
| **Inscrições** | `inscriptions.js` | endereços pintados em estêncil (galerias, túneis do maciço, placas de estação); estimam a luz que chega nelas; lidas de perto ensinam |
| **Silhuetas** | `silhouettes.js` | estruturas a dezenas de km, só sombras escurecendo a névoa |

## Padrão para um sistema novo

1. Classe com `update(time, dt, g, origin)`, `rebase(delta)`, `dispose()`, `lights[]`.
2. Instanciar em `World.build` (junto dos outros), chamar em `World.update`, incluir em `candidates()` (luzes), `maybeRebase` e `dispose`.
3. Eventos para som/interface: uma fila `events[]` consumida por `app/sound.js` (ver `builders.events`, `colossi.events`) ou callbacks religados em `sound.wire()` a cada mundo novo.
4. Se o jogador pode ir até ele: um destino em `world/teleport.js` (`DESTINATIONS` + finder). O `npm run check` passa a testá-lo automaticamente.
