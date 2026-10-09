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

## O resto do rework (decidido com o usuário em 2026-10-09)
- **Modelos** (hostis por nível, NPCs, andarilhos, vida de silício, os braços do jogador): **procedural articulado** — corpos montados por peças (segmentos, placas, juntas, cabos) com proporções corretas, variando pela seed e pelo nível. Continua 100% código.
- **Animações**: **procedural + poses-chave** — IK nos pés e nas mãos (pisam no chão de verdade, agarram bordas), poses-chave em código para golpes, quedas e morte, misturadas por física simples (peso, inércia); variações pela seed e pelo nível.
- **Frentes novas** (além de modelos e animações): **luz e atmosfera**, **efeitos**, **primeira pessoa**.
- **Ordem**: (2) luz e atmosfera → (3) efeitos → (4) primeira pessoa → (5) hostis → (6) humanos e transumanos. As animações vêm junto com cada tipo de ser.
- **Sombras**: poucas sombras reais — só as 2–4 lâmpadas mais fortes perto do jogador e a lanterna; o resto, aproximado (oclusão). ~60 fps.
- **Referências**: o Claude pesquisa na web (o navegador embutido) e registra no cofre uma **ficha por tipo de ser** e por elemento de luz/arquitetura — o que caracteriza cada um, proporções, silhuetas — sem copiar imagens.
- **Acompanhamento**: **autonomia total** — o Claude faz todas as frentes em sequência na branch `rework-grafico`, decisões marcadas como dele (as seções "Decisões do Claude"), e o usuário revisa no fim.
- **O usuário** (2026-10-09): "para o design de silicon life, transhuman, human, safeguards, tome inspiração direta dos designs de Blame!… tem que ter variedade. Blame! se passa milhares de anos no futuro, onde os humanos se separaram e evoluíram de maneira divergente entre cada grupo. Então além da variedade dos NPCs hostis e transumanos, tem que ter bastante variedade dos humanos. Sempre busca na fonte (Blame!) sempre que for tomar uma decisão de design."

### Notas do usuário depois da frente 1 (2026-10-09, fotos da seed 5ctslq)
- **As "faíscas" que andam pelo chão não fazem sentido** — as linhas técnicas com pulsos de luz do material das pontes (`circuitAmount`), mais visíveis agora sem a grade de placas. A corrigir.
- **Os braços não fazem sentido anatomicamente** ("parece que saem da mesma origem") — fica para a frente de primeira pessoa.
- **Dá para atravessar os cabos pretos maiores** (os arcos grossos) — a corrigir.
- "De resto ficou tudo muito bom."

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

### Regressão final da frente 1 (2026-10-09, manhã)
- **`npm run profile`** (parado, média de 9 lugares): **quadro 9,5 ms · GPU 8,0 ms** — a linha de base era 11,8 / 8,8 (o aquecimento tirou os engasgos de chegada da medição); o pior lugar, a vila, 72 fps. Sem avisos X4000/X3595.
- **`check` 31/31** (119 fps), **`check:pilgrimage` 31/31** (116 fps), **`check:beam --beampart=f1` 16/16** (lotes: 13,3 → 8,5 milhões de vértices, capacidade ~757 → ~645 MB).
- Instáveis, sem ligação com o rework: **`tempo`** (o p95 de 10 tiros é o pior tiro; reprovou 2× numa hora em que a máquina estava lenta — a própria base deu 16,2 ms de quadro nessa hora contra 11,8 antes — e passou com 155/486 ms depois; o worker que regera o chunk é a maior parte); **`salvar`** (depois dos tiros de colapso, só 1–2 chunks perto têm cortes — reprovou 2 de 5 vezes com 0; a base, numa rodada, passou com 1). O relatório do `salvar` agora traz os chunks na caixa dos cortes e as posições, para a próxima vez.
- Corrigido no caminho: o worker marcava as bordas com uma chave de texto por vértice (caro nas malhas grandes da macro: um tiro inteiro de 2,3 s) — agora numérica.
- Capturas, antes (main) × depois (esta branch): ![[Imagens/rework/vistas-antes-depois.jpg]] · o bulbo dos pilares: ![[Imagens/rework/bulbo-antes-depois.png]] · o protótipo (a torre): ![[Imagens/rework/prototipo-torre.png]]. O roteiro das 20 vistas: `--capture` com `--seed=abc --delay=26 --show --goto=<lugar>` (+ `--fog=0`, ou `--lantern --game=pilgrimage`); de perto: `--surfcam=<material>`, `--bulbcam=N`.

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

## Frente 2 — luz e atmosfera (2026-10-09, autonomia do Claude)
- **Sombras das lâmpadas** (`render/shadows.js`): as 3 lâmpadas que mais iluminam perto da câmera (a força que chega a ela) ganham um mapa de sombra — câmera em perspectiva de 150° olhando para baixo (as luminárias iluminam para baixo), distância até a luz num alvo half float 512². Escolha estável (quem continua escolhido fica no mesmo mapa); um mapa refeito a cada dois quadros, em rodízio. Cada câmera de sombra tem a sua lista de recorte nos lotes (`world/batches.js`, `userData.batchView` — antes só havia a principal e a do reflexo). **Só a geometria do mundo projeta** (as páginas de lotes na camada 2): desenhar também os seres e objetos soltos custava ~25 ms de CPU na vila. Sem sombra: feixes, água, lentes, pichação, telas, letreiros. Plano próximo a 0,5 m (a carcaça ou a peça que segura a luz não a tampa); no shader, a amostra afastada pela normal e uma tolerância que cresce com a distância (o half float perde precisão), 4 amostras (bordas macias). Opção nas configurações: **sombras das lâmpadas** (`settings.shadows`).
- **A luminária ilumina para baixo** (`uLightDown`; `gen/chunkgen.js` lamp marca a luz `down`): o brilho na névoa vira um **facho em cone** (forte embaixo, quase nada em cima — a carcaça escura) e as superfícies acima da luminária só recebem o que vaza (10%). Brasas, telas, soldas continuam em todas as direções.
- **Luz rebatida**: cada luz enche um pouco o espaço em volta (6% sem depender da direção) — o que está de costas ou na sombra não vira preto.
- A lanterna **sem** sombra: está praticamente no olho, a sombra dela quase não apareceria.
- Medido: profile parado na teia 176 fps, na vila 58 fps (antes 65–72; a vila é a mais pesada pela CPU dos seres). `check` 31/31 (111 fps), `check:pad` 31 + 30.
- Decisões do Claude: 3 sombras (a escolha do usuário foi "2–4"); só o mundo projeta (seres sem sombra de lâmpada — custo); o cone das luminárias; 6% de rebatida; a lanterna sem sombra.

## Frente 3 — efeitos (2026-10-09, autonomia do Claude)
- **As partículas num módulo** (`render/burst.js`, a classe `Burst`, usada pela arma — `app/beamfx.js` — e pelo mundo — `world/particles.js`). O tamanho dos pontos sai da projeção (px por metro = altura do alvo · projeção[1][1] / 2), não de um número passado de fora.
- **As faíscas riscam**: o vertex shader projeta onde a faísca estava 35 ms antes; o sprite cresce para caber o rastro e o fragmento desenha um segmento fino, mais claro e mais grosso na cabeça (gotas de luz caindo, não pontos). **Quicam**: cada uma guarda a altura do chão (um raio por grupo, no nascimento — `floorAt`); ao bater, um pulinho e escorregam devagar até apagar.
- **As gotas d'água respingam**: as gotas perto (as que já avisavam o som ao tocar o chão) soltam 3–5 gotinhas que saltam e caem de volta.
- Decisões do Claude: o rework dos efeitos ficou nestes três; o tiro, os anéis de poeira, a brasa do corte, os detritos e o vapor já seguiam a direção e ficaram como estavam (o que se via de "sem sentido" — as linhas técnicas com pulsos de luz no chão — saiu antes, a pedido do usuário).

## Frente 4 — primeira pessoa (2026-10-09, autonomia do Claude)
- **O defeito que o usuário viu** ("os braços parecem sair da mesma origem"): não havia braço nenhum — o que se lia como braço era o corpo do emissor e do aparelho entrando na tela de baixo para o meio, com as mãos abaixo da borda.
- **Os braços** (`app/limbs.js`): cada mão visível (a do aparelho, da lanterna, do emissor ou a que agarra uma quina) ganha braço, cotovelo e antebraço — IK de dois segmentos (0,30 + 0,28 m) do OMBRO (fora da tela, ao lado, abaixo e um pouco atrás dos olhos) até o PULSO, o cotovelo para fora e para baixo; manga de tecido, ou metal no lado da prótese (R4). O braço reto das mãos nas quinas (`app/hands.js`) saiu (o mesmo IK serve a todas).
- **O enquadramento**: o emissor, o aparelho e a lanterna seguros mais para os lados e mais alto (a mão à vista perto da borda de baixo, o antebraço entrando pelo canto) — conferido com as mangas pintadas de vermelho numa captura.
- **O detalhe**: o emissor com o bloco de trás, aletas, guarda-mato, a coroa da boca, os painéis e o cabo para o pulso; a lanterna com os anéis da empunhadura e a tampa; o aparelho com as quinas de borracha e o conector.
- **O corpo ao olhar para baixo**: o tronco, a aba do casaco e as pernas com botas, seguindo a câmera só no giro; as pernas balançam com o passo. Só a pé (não pendurado, não voando).
- `check:climb` 14/14, `check:arms` 8/8.
- Decisões do Claude: as medidas do braço e a posição dos ombros; o enquadramento novo; o casaco longo (Killy).

## Frentes 5 e 6 — os seres: modelos e animações (2026-10-09, autonomia do Claude)
Fichas de referência: [[Referencias-Blame]]. Tudo em `world/kits.js` (os kits) sobre o esqueleto e a animação de `world/bodies.js` (que agora aceita um kit: cabeça, mãos, peças, braços a mais, a reação ao golpe). O corpo nasce com o nível e a identidade do ser (`world/entities.js` `_rig(kind, e)`; os Safeguards calculam o nível antes de nascer). **Dois do mesmo nível nunca são cópias**: proporções, peças e jeito vêm da identidade.
- **Safeguards (os Exterminadores)**: pálidos, magros, andróginos; a cabeça lisa e alongada com uma máscara achatada e dois cortes escuros; **garras** de três dedos longos e um polegar; costelas e a crista da coluna aparentes. **Baixo** ~2,3 m e fino; **médio** ~2,7 m, ombreiras arredondadas e o **núcleo** — uma esfera quente embutida numa moldura escura no abdômen, que acende na preparação do golpe; **alto** ~3,3 m, casca no peito, placa na bacia, núcleo maior, **lâminas nos antebraços**. Ler o perigo de longe pelo tamanho e pela silhueta.
- **Vida de silício**: a cabeça humana num corpo de máquina (armação, pistões, bloco do peito, bacia de máquina), o **símbolo na testa**, um **braço-arma** (o cano no lugar da mão). **Média**: maior, cabos longos caindo da cabeça como cabelo, uma lâmina. **Alta**: uma massa de membros — **dois pares de braços**, a cabeça afundada entre os ombros.
- **Humanos — um povo por vila** (`tribeOf`, pela identidade da vila): **armadura** (eletropescadores/tecnômades: capacete fechado com visor, às vezes antena, ombreiras, mochila, o fuzil-lança atravessado nas costas, cinturão); **secos** (Homens Secos: esguios, rachaduras simétricas no rosto e no tronco, faixa de pano, a lança de metal retorcido); **trabalhadores** (altos e largos, capacete e visor de trabalho, colete e arreio, um ou dois braços de máquina com pinça); **abrigados** (capuz ou lenço, óculos, às vezes respirador, manto de comprimento variável, bolsa). Dentro do povo: altura, corpo e peças por pessoa.
- **Andarilhos transumanos**: cada um com 1–3 próteses próprias (braço de máquina com garra — às vezes os dois —, meio rosto de metal, coluna de máquina), o olho de lente.
- **Animações**: o **golpe com variantes** (`strikeKindFor` — só a pose; tempo e alcance iguais): lateral (o arremesso), **de cima** (os dois braços sobem e descem), **estocada** (recua e estoca reto, o corpo avança), **baixo** (o alvo mais baixo: o tronco dobra e a garra varre) — a identidade puxa para uma preferida. **A morte cai** (~0,7 s, acelerando): de costas pelo emissor ou pela queda, senão para a frente ou para trás pelo jeito do ser; o corpo amolece enquanto cai (braços abertos, joelhos dobrados, a cabeça caída) — antes o corpo virava deitado num quadro.
- **O andar pelo nível e pelo povo** (`D.lean`, `D.swing`): o Safeguard baixo anda curvado, braços soltos (o predador), o alto ereto e pesado (braços quase parados); a vida de silício inclinada; os abrigados curvados, os secos de braços largos, os de armadura rígidos.
- `--beingsheet=N`: a fileira de todos os corpos (com as poses do golpe e um caído) para as capturas.
- Decisões do Claude: os quatro povos (das fichas) e as peças de cada um; as medidas por nível; o núcleo pequeno e embutido (o primeiro, grande e saturado, lia como um olho); a pele no tom apagado do pano (sem material novo); as variantes do golpe; a morte. A colisão dos seres continua a mesma (um Safeguard alto de 3,3 m usa a colisão do baixo).

## Fechamento — regressão final (2026-10-09, autonomia do Claude)
- **Todas as frentes feitas** (1 superfícies, 2 luz e atmosfera, 3 efeitos, 4 primeira pessoa, 5 e 6 os seres), na branch `rework-grafico` — falta a revisão do usuário e o merge.
- **O custo dos corpos novos**: o profile final mostrou a vila em ~36–40 fps (antes dos corpos, no mesmo PC e na mesma hora: 47). Cada peça dos kits (dedos das garras, costelas, próteses…) era uma malha — uma chamada de desenho e uma matriz por quadro. **As peças que pendem da mesma junta e usam o mesmo material agora viram uma malha só** (`world/bodies.js fuseParts`, ao montar o corpo; a animação gira só as juntas, então nada muda). Captura da fileira `--beingsheet` antes × depois: idênticas. A vila foi a 77 fps (rodada isolada) / 59 (no profile completo).
- **Os números finais** (`npm run profile`, parado): teia 70 · colmeia 118 · maciço 115 · vila 59 · camada 102 · transportador 89 · safeguard 54 (114 numa rodada isolada — varia com quantos Safeguards e reflexos estão à vista) · depósito 133 · estrato 95; média 11,8 ms / GPU 8,8 ms. As medidas neste PC variam bastante de rodada para rodada (a mesma vila: 47–77).
- **Checks**: `check` 31/31 (113 fps), `check:pilgrimage` 31/31 (114 fps), `check:pad` 31 + 30, `check:climb` 14/14, `check:arms` 8/8, `check:beings` 5/5, `check:npcs` 12/12, `check:health` 14/14, `check:beam` dano 18/18, profile 18/18.
- **Pendência conhecida** ([[Pendencias]] "Em observação"): o Safeguard não embarca no elevador grande no `check:safeguards` (`subir:elevador`) desde a frente 2; a escada passa. Não é dos cabos, do `lt.down`, dos lotes, nem do passe de sombras; a suspeita é o custo de GPU mudando o tempo.

## Segunda rodada — notas do usuário depois do playtest (2026-10-09, para planejar)
- **Os seres estão simplistas**: "parecem simplesmente variações do boneco de teste". Os kits (frentes 5–6) só pregaram peças no mesmo esqueleto de cilindros de 6 lados — a silhueta, as proporções e a superfície continuam as do corpo de teste. Precisa de corpos de verdade (formas próprias por tipo, não o boneco com acessórios).
- **O jogador também** (o usuário, 2026-10-09: "o mesmo que eu disse em relação ao design dos NPCs se aplica ao design do jogador"): os braços, as mãos e o corpo visto ao olhar para baixo (`app/limbs.js`, `app/hands.js`) são cilindros e caixas — entram na frente dos seres, em malha contínua.
- **A água ficou de fora** — principalmente as **cascatas** (`gen/cascades.js`).
- **Os objetos e ferramentas ficaram de fora** — o design do que se segura e se encontra (aparelho, lanterna, emissor, as cargas, a prótese, o analisador, os terminais…).
- **Os efeitos do emissor antes e depois do tiro ficaram de fora** — a carga, a sobrecarga e o que fica depois (o rework dos efeitos só mexeu nas faíscas e nas gotas).
- Junto: as pendências do playtest em [[Pendencias]] (§1, itens 6 e 7 — o corrimão e os braços em X).
- **Decisões do usuário (2026-10-09)**: os corpos em **malha contínua** deformada pelo esqueleto (não mais peças soltas); a ordem (1) braços em X + corrimão → (2) seres → (3) água → (4) emissor antes e depois do tiro → (5) objetos e ferramentas; **cada frente com protótipo** mandado ao usuário (notificação com a foto) e só segue com a aprovação. Desempenho: errar a meta por pouco (60 → 56) tudo bem — o notebook fica no modo equilibrado fora do jogo.

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
