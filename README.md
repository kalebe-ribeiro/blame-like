# CYBERCOSMIC

Simulador contemplativo 3D de **cybercosmicismo**: o horror de uma construção humana que não parou mais. Um brutalismo megalomaníaco, na linhagem da Cidade de *Blame!*: concreto sem fim, poeira, luzes de sódio que ninguém mantém. Um sistema grande demais para ser compreendido, e você dentro dele. **O mundo não acaba**: nem para cima, nem para baixo, nem para os lados. **E dá pra andar nele**: existe uma rede aleatória e infinita de plataformas, pontes, escadas e tubos.

Feito com **Electron + Three.js**. Roda tudo local, sem servidor e sem assets externos: geometria, texturas e som são 100% procedurais.

```bash
npm install
npm start
```

## Modos de jogo e idiomas

Na primeira vez, a tela de entrada pede para escolher o modo (botão **MUNDOS**). Cada modo tem **um mundo salvo**, e um mundo nunca troca de modo:

- **Livre**: contemplação e exploração sem regras. Voo, transporte para qualquer tipo de lugar, mundo novo com R, a leitura de instrumento na tela.
- **Peregrinação**: a pé, sem transporte e quase nada na tela. É o modo com progressão, em construção fase por fase: ler a Cidade, seguir o que ela deixou, religar setores e, no futuro, os Safeguards e os raros vivos, à maneira de *Blame!*.

O jogo é em **inglês** por padrão, com **português** como opção nas configurações. Os textos ficam em `src/i18n/` (um arquivo por idioma).

## Controles

Os do modo Livre. Na Peregrinação não há voo (F, P), transporte (T), mundo novo (R) nem interface (H).

| tecla | ação |
|---|---|
| clique | entrar (trava o mouse e liga o áudio) |
| **F** | alternar **andar** (padrão) ↔ **voar** |
| WASD + mouse | andar / voar |
| W / S numa escada | subir / descer (encostado nela) · **A/D** solta para o patamar do lado |
| ESPAÇO | pular (andando) · subir (voando; E também) |
| CTRL / Q / C | descer (voando) |
| SHIFT | correr (andando) · acelerar 6× (voando) |
| P | piloto automático em voo: deriva sozinho, curvando devagar (modo contemplação) |
| R | regenerar o mundo com nova seed |
| H | mostrar/ocultar a interface (posição, região, seed e o registro de acontecimentos) |
| O | configurações (também pelo botão na tela de entrada) |
| T | transporte: ir a uma região, estrutura ou aos Construtores (também pelo botão na tela de entrada) |
| M | mapa da travessia: o caminho que você fez neste mundo, em 3D (arrastar gira, roda aproxima) |
| F2 | foto: salva um quadro limpo (sem interface nem grão, 16 quadros de TAA acumulados) em até 4K, em Imagens/CYBERCOSMIC |
| F11 / F12 | tela cheia / DevTools |
| ESC | soltar o mouse |

## Direção de arte

- **Sem neon.** A superfície de tudo é concreto e aço, com:
  - juntas de placas, escorrimentos verticais, ferrugem e tom variando por placa;
  - **milhares de janelas minúsculas acesas**, feitas no próprio shader, sem geometria. Longe, elas viram uma média sem cintilar.
- **Luz** (calibrada para não estourar com pouca névoa): vapor de sódio âmbar, fluorescente esverdeada cansada, branco frio e, raramente, vermelho de alerta. Há luz ambiente difusa, para as massas lerem como volume, e clarões de **solda** distantes: algo ainda está construindo.
- **Névoa** de poeira cinza/ocre, com partículas em suspensão perto da câmera.
- **Imagem**: pós-processamento de filme velho (dessaturação, grão, vinheta). **Nenhuma estética de glitch**: nada de falhas digitais na imagem, no som ou na interface.
- **Trilha**: de tempos em tempos (1–2,5 min) um acorde grave e lento sobe sobre o drone e se desfaz na reverberação. Não há melodia, só a harmonia do lugar: quintas abertas na deriva, segundas menores no abismo, quintas paralelas no maciço, clusters apertados na colmeia, quase nada no vazio.
- **Som**: drone grave, vento em dutos e **obra distante** (bate-estacas, golpes metálicos com ressonância, rangidos de vigas). Soam também gotas ecoando, estalos térmicos do metal, rajadas de ar e roncos distantes.
- **Nada de criaturas**: tudo o que existe foi construído. As formas orgânicas das versões antigas (carcaças com costelas, neurônios, espinhas colossais, tentáculos) foram retiradas.

## A Cidade de perto

**Escala humana**: toda face de galeria, poço e bloco do maciço ganha elementos na escala do corpo:
- escadas de marinheiro contínuas, com patamar a cada 48 m;
- passadiços de grade vazada com guarda-corpo;
- portas de serviço (sem nada atrás), placas, caixas elétricas, tubulação fina.

**Acréscimo e caos**:
- módulos "parasitas" crescendo das paredes, fora do esquadro;
- rios de dezenas de cabos pendurados;
- lajes caídas escoradas nas paredes e montes de entulho;
- passarelas que terminam no vazio com ferragem exposta.

**Camadas intransponíveis**: lajes de concreto de 72 m a cada 2,88 km de altura dividem o mundo. O teto de uma é coberto por caixotões e luminárias raras. Só se atravessa pelas **passagens**, onde uma torre sustenta um **elevador colossal** que sobe e desce continuamente.

**Elevadores de carga** também correm nas fachadas do maciço. Dá para subir em qualquer elevador e ser carregado.

**Construtores**: em canteiros sobre camadas, estratos e pisos de galeria, pórticos gigantes andam nos trilhos, descem blocos, soldam e seguem para o próximo ponto. A estrutura cresce enquanto você olha. Os clarões de solda iluminam a cena, e as marteladas e chiados soam posicionados no espaço.

**Feixes de luz**: colunas de luz caem pelas passagens, pelos buracos dos estratos, por clarabóias nas galerias e pelo meio dos poços. É a poeira que torna o feixe visível: com 0% de névoa, eles quase somem.

**Vestígios**: assentamentos abandonados no piso das galerias, sobre estratos e camadas, com barracos de chapa, varais com panos, fogueira quase apagada (a brasa ainda respira), terminal quebrado, barris e pichações. Não há ninguém.

**Água e vapor**:
- gotas caindo de tetos e passadiços, com poças que refletem as luzes;
- vapor saindo de dutos e fumaça das fogueiras.

**Som que responde ao espaço**: a reverberação muda com o tamanho do lugar. É seca numa sala da colmeia e tem vários segundos de cauda numa galeria ou perto de uma camada. As gotas próximas pingam de verdade, no lugar onde caem.

## Regiões

O caráter do mundo muda de lugar para lugar, por um ruído de baixíssima frequência. Numa amostra de 40×40×12 km, a divisão fica em ~36% teia, 30% colmeia, 26% maciço e 8% vazio.

| região | o que é |
|---|---|
| **Teia** | a trama aberta: pilares, rede andável, cabos, objetos flutuantes, treliças. |
| **Colmeia** | interior **fechado**: um labirinto 3D de salas de 48 m. As salas se comunicam por portas (ou sem parede, fundidas). Algumas têm janelões para poços de luz; outras, escadas em dois lances subindo por um vão no teto, colunas, lâmpadas, entulho. |
| **Maciço** | blocos de concreto de ~150 m de lado e altura sem fim, separados por **vielas-cânion** de 14–48 m. Recuos viram terraços; há sacadas nas fachadas e pontes cruzando as vielas. As passarelas atravessam os blocos por túneis. |
| **Vazio** | quase nada além das megaestruturas. Pilares e plataformas ficam raros. |

Galerias, poços, condutos, estratos e escadarias atravessam todas as regiões.

## Megaestruturas (escala de quilômetros)

Todas são infinitas: não têm começo nem fim visíveis.

| estrutura | tipo | o que é |
|---|---|---|
| **Galerias** | fechada | túneis retangulares ao longo de X ou Z, com 200–460 m de largura e 260–720 m de altura. Por dentro têm contrafortes, sacadas contínuas andáveis, escadas entre sacadas, feixes de tubos, luminárias colossais no teto e prédios no piso. **O ponto de partida fica dentro de uma.** |
| **Poços** | fechada | fossos verticais de 160–420 m, sem fundo nem boca. Têm sacadas em volta e uma **escadaria em zigue-zague** numa das faces: dá para descer (ou subir) para sempre. |
| **Estratos** | aberta | pisos colossais infinitos (24 m de laje), com buracos e florestas de colunas de 20–50 m de lado e até 1,1 km de altura, como uma sala hipostila sem paredes. No topo há blocos habitacionais, muretas e postes; por baixo, cabos pendurados. |
| **Treliças** | aberta | estrutura espacial de vigas de concreto (célula de 240 m) que ocupa regiões inteiras. Dá para andar sobre as vigas. |
| **Condutos** | fechada | tubos de 22–60 m de raio ao longo de X ou Z, com piso interno andável, anéis estruturais e faixas de luz. |
| **Escadarias** | aberta | escadas colossais de 24–44 m de largura, inclinação 1:2, que sobem e descem sem fim, apoiadas em pilares que caem no nada. |
| **Trincheiras e máquinas colossais** | teto | sob algumas camadas correm trincheiras de 160 m de largura, cavadas 56 m na laje, ao longo da grade das passagens. Dentro delas, penduradas em trilhos, **máquinas de 260 m se arrastam a ~3 m/s**, sem operador. De baixo se vê uma plataforma escura atravessando o teto, lâmpadas quentes e cones de luz varrendo a Cidade; a cada poucos segundos vem o baque das garras trocando de trilho, atrasado pela distância. |

**Regras entre estruturas:**
- Onde duas galerias/poços se cruzam, as paredes de uma **se abrem** dentro da outra e os volumes se fundem.
- Onde uma passarela atravessa uma parede, a parede tem um vão e os detalhes (contrafortes, sacadas, tubos) deixam o caminho livre.
- As treliças também desviam das passarelas.

**Estruturas menores (escala humana):**
- blocos habitacionais brutalistas, inclusive suspensos no vazio;
- pilares com casas de máquinas, mastros e luz de obstáculo;
- guaritas, lajes monolíticas e gaiolas de aço;
- a rede andável de plataformas.

## Como o mundo infinito funciona

O espaço é dividido em cubos de **192 m** (chunks). O que existe em cada ponto é uma **função pura de (seed, coordenadas)**, definida em `src/gen/field.js`. Chunks vizinhos gerados em workers diferentes sempre concordam sobre o que há na borda.

- **Pilares**: colunas numa grade 2D, infinitas em y e com lacunas definidas por ruído. Isso gera torres que pendem do nada, torres que sobem do nada e fragmentos soltos, com coroas, raízes, bulbos e tendões.
- **Passarelas**: retas infinitas em treliça (ao longo de Z e de X), em alturas periódicas e com trechos quebrados. A ponte inicial é uma delas.
- **Dutos**: tubos infinitos ao longo de X, Z e Y, o "encanamento" do sistema.
- **Cabos**: catenárias entre pilares vizinhos e fios de prumo pendendo no vazio.
- **Flutuantes**: blocos habitacionais, lajes, anéis e gaiolas.
- **Rede andável**: plataformas numa grade 3D com ruído (há aglomerados densos e vazios enormes). Cada ligação entre vizinhas é sorteada:
  - ponte reta, ponte suspensa ou tubo-corredor fechado;
  - rampa ou escadaria entre níveis;
  - torre com rampa em espiral;
  - pontes longas atravessando vazios.

  Não existe caminho desenhado, mas medimos a rede numa região de 3×3×1,2 km e ~96% das plataformas estão conectadas entre si. Ela também se liga às passarelas infinitas, incluindo a ponte inicial.
- **Camada macro** (células de 1,6 km): as megaestruturas acima, além de monólitos, agulhas e anomalias raras. Elas "furam" a névoa para dar escala.

Detalhes da implementação:

- **Streaming**: os chunks são gerados em **Web Workers** (sem travadas), os mais próximos e à frente primeiro, e sobem para a GPU aos poucos. Os que ficam para trás são descartados.
- **LOD** (acima de 700 m de distância de renderização): três níveis em árvore.

  | nível | cubo | alcance | conteúdo |
  |---|---|---|---|
  | 0 | 192 m | ~750 m | detalhe total |
  | 1 | 384 m | até 1,3 km | só as massas: pilares como troncos de 4 lados, passarelas e ligações como lajes simples, cascas externas da colmeia e do maciço; sem cabos, degraus, corrimãos ou luzes |
  | 2 | 768 m | até o fim do alcance | só pilares, plataformas e blocos |

  Cada região é mostrada por exatamente um nível. Um cubo só é descartado quando o que o substitui já está pronto, então não abrem buracos ao se mover.
- **Lotes de desenho** (`world/batches.js`): tudo que usa o mesmo material é desenhado junto num `BatchedMesh` (multi-draw), com recorte e ordenação por chunk. São ~100 chamadas por quadro em vez de ~730. Os buffers são páginas que nunca são realocadas: um chunk descartado deixa a vaga livre para o próximo de porte parecido, então não há cópias nem travadas. A colisão usa as malhas por chunk, que nunca sobem para a GPU. As normais vão em 8 bits.
- **Oclusão de ambiente + antialiasing temporal** (`render/pipeline.js`): o AO é calculado a partir da profundidade da própria cena (sem segundo passe de geometria), em meia resolução, e some com a distância e a névoa. O TAA usa tremor sub-pixel, reprojeção pela profundidade e limitação pela vizinhança em YCoCg: cabos, grades e corrimãos param de cintilar, e o ruído do AO converge. Juntos custam ~0,3–1,9 ms de GPU. Os dois podem ser desligados nas configurações.
- **Sombras na névoa** (`render/pipeline.js`): para as 4 luzes mais fortes em cena, cada pixel (em ¼ de resolução) percorre o caminho até a luz e mede quanto do halo está bloqueado por geometria mais próxima que ela. Vigas e pilares recortam faixas de sombra na poeira iluminada, com um leve reforço nos raios que passam. O brilho médio quase não muda. Proporcional à densidade da névoa; pode ser desligado.
- **Carregamento sem travadas grandes**: criar uma página de lote manda o buffer inteiro para a GPU, e o Chrome faz isso em pedaços que esperam a fila de desenho (chegava a ~250 ms). As páginas agora têm no máximo 2¹⁷ vértices, e a próxima é criada antes de ser necessária, num quadro sem outros envios. No voo 6×, os quadros acima de 33 ms caíram de 71 para 22 em 30 s, e o p99 de 56 para 18 ms.
- **Shader enxuto**: o `discard` só existe nos materiais de recorte (escadas, grades, pichação), o que mantém o teste de profundidade antecipado da GPU nos demais. O ruído fbm para nas oitavas menores que um pixel, luzes que não contribuem pulam o especular, e a atenuação câmera→luz da névoa é calculada uma vez por quadro na CPU. Na RTX 4060 o custo de GPU da cena caiu de 8,5–10 ms para 4,3–5,4 ms nos mesmos pontos.
- **Origem flutuante**: a cada ~1,5 km o mundo é reindexado de volta para perto do (0,0,0). Por isso não há tremedeira de float mesmo a centenas de km. As texturas dão a volta a cada ~65 km; ali o padrão salta, algo raríssimo.
- **Névoa relativa ao observador**: em qualquer altitude o abismo brilha abaixo e a névoa afina acima. Perto do raio de carregamento tudo se dissolve na névoa, então nada "brota" no horizonte.
- **Luzes dinâmicas**: entre todas as luzes dos chunks carregados, as 12 mais relevantes ocupam os slots do shader, com fade ao trocar.
- **Setores inundados** (`gen/floods.js`): regiões inteiras do alto das camadas e dos estratos cobertas por ~60 cm de água parada, contida por diques baixos (dá para pular). Anda-se pelo fundo, mais devagar e com passos na água. Um **reflexo planar** de verdade (`render/reflection.js`), em meia resolução, liga só perto da água: as lâmpadas se refletem tremendo e as estruturas aparecem espelhadas. Custa ~4 ms de GPU nesses lugares e pode ser desligado.
- **Cemitérios de Construtores**: ~30% dos canteiros estão mortos. O pórtico parou torto sobre uma perna que cedeu, o gancho caiu com a carga, a obra ficou pela metade e há blocos espalhados; às vezes pórticos mais antigos já tombados ao lado. Só uma lâmpada de aviso vermelha pisca.
- **Interiores do maciço** (`gen/closed.js`): ~25% dos blocos são ocos, com portas nos níveis de 48 m onde chegam sacadas e pontes. Há salas de máquinas (mezaninos, passarelas no átrio e turbinas colossais deitadas no fundo), silos (rampa em espiral quadrada de 48 m por volta, sedimento no fundo sob um feixe de luz) e depósitos (pilhas de blocos em estantes, com corredores).
- **Terminais mortos** (`world/terminals.js`): consoles nas estações dos transportadores e no alto das passagens das camadas. A tela escreve, linha a linha, registros procedurais: manutenção adiada há milhões de ciclos, "habitantes registrados: 0", avisos, listas de setores. Algumas palavras já foram tomadas pelo alfabeto da Cidade. Nas estações, uma linha é viva e sempre legível: o horário real do próximo vagão (embarque, próxima composição, atrasada, suspensa). Sem energia, a tela apaga.
- **Apagões de setor** (`world/outages.js`): a cada 1–2,5 min uma região de 200–600 m perde energia. As lâmpadas apagam em cascata do centro para fora (estalando na frente da queda), as janelas e linhas técnicas apagam junto no shader, e o setor fica às escuras por 15–45 s. Depois a energia volta do centro, lâmpada por lâmpada, gaguejando antes de firmar. Há som de contator, zumbido da rede descendo e relés em cascata. Fogos-fátuos e os Construtores não são da rede e continuam acesos. **Vagões e elevadores param**: cada linha de transportador tem um relógio próprio, que freia em ~6 s quando um vagão dela fica sem energia e retoma devagar (~12 s) na volta, mantendo o horário contínuo. A interface avisa quem está a bordo. Dá para desligar nas configurações.
- **Silhuetas colossais** (`world/silhouettes.js`): torres infinitas, lajes de vários km e vigas de dezenas de km entre 7 e 45 km de distância, só como sombras mais escuras na poeira. São determinísticas e inalcançáveis: ao se aproximar, dissolvem-se na névoa e o mundo real assume. Elas não entram na cena: são desenhadas numa máscara de meia resolução, e o cálculo de névoa de todos os materiais escurece a cor da névoa onde há uma sombra atrás. Assim o céu, a geometria distante já dissolvida e as silhuetas concordam, sem recortes.
- **Colapsos distantes** (`world/collapses.js`): a cada 1–3 min um pedaço de um pilar real, à sua frente e a 150–380 m, range e se solta. Ele cai girando, com destroços e rastro de poeira. O estalo chega atrasado pela distância, e o estrondo do impacto, lá embaixo e invisível, vem segundos depois.
- **Cascatas** (`gen/cascades.js`): canos rompidos nas paredes dos poços (uma chance a cada 480 m de altura) e das galerias (a cada 900 m) jorram água em arco. A água cai a prumo, abrindo-se em spray, até a camada de baixo ou o piso (com poça e névoa), ou se desfaz em névoa no abismo. O rugido é posicional pela cascata mais próxima.
- **Transportadores** (`gen/transit.js`, `world/transitCars.js`): ~40% das passarelas infinitas têm um trilho paralelo, com estações a cada 1.440 m (plataforma, abrigo, luz, placa). Um vagão para em cada estação por 14 s com o lado aberto para a plataforma, parte, chega a ~130 km/h e freia na estação seguinte. O horário é determinístico e contínuo, então dá para embarcar, viajar quilômetros e descer em qualquer estação. Tudo que desvia de passarelas (pilares, treliças, plataformas da rede, paredes das galerias) desvia também do trilho; a colmeia é escavada em túneis e o maciço abre cânions. Ao pular de um vagão em movimento, o corpo conserva a velocidade dele. De fora, o vagão mais próximo ronca conforme a distância e a velocidade, e quando passa rente vem uma lufada com as juntas batendo.

## A travessia

- **Continuar de onde parou:** o jogo guarda sozinho, no mundo salvo do modo, a seed, a posição, a direção do olhar, o diário, o mapa e o que mudou no mundo (a cada 5 s e ao fechar). Ao abrir, você volta exatamente ali. No painel **MUNDOS** dá para continuar o mundo do outro modo ou começar um mundo novo (substitui o daquele modo, com confirmação). O salvamento de antes dos modos vira o mundo do modo Livre.
- **Mapa da travessia** (M): o caminho deste mundo guardado entre sessões, um ponto a cada ~8 m. Aparece como uma linha de luz em 3D, com trilhos, teleportes tracejados, quedas e fotos marcadas, escala e extensão.
- **Diário da travessia**, na tela de entrada e acumulado no mundo: distância a pé, em deriva e sobre trilhos (e número de viagens), maior queda, ponto mais fundo e mais alto, regiões visitadas, apagões e colapsos testemunhados, fotos e tempo na Cidade.
- Só o `npm start` normal lê e grava isso. Qualquer flag de desenvolvimento (`--seed`, `--pos`, `--capture`…) roda uma sessão avulsa que não mexe no seu salvamento. `--profile=pasta` usa um perfil separado.

### Controle de videogame

Analógico esquerdo move e o direito olha; **A** pula ou sobe, **B** desce, **LT/L3** corre, **X** alterna andar/voar, **RB** tira foto, **Select** esconde a interface e o **direcional ↑** liga o piloto automático. Na tela de entrada, qualquer botão entra (o controle não usa a trava do mouse). O controle vibra nos pousos, nas juntas do trilho, nos colapsos, nos apagões e quando um vagão passa rente.

## Transporte

A Cidade é grande demais para ser percorrida. A tecla **T**, ou o botão **TRANSPORTE** na tela de entrada, leva você ao exemplar **mais próximo** de cada tipo de lugar. Apertar de novo o mesmo botão leva a outro exemplar (os últimos oito visitados de cada tipo são pulados).

- **Regiões:** teia, colmeia, maciço, vazio, setor inundado.
- **Interiores:** sala de máquinas, silo, depósito.
- **Estruturas:** galeria, poço, conduto, estrato, treliça, escadaria, camada/elevador.
- **Outros:** Construtores (você chega a ~160 m do canteiro, de frente para o pórtico), cemitério de Construtores, cascata (na borda da poça), transportador (na plataforma de uma estação), máquina colossal (você chega flutuando à frente dela, e ela passa por cima) e a ponte inicial.

A busca usa as funções puras do `Field`, então não precisa que o lugar esteja carregado. O ponto de chegada sempre tem chão: a laje de uma sala, o topo de um bloco, uma plataforma da rede, uma sacada, o piso de um conduto, uma viga. O corpo paira até a geometria em volta ficar pronta. No vazio, se não houver nenhuma plataforma por perto, você chega voando.

## Configurações

A tecla **O**, ou o botão na tela de entrada, abre o painel. Os valores ficam salvos entre sessões.

| opção | efeito |
|---|---|
| distância de renderização | 240–2400 m. Acima de 700 m entra o LOD. A névoa afina proporcionalmente, para a borda continuar escondida, e a camada macro acompanha (até 5 km). |
| densidade da névoa | multiplica a névoa (0–200%). O brilho em volta das luzes vem da poeira: com 0% não há halos, e a Cidade fica escura, iluminada só pelas próprias lâmpadas. |
| campo de visão | 50–100° |
| sensibilidade do mouse | 0,3–3× |
| resolução | limite da densidade de pixels. Baixar ajuda muito o desempenho. |
| oclusão de ambiente (SSAO) | ligado por padrão |
| antialiasing temporal (TAA) | ligado por padrão |
| apagões de setor | ligado por padrão |
| colapsos distantes | ligado por padrão |
| raios de luz na névoa | ligado por padrão |
| reflexo da água | ligado por padrão |
| trilha (acordes raros e lentos) | ligado por padrão |
| balanço da cabeça / efeitos de queda | ligados por padrão (conforto: desligue se enjoar) |
| inverter eixo vertical | desligado |
| realocar ao cair | desligado por padrão |

## Modo andar

- **Colisão real** contra a geometria, com BVH (`three-mesh-bvh`) construída sob demanda nas malhas próximas. Sobe degraus e rampas (até ~55°), desliza em paredes e pula. Cabos e tentáculos não colidem.
- **Qualquer superfície serve de chão**: além da rede, dá pra pisar em passarelas, dutos, coroas de pilares e megaestruturas.
- **Queda com peso**: o vento cresce com a velocidade, o campo de visão abre, a câmera treme acima de ~22 m/s e a poeira vira riscos. O pouso afunda a câmera proporcionalmente ao impacto. Em quedas grandes vêm estrondo e destroços; acima de ~35 m/s o som abafa e fica um zumbido no ouvido por alguns segundos. Quedas de mais de 80 m ficam registradas na interface.
- **Queda longa**: cair no vazio é para sempre. Opcionalmente (configurações → *realocar ao cair por muito tempo*), depois de ~5,5 s de queda o sistema te realoca na plataforma mais próxima, com aviso na interface.
- **Mundo ainda carregando**: se a geometria ao redor ainda não foi gerada, o corpo paira até ela chegar.
- **Lanternas**: os fogos-fátuos orbitam perto de você, iluminando o caminho.
- **Passos por superfície**, todos sintetizados: concreto, chapa de aço (ressoa), grade vazada (chacoalha) e poça (respingo).
- **Escadas**: encostado numa escada, W sobe e S desce. A/D solta para o lado, mas só se houver patamar ali: o corpo encaixa no nível.
- **Elevadores e vagões**: o que você pisa pode se mover, e você vai junto. A bordo, o trilho ronca e as juntas batem a cada 12 m.

Não há partes fixas: você começa sobre a ponte inicial, uma passarela infinita como qualquer outra, e tudo ao redor é gerado pela mesma lei do resto da Cidade.

## Estrutura

```
main.js                     Electron (protocolo app://, atalhos, flags de dev)
index.html                  import map do three + overlays
src/
  app.js                    bootstrap e loop principal (as peças compartilham um contexto)
  app/render.js             renderizador, pós-processamento, reflexo, foto
  app/body.js               o corpo: passos, água, queda, vagões, vibração
  app/sound.js              sons e avisos dos acontecimentos do mundo
  app/travel.js             salvamento, diário e mapa da travessia
  app/saves.js              perfil global + um mundo salvo por modo (o que mudou, por id estável)
  app/modes.js              modos de jogo (Livre, Peregrinação) e suas regras
  app/player.js             estado do corpo: energia, ferramentas, acesso (ainda sem efeito)
  core/events.js            barramento de eventos (mundo e corpo → som, interface, diário)
  i18n/                     textos da interface: en.js (padrão), pt.js
  app/ui.js                 tela de entrada, painéis, teclas, teleporte, novo mundo
  app/dev.js                flags de desenvolvimento
  dev/check.js              teste de fumaça (npm run check)
  lib/three.js              ponte do three.js que funciona dentro dos workers
  core/rng.js, noise.js     RNG por seed, simplex 3D + fbm (CPU)
  gen/hash.js               hash de coordenadas → base de tudo que é infinito
  gen/field.js              A LEI DO MUNDO: pilares, passarelas, dutos
  gen/chunkgen.js           gera um chunk (roda no worker)
  gen/network.js            geometria da rede andável (plataformas e ligações)
  gen/macrogen.js           megaestruturas: galerias, poços, estratos, treliças, escadarias
  gen/dressing.js           detalhes delas na escala humana (sacadas, escadas, prédios)
  gen/closed.js             regiões fechadas: colmeia (salas) e maciço (blocos e vielas)
  gen/human.js              escala humana, acréscimo, cabos, desabamento, vestígios, gotas
  gen/beams.js              geometria dos feixes de luz
  world/elevators.js        elevadores (animados, colidíveis, carregam o corpo)
  world/builders.js         os Construtores (pórticos erguendo estruturas ao vivo)
  world/teleport.js         transporte: acha o exemplar mais próximo de cada tipo de lugar
  world/batches.js          lotes de desenho (BatchedMesh por material, páginas sem realocação)
  world/outages.js          apagões de setor
  world/silhouettes.js      silhuetas colossais a dezenas de km (máscara da névoa)
  world/collapses.js        colapsos distantes (fragmentos de pilares caindo)
  world/transitCars.js      vagões dos transportadores (horário determinístico, relógio por linha)
  world/colossi.js          máquinas colossais nas trincheiras sob as camadas
  world/terminals.js        terminais mortos (registros procedurais, horário dos vagões)
  ui/journey.js             diário da travessia
  ui/worlds.js              painel MUNDOS (escolher o modo, continuar, mundo novo)
  ui/trailmap.js            mapa da travessia (M)
  gen/floods.js             setores inundados (água e diques)
  render/reflection.js      reflexo planar da água
  gen/cascades.js           cascatas (canos rompidos, jato, poça, névoa)
  gen/transit.js            trilhos e estações dos transportadores
  render/pipeline.js        passe de cena: SSAO + TAA
  world/particles.js        gotas e vapor (animação no vertex shader)
  gen/colors.js             cores das luzes geradas (sódio, fluorescente, frio, alerta, solda)
  world/chunkWorker.js      o worker
  world/chunks.js           WorkerPool + ChunkLayer (streaming)
  world/world.js            orquestra streaming, sistemas e origem flutuante
  world/lights.js           seleção dinâmica de luzes
  world/collision.js        colisão (BVH) para o modo andar
  controls/noclip.js        entrada, olhar, modos andar/voar, piloto automático
  controls/walker.js        física de caminhada (chão, paredes, degraus, pulo)
  world/geometry.js         tubo afunilado, merge, cilindro entre pontos
  world/lsystem.js          L-system estocástico 3D + tartaruga
  world/cables.js           catenárias, tentáculos, fios de prumo
  shaders/chunks.js         GLSL: simplex, fbm, névoa volumétrica
  shaders/materials.js      superfícies, feixes, cascatas, poeira, céu
  shaders/post.js           filme: dessaturação, grão, vinheta
  audio/audio.js            áudio procedural (Web Audio)
  ui/hud.js                 leitura de instrumento do modo Livre
  ui/settings.js            painel de configurações (tecla O)
  ui/transport.js           painel de transporte (tecla T)
```

## Como expandir

**Algo novo em todo lugar**: escreva uma função `genAlgo(F, B, box)` em `src/gen/chunkgen.js` e chame em `generateChunk()`. Siga estas regras:
- construa em coordenadas locais com `B.L(xGlobal, yGlobal, zGlobal)`;
- use `rngAt(F.seed, ..., SAL_ÚNICO)` para ser determinístico;
- adicione com `B.add('nomeDoMaterial', geometria)`;
- luzes vão em `B.light(x, y, z, cor, intensidade, modo)`.

Uma estrutura contínua entre chunks (como pilares e dutos) precisa ser definida no `Field`, para que todo chunk saiba o que atravessa sua borda.

**Nova megaestrutura**:
1. Defina a "lei" dela no `Field` (`src/gen/field.js`), como `gallery()` / `shaft()`: uma função pura de índices de uma grade, mais uma consulta "o que existe perto de (x,y,z)".
2. Construa as placas em `src/gen/macrogen.js`, respeitando a posse por centro de placa e `F.insideVoid()` para se fundir com as outras.
3. Coloque os detalhes de perto em `src/gen/dressing.js`.

Parâmetros globais (espaçamentos, probabilidades, espessuras) ficam em `MEGA` (`field.js`).

**Novo objeto flutuante**: adicione uma entrada em `FLOATERS` (`src/gen/chunkgen.js`).

**Novo tipo de ligação andável**: adicione uma entrada em `EDGES` (`src/gen/network.js`) e sorteie-a em `Field.edge()`. Mantenha o topo das superfícies na altura do caminho e a inclinação ≤ ~36°.

**Densidade da rede**: ajuste `density` em `Field.node()` e as chances em `Field.edge()`. Probabilidades baixas demais quebram a rede em ilhas.

**Nova "espécie" de L-system**: adicione uma gramática em `GRAMMARS` (`world/lsystem.js`). Os símbolos são: `F` avança, `+ -` yaw, `& ^` pitch, `\ /` roll, `!` afina, `[ ]` galho.

**Materiais**: estão em `World._createMaterials()`, montados a partir de receitas (concreto, concreto escuro, aço, borracha, orgânico). Os parâmetros de `createSurfaceMaterial` são:
- `base` (cor), `accent` / `accentAmount` (ferrugem), `panel` (tamanho da placa em m), `streaks` (escorrimentos);
- `windows` (fração de janelas acesas), `windowSize`, `windowColor`;
- `circuitAmount` (linhas técnicas fracas);
- `organic` (0–1, mistura a "carne" das anomalias);
- `fogAmount`: abaixo de 1, a peça fura a névoa;
- `fade`: a distância em que a peça se dissolve.

Não use `material.clone()`, porque ele desconecta os uniforms compartilhados.

**Densidade / alcance**:
- `LOAD_RADIUS` e `MACRO_RADIUS` ficam em `world/world.js`;
- as probabilidades ficam em `gen/field.js` (`prob` dos pilares, `WALK`, `DUCT`) e em `genFloaters`.

**Névoa / luz**: `createSharedUniforms()` em `shaders/materials.js`. Os parâmetros são `uFogDensity`, `uFogFalloff`, `uScatter`, `uFogColorA/B` e `uAmbient`. A paleta das luzes fica em `PALETTE` (mesmo arquivo) e em `src/gen/colors.js`; a saturação final, em `uSaturation` (`shaders/post.js`).

**Som**: veja `audio/audio.js`. Os comentários no topo de cada arquivo explicam como adicionar tipos.

## Desenvolvimento

```bash
npm run check
npm run check:pilgrimage
```
Teste de fumaça: numa seed fixa, visita todos os destinos do painel de transporte. Em cada um espera o terreno carregar, mede o fps (média e pior quadro) e confere se o corpo não atravessou o chão. No meio do roteiro força um apagão e um colapso. Erros de script, de shader e de WebGL reprovam. Sai com código 0 (passou) ou 1, e não toca no seu salvamento. `--check=trelica,escadaria --pos=x,y,z` roda só esses destinos, nessa ordem, partindo desse ponto.

```bash
npx electron . --stats
```
Imprime FPS, chunks carregados, fila de geração, lotes (uso, vagas livres, compactações), draw calls, triângulos, heap e a GPU em uso. Também mostra o tempo de CPU das listas de desenho e, perto da água, o tempo de GPU do reflexo. Com `--novsync` o limite de quadros é removido, para medir desempenho de verdade. `--outage=4` força um apagão de setor aos 4 s, e `--collapse=4` um colapso distante.

```bash
npx electron . --capture=shot.png --pos=2000,-800,3000,0.3,0 --seed=abc --delay=8 --show
```

`--goto=construtores` (ou qualquer tipo do painel de transporte: `teia`, `colmeia`, `macico`, `vazio`, `inundado`, `maquinas`, `silo`, `deposito`, `galeria`, `poco`, `conduto`, `estrato`, `trelica`, `escadaria`, `camada`, `cemiterio`, `cascata`, `transportador`, `colosso`, `ponte`) começa já transportado.

`--fog=0.3` e `--dist=1500` sobrescrevem a névoa e a distância só nesta sessão, sem salvar.
Captura um PNG num ponto qualquer do mundo. Outras flags:
- `--view=spawn|abyss|up|far` usa um ponto de vista pronto;
- `--autopilot=6` começa em piloto automático (o número multiplica a velocidade);
- `--mode=fly` começa voando (o padrão é andar);
- `--seed` usa base 36.

Sem `--show`, a janela oculta faz o Chromium desacelerar o loop, e a simulação quase não avança.
