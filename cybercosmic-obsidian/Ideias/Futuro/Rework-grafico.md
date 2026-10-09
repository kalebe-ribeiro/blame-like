---
status: em andamento — frente 1 (as superfícies) começou em 2026-10-08
prioridade: depois da gameplay
tags: [futuro, grafico, texturas, modelos, animacao, npcs]
---

# O grande rework gráfico

> Usuário (2026-10-03): "deixe notado que após finalizarmos todos os aspectos da gameplay, haverá um grande rework gráfico, adicionando texturas variadas, modelos de NPCs detalhados e variados, e animações diversas variadas."

## Decisões (usuário, 2026-10-08)
- **Continua 100% procedural**: nada de imagens ou modelos externos; tudo sai da seed.
- **Estilo**: o de hoje, muito mais rico (evolução, não mudança de rumo).
- **Começa pelas superfícies do mundo**; hostis/NPCs e animações vêm depois, em planos próprios.
- **Orçamento**: ~60 fps estáveis.

## Frente 1 — as superfícies (plano aprovado em 2026-10-08)
**Texturas procedurais "assadas" na GPU pela seed** (um forno, `render/surfaceBaker.js`: cor+altura e normal+aspereza em arrays de textura, por família — concreto moldado, pré-moldado, chapa de aço, aço estrutural, grade, chapa xadrez, ferrugem, fuligem, poeira) **+ amostragem triplanar com normal mapping** no shader de superfície (sem tangentes; o padrão preso ao objeto que se move continua). Cada material vira uma receita (família + desgaste + escala + tom); um fator de **idade por região** sai do Field; desgaste pela geometria (escorridos sob bordas, sujeira junto do chão); variação macro e LOD no longe. Etapas: (1) linha de base de capturas e `profile`; (2) protótipo em 3 materiais para o usuário aprovar; (3) todas as famílias e receitas; (4) desgaste e longe; (5) desempenho e acabamento.

### Etapa 1 — linha de base (2026-10-08)
Roteiro fixo de 20 capturas (seed abc: 12 lugares, 4 com névoa 0, 4 com lanterna na Peregrinação) e `npm run profile` (no plano de energia Equilibrado — o de economia derrubava tudo pela metade): **parado, média de 9 lugares: quadro 11,8 ms · GPU 8,8 ms**.

### Etapa 2 — protótipo (2026-10-08, aguardando o usuário)
- **O forno** (`render/surfaceBaker.js`): 3 famílias — `concrete` (tábuas de forma 1,2×2,4 m, veio da madeira, furos de tirante, bolhas raras de 2–6 mm), `plate` (chapas 1,5×1 m sobrepostas, rebites a cada 7,5 cm, amassados, riscos), `tread` (chapa xadrez, ressaltos de 3 cm) — em 1024², ruído periódico (sem emenda). Um programa por família (por define); um passe de altura em half float e a normal pelos vizinhos (Sobel) — recalcular a altura 5× por pixel num shader só travou a GPU do ANGLE (3 s compilando e o processo da GPU caindo). ~0,6 s no início do mundo (compilação; a dividir na etapa 5).
- **O shader** (`USE_SURF_TEX`): triplanar com pesos afiados, normal "whiteout" sem tangentes (os eixos do objeto que se move: `vAxX/Y/Z`), a cor da textura modula o tom do material, as covas escurecem, a aspereza no especular. As **juntas grandes das placas continuam as do material** (zerar trocava o piso por um cinza liso).
- Nos materiais `tower` (concreto), `machine` (chapa) e `bridge` (xadrez).
- **`--surfcam=mat`**: a face mais perto do material, de viés, a 2,5 e 8 m e com lanterna; cada vista com o forno desligado e ligado no mesmo quadro (`uSurfOn`).
- Desempenho: média parado **9,5 ms · GPU 8,5 ms** (sem perda — dentro da variação da máquina); sem avisos X4000/X3595.

### Sem "tiles" em todo lugar (usuário, 2026-10-09)
> "gostaria que esses tiles fossem removidos — as divisões claras dos blocos de textura, deixando algo natural. Pode haver padrões dessa forma dependendo do contexto, mas do jeito atual eles estão em todo lugar."
- A grade de juntas e o tom por placa do shader viraram o parâmetro `seams` (0..1, **0 por padrão**): sem ele, o tom é uma mancha larga e contínua (`snoise` na escala de 3 placas). Placas, juntas e grades regulares só onde o contexto pede (receitas da etapa 3: chapas de aço, pisos de grade, painéis pré-moldados), nunca como padrão.
- A família `concrete` do forno perdeu as tábuas de forma e os furos de tirante alinhados: só a pele (ondulação grande/média, grão, veio fraco e intermitente, poros raros).
- Fica para a etapa 3: as janelas da colmeia (os quadrados escuros em grade — `windows`) e a escala/repetição do ladrilho de 4,8 m (variação macro).

### As capturas de desenvolvimento num perfil à parte (2026-10-09)
`--capture` usava o perfil de verdade (o mundo salvo e o diário de quem joga), e o `taskkill` antes de cada execução fecha qualquer Electron — inclusive o jogo aberto. Agora `--capture` usa `%TEMP%/cybercosmic-capture`, com o armazenamento zerado a cada execução (os caches de shader e de chunks ficam). O save de 2026-10-08 (seed l5rg5b) não está mais no perfil.

### O bulbo oco dos pilares (usuário, 2026-10-09)
> "visto de baixo era um tipo de pirâmide inversa, que juntava com uma pirâmide normal em cima, porém a base de ambas, que se encontravam no meio do objeto, não existia — dava para ver o oco."

O bulbo (`gen/chunkgen.js` buildSegment: prisma aberto + cone em cima + cone virado embaixo) e a ponta invertida sob os pilares (buildRoot): o cone virado com `rx: π` espelha o giro em y — com `ry: +spin` a base dele saía girada em relação ao corpo (cantos para fora, aberturas mostrando o oco). Agora `ry: -spin`: os cantos batem (conferido pelos vértices e por captura antes × depois — `--bulbcam`, o bulbo mais perto visto de baixo). `GEN_VERSION` g3 (cache de cortes). `check` 31/31.

### Etapa 3 — todas as famílias e receitas (2026-10-09, aprovada a etapa 2)
- **6 famílias** no forno (`render/surfaceBaker.js` SURF): `concrete` (4,8 m), `plate` (chapas rebitadas, 3 m), `tread` (chapa xadrez, 1,2 m), `steel` (aço laminado: carepa, pites raros, riscos finos por região — 2,4 m), `rust` (crostas que descascam, crateras — 2 m), `weave` (trama de 3 mm, fraca e irregular — de perto, numa luva, a trama forte lia como xadrez — 0,6 m).
- **O forno em passos** (`createSurfaceBake`, um passo por quadro em `ctx.frameHooks`): 4 faixas da altura + o passe final por família. As 6 famílias num quadro só passavam do limite do Windows (TDR, ~2 s) e o processo da GPU caía. ~1 s espalhado; até acabar, `uSurfOn` 0 (o desenho procedural).
- **O shader**: `surfTri` (a triplanar numa função, com `textureGrad` e as derivadas de W tiradas antes — pode ficar dentro de um desvio); **faces de cima** com outra família (`top`: o piso da ponte é xadrez, o resto aço — só faces com normal y > 0,97: o corrimão redondo não pega o xadrez); **a idade do lugar** (`uAgeSeed`, manchas de ~400 m pela seed) regula escorrido e ferrugem; nos metais (`rust: true`) a **ferrugem toma o relevo** (a 2ª amostragem só onde há ferrugem, rust > 0,15).
- **Receitas** (world.js): concreto — torre, bloco, laje, praça, colmeia, escadaria, entulho (`dress`); concreto em escala maior (9,6 m) — paredes/pisos/quadros colossais, maciço, monólito, barreira; aço — nervuras, tubos, condutos, degraus, grades, portas; chapa rebitada — máquinas, colossos, dutos; aço com piso xadrez — pontes; ferrugem — barracos; trama — panos (e a luva da mão). Sem textura: cabos, corte (brasa), água, lâmpadas, telas, letreiros, pichação, a pele dos Safeguards.
- A colmeia perdeu a grade de janelas (o usuário: nada de grade em todo lugar). Anisotropia 4× (8× custava mais e não se via).
- **Desempenho** (A/B intercalado na mesma sessão contra `d627b3d`, a máquina varia muito de uma hora para outra): com o mundo carregado, ~+0,3 ms de GPU (maciço, camada); na chegada, +10 programas de shader (as variantes com ferrugem) e o programa da ferrugem do forno (~0,7 s uma vez) — o aquecimento fica para a etapa 5. Com o cache de shaders frio (a primeira vez depois de mudar o shader) a chegada demora muito mais (32 s medidos) — etapa 5.
- `check` 31/31.

### Etapa 4 — desgaste pela geometria e o longe (2026-10-09, noite — autonomia do Claude)
- **As bordas no comprimento da normal** (`gen/chunkgen.js` `markTopEdges`, no `finish` de cada chunk): em cada face vertical de cada peça, a distância de cada vértice até a borda de cima da face (o plano: direção horizontal + distância à origem) vai no COMPRIMENTO da normal — 0,5 na borda, 1 a partir de 24 m. Normais de comprimento 1 (tudo que não vem do gerador) = longe de qualquer borda; as luzes normalizam. Fora: os feixes (o "ao longo" em normal.y), as cascatas e as faces do corte. Zero memória a mais (o canal de enchimento das normais de 8 bits não dava: o three declara `normal` como vec3). `GEN_VERSION` g4.
- **Os escorridos** (shader, `vTop`): faixas verticais de ~3 m que descem das quinas e beirais, de comprimento variável ao longo da borda (1–10 m) e mais longas nos lugares velhos (a idade), e uma faixa fina de sujeira logo abaixo da quina; no metal, a ferrugem escorre junto (a cor de acento). Conferido com a cor de depuração (listras de 2 m de vTop: crescem para baixo em cada face).
- **O longe**: as cópias LOD dos materiais (os chunks de longe) sem as texturas assadas — a névoa e o mip mais alto já apagam o detalhe a 500 m+.

### Etapa 5 — desempenho e acabamento (2026-10-09, noite — autonomia do Claude)
- **Aquecimento** (`app/render.js` `warmSurfaces`): assim que o mundo é montado, `renderer.compileAsync` (KHR_parallel_shader_compile) compila todas as variantes de todos os materiais — em lote (BatchedMesh), de longe, numa malha comum (soloMaterial) e presa ao objeto (movingMaterial). Medido na teia com o cache quente: **sem ele, um engasgo de 8,5 s** na chegada (cada programa compilando na hora do primeiro chunk dele); **com ele, o pior 0,4 s**.
- **O forno** espera os programas dele compilarem (compileAsync, até 5 s) antes do primeiro passo, e os guarda entre um mundo e outro (`HEIGHT_MATS`); um mundo refeito com a mesma seed não refaz o forno (as texturas seriam as mesmas).
- O cache de shaders frio (a primeira vez depois de mudar um shader — no desenvolvimento, ou a primeira abertura de uma versão nova) ainda custa: a compilação inteira dos programas novos (~10–30 s medidos nesta máquina). Fica registrado.

### Decisões do Claude (2026-10-09, autonomia dada pelo usuário — revisar)
> O usuário: "te dou permissão pra prosseguir com o plano até finalizar o rework gráfico completo (todas as etapas)… já que você vai fazer a maioria das decisões, ponha elas destacadas como suas e faça os commits numa branch secundária." Tudo na branch **`rework-grafico`** (a `main` ficou no 5efcef3).
- **Escopo**: "todas as etapas" = as etapas 1–5 da frente 1 (superfícies), o plano aprovado. Hostis/NPCs e animações ficaram de fora — têm planos próprios que dependem de escolhas do usuário.
- **Famílias**: concreto, chapa rebitada, chapa xadrez, aço laminado, ferrugem, trama. Sem pré-moldado em painéis (seria uma grade em todo lugar — o pedido do usuário foi o contrário).
- **Receitas**: a lista da etapa 3 (qual material ganhou qual família) é minha; a mais discutível: `dress` (entulho) como concreto, `door` como aço, `bridge` com aço nas laterais e xadrez só nas faces de cima.
- **Escalas**: concreto 4,8 m (9,6 m nas estruturas colossais), aço 2,4 m, chapa 3 m, xadrez 1,2 m, ferrugem 2 m, trama 0,6 m.
- **Idade por região**: um ruído de ~400 m no shader (pela seed), não o Field — o mesmo efeito, sem custo no gerador.
- **Escorridos**: só das bordas de cima das faces verticais (água que desce); sem sujeira junto do chão (a oclusão do SSAO já escurece o pé das paredes).
- **Longe**: sem textura nos chunks LOD; a variação macro é a que já havia (o tom em manchas de 3 placas e a idade).
- **Anisotropia 4×** (8× custava mais e não se via diferença).
- **Janelas da colmeia removidas** (eram uma grade em todas as paredes internas).

## Quando
**Depois de finalizar todos os aspectos da gameplay.** Até lá, o visual é o de agora — formas geométricas, materiais procedurais (`shaders/materials.js`), corpos simples dos seres (`world/bodies.js`) e animações únicas. As features de gameplay continuam sendo feitas com esse visual e **não** esperam o rework (nem o antecipam).

## O que entra (registrado — o detalhe se decide na hora)
| frente | o que |
|---|---|
| **texturas variadas** | superfícies com textura de verdade (concreto, aço, ferrugem, fuligem, grades…) no lugar (ou além) dos padrões procedurais de hoje — variadas por bioma, por estrutura, por idade |
| **modelos de NPCs detalhados e variados** | os seres (moradores, andarilhos, vida de silício, os tipos de Safeguard) com modelos detalhados, e mais de um modelo por tipo |
| **cada hostil pelo seu nível** (2026-10-03) | o **design** (o modelo, o tamanho, a silhueta, os materiais, as luzes do corpo) e a **animação** (o andar, a corrida — o arranque e a velocidade de [[Movimento-dos-inimigos]] —, o golpe, o ferido, a morte) de cada hostil **mudam com o nível** (baixo, médio, alto — Safeguards, vida de silício e os que vierem), para o jogador **ler o perigo de longe**; e **variações dentro do mesmo nível** (mais de um modelo e de um jeito de se mover por nível), para dois do mesmo nível não serem cópias |
| **animações diversas e variadas** | andar, correr, escalar, agarrar, golpear, cair, levantar — com variações; em especial **as do golpe e do arremesso**, por ângulo (por trás, de frente, de baixo, lateral — 2+ cada) e por tipo de NPC ([[Barra-de-vida]] §5) |

## O que precisa ser lembrado na hora
- A direção de arte continua a de [[02-Direcao-de-Arte]] e [[14-Universo-Blame]] (*Blame!* como referência direta; sem neon/glitch/alienígena/formas orgânicas/portais — com as exceções conscientes já decididas, como as cores da sobrecarga do emissor).
- O orçamento de desempenho ([[06-Render-e-Desempenho]], `npm run profile`): texturas e modelos novos passam pelo mesmo crivo (fps, GPU, memória de vídeo — `check:beam` caso `lotes`).
- A geração é determinística e em workers: texturas e variações de modelo têm de sair da seed do mesmo jeito.
- As capturas no instante certo (`--fxshots`, `--capture`) e a regra de nunca afirmar algo visual sem medir e capturar.
