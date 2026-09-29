# 04 — O mundo e a geração

## Grades e constantes (`gen/field.js`)

| constante | valor | o que é |
|---|---|---|
| `CHUNK` | 192 m | cubo de geração |
| `MACRO` | 1600 m | célula das megaestruturas |
| `PILLAR_CELL` / `SEG_H` | 96 / 48 m | célula e segmento de pilar |
| `NODE` | 96 × 48 m | célula da rede andável |
| `WALK` | espaçamento 480, níveis a cada 288 m | passarelas infinitas |
| `MEGA.tile` | 80 m | placa de parede / laje |
| `MEGA.barrier` | 2880 m | distância vertical entre camadas; topo da n=0 em 1488 m, espessura 72 m |
| `MEGA.passage` | 1920 m | grade das passagens (elevadores colossais) |
| `MEGA.frame` | 240 m | célula da treliça |
| `MEGA.builder` | 1400 m | grade dos canteiros dos Construtores |
| `TRANSIT.station` | 1440 m | estações dos transportadores |
| `COLOSSUS` | trincheira 160 × 56 m, máquinas a cada 5,2 km | máquinas colossais |
| `RELIEF` | célula 160 m, até 36 m | relevo sobre as camadas |
| `HIVE` | 48 m | sala da colmeia |

> Como a distância entre camadas (2880) é múltiplo de 288 e de 240, **passarelas e treliças ficam sempre na mesma altura relativa ao topo de cada camada** (≥ 96 m acima). Útil para saber o que é seguro construir perto de uma camada.

## Regiões (`Field.biome`)

| região | caráter |
|---|---|
| **teia** | trama aberta: pilares, passarelas, rede de plataformas, flutuantes |
| **colmeia** | salas de 48 m empilhadas (fechado, apertado) |
| **maciço** | blocos colossais em grade de 192 m com vielas; alguns ocos (sala de máquinas, depósito, silo) |
| **vazio** | quase nada; plataformas raras |
| abismo / altura / deriva | rótulos por altura quando nada mais define |

## Megaestruturas

| estrutura | notas |
|---|---|
| **Galerias** | túneis de 200–460 × 260–720 m ao longo de X ou Z; sacadas, contrafortes, prédios no piso |
| **Poços** | fossos verticais sem fundo, com escadaria em zigue-zague |
| **Estratos** | pisos colossais infinitos (24 m) com florestas de colunas |
| **Treliças** | vigas de concreto em células de 240 m, andáveis |
| **Condutos** | tubos de 22–60 m de raio com piso interno |
| **Escadarias** | inclinação 1:2, sobem e descem sem fim |
| **Camadas intransponíveis** | lajes de 72 m a cada 2880 m; só as **passagens** (96 m, elevador colossal) as atravessam |
| ↳ **relevo no topo** | plataformas, espinhaços com dutos, galpões, chaminés — gerado na macro, visível de longe |
| ↳ **trincheiras embaixo** | 160 m de largura, 56 m de fundo, em algumas linhas da grade das passagens; trilhos no teto; máquinas colossais |

Regras entre estruturas: onde duas se cruzam, as paredes se abrem (`insideVoid`); passarelas atravessam paredes por vãos; treliças, blocos e relevo desviam de passarelas, escadarias e poços.

## Escala humana (camada chunk)

`gen/chunkgen.js`, `gen/dressing.js`, `gen/human.js`, `gen/network.js`, `gen/closed.js`:
- pilares com coroas (casas de máquinas, mastros, luz de obstáculo) e pontas invertidas;
- rede de plataformas e ligações (escadas, rampas, tubos);
- passarelas infinitas (algumas com trilho de transportador);
- **flutuantes**: blocos habitacionais suspensos, lajes, gaiolas, anéis de concreto;
- assentamentos vazios, entulho, cabos (catenárias e fios de prumo), gotas;
- **anomalias raras (macro)**: só monólitos de km e agulhas de 3 km.

## Setores de energia

`Field.sectorAt(x,y,z)` → `{ id, band, i, k, state: 'dark'|'unstable'|'powered', phase }`: Voronoi com pesos numa grade de 900 m com pontos sorteados (setores enormes e minúsculos), cortado na vertical só pelas camadas. `SECTOR` em `field.js`. **A mesma conta em GLSL** (`sectorPower` em `shaders/chunks.js`, hash inteiro `uint` idêntico ao `hash4`): janelas e linhas técnicas concordam com as lâmpadas. Uniforms `uOrigin` (origem inteira) e `uSectorSeed`.

## Tomadas

`ChunkBuilder.socket(x,y,z,yaw)`: caixa + plaquinha, registrada como emissor `{type:'socket'}` (`world.sockets()`). Nos postes das passarelas, das plataformas, `lampPost` e abrigos das estações.

## Luminárias

`ChunkBuilder.lamp()` (`gen/chunkgen.js`): toda luz dos geradores vem com carcaça (`machine`), lente (`lamp` perto / `lampFar` na macro, acesa pela própria luz logo abaixo) e suporte até onde se prende (`to`): poste + braço, haste até o teto, braço até a parede.

## Materiais (nomes usados em `B.add`)

Perto: `lamp tower bridge rib cable duct dress block slab monolith plaza tube hive massif rungs grate door sign shack cloth screen graffiti water machine`.
Longe (macro): `lampFar wall floor frame stairway macro conduit barrier beam cascade pool flood colossus colossusBeam`.
(`organic` e `anomaly` ainda existem como materiais, mas nada mais os usa.)

## Como adicionar uma estrutura

1. A **lei** no Field: função pura de índices de grade + consulta "o que existe perto de (x,y,z)".
2. A geometria em `macrogen.js` (se visível de longe) ou `chunkgen.js`/`dressing.js` (se de perto), com posse por centro de célula.
3. Exclusões **nos dois sentidos**: a estrutura nova evita as outras, e as outras (assentamentos, pontos de chegada do transporte, canteiros) evitam a nova. Ver [[11-Invariantes-e-Armadilhas]].
