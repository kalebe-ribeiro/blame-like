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
- **Peregrinação**: a pé, sem transporte e quase nada na tela. É o modo com progressão: ler a Cidade, seguir o que ela deixou, religar setores, fugir (ou enfrentar) os Safeguards, encontrar os raros vivos e procurar o **gene de terminal**, à maneira de *Blame!*.

O jogo é em **inglês** por padrão, com **português** como opção nas configurações. Os textos ficam em `src/i18n/` (um arquivo por idioma).

## Controles

**Regra absoluta: o controle de videogame é completamente independente do teclado e do mouse.** Tudo o que se faz com eles, no jogo e em todos os menus, dá para fazer só com o controle (`npm run check:pad` confere, com um controle simulado).

Todas as teclas e botões do controle estão na aba **CONTROLES** (tecla **K**, ou o botão na tela de entrada), só com o que existe no modo do mundo aberto. Clicar numa célula e apertar outra tecla (ou outro botão do controle) troca o atalho; ESC cancela e BACKSPACE apaga. Se a tecla já era de outra ação do mesmo modo, as duas trocam, e a aba avisa. Os atalhos ficam salvos (`controls/bindings.js`), e os textos do jogo que citam uma tecla ("TOMADA [E]", "E / ESC fechar"…) usam o atalho atual, ou o botão do controle, se foi ele o último usado.

Padrões:

| ação | teclado | controle | modo |
|---|---|---|---|
| mover | WASD | analógico esquerdo (fixo) | |
| olhar | mouse (fixo) | analógico direito (fixo) | |
| pular · subir voando | ESPAÇO | A | |
| descer voando | CTRL | B | Livre |
| correr · acelerar 6× voando | SHIFT | LT | |
| andar ↔ voar | F | X | Livre |
| piloto automático (voo): deriva sozinho, curvando devagar | P | direcional ↑ | Livre |
| usar: ler um terminal, conectar numa tomada, falar, pegar, deitar na câmara, instalar uma prótese | E | Y | |
| emissor (a arma): segurar carrega, soltar atira · cancelar | Q ou clique esquerdo · SHIFT ou clique direito | RT · LT (segurando RT) | |
| inventário e as mãos | I | R3 | |
| lanterna | F | X | Peregrinação |
| lanterna (sem célula) | L | L3 | Livre |
| sensor | G | direcional ↓ | Peregrinação |
| pintar uma marca (ou apagar a marca em que você mira) | V | LB | |
| foto: um quadro limpo (sem interface nem grão, 16 quadros de TAA) em até 4K, em Imagens/CYBERCOSMIC | F2 | RB | |
| menu (a tela de entrada; nela, volta ao jogo) | ESC (fixo) | START | |
| mapa da travessia | M | SELECT | |
| interface (posição, região, seed, registro) | H | direcional → | Livre |
| transporte | T | — | Livre |
| mundo novo (nova seed) | R | — | Livre |
| configurações | O | — | |
| controles | K | — | |
| tela cheia | F11 | direcional ← | |
| DevTools (fixo, desenvolvimento) | F12 | | |

Numa escada, frente e trás sobem e descem (encostado nela); esquerda e direita soltam para o patamar do lado. Clicar na tela de entrada entra no mundo (trava o mouse e liga o áudio).

### A arma, a vida, os inimigos, os vivos e o gene

Em detalhe no cofre (`cybercosmic-obsidian/`); aqui, o essencial:

- **O emissor** (a arma de Killy, `app/beam.js`): segurar carrega (até 400 m de alcance e 2,8 m de raio). Passando de 3 s entra na **sobrecarga** (até 1 km e 7,7 m de raio; além, até 2 km e ~19 m: um túnel). O furo é cilíndrico e de verdade: o que ele atravessa é cortado e fica cortado no mundo salvo. O coice empurra, e muito na sobrecarga. Além do limite, **o braço que atira se desfaz**. Gasta a célula. As camadas (as lajes) e as estruturas únicas são intransponíveis: o feixe acaba nelas, mas entra nas trincheiras das máquinas colossais.
- **Estruturas ativas** (`world/dynamic.js`): as máquinas colossais, os vagões, os carros dos elevadores e os pórticos dos Construtores recebem cortes de verdade e continuam funcionando. Param de vez se o corte pega um ponto essencial (o núcleo, os truques, os cantos dos cabos, a base das pernas) ou se a resistência deles acaba depois de vários cortes. Um trilho cortado também para a linha, a trincheira ou o pórtico. Onde pararam fica no mundo salvo.
- **A vida** (`app/health.js`): ligada na Peregrinação, opcional no Livre. Quedas tiram vida pela altura (50 m zeram), assim como o golpe dos Safeguards (que arremessa) e a sobrecarga do emissor (mais a cada estágio). Zerou, você desmaia e acorda longe. Ela volta sozinha (1%/s depois de 6 s sem dano).
- **Safeguards** (`world/safeguards.js`): um em ronda por território; saem das paredes quando o alerta do setor sobe. Têm três níveis, com arranque e velocidade diferentes: o médio-fraco mata o baixo, o médio pede vários tiros, o alto muitos. O colapso mata qualquer um.
- **Os raros vivos** (`world/npcs.js`): vilas habitadas (conversa, trocas, cargas para entregar), andarilhos ambíguos e a vida de silício. Ferir um morador torna a vila hostil.
- **Recuperar o braço** (`app/arms.js`): a câmara de reconstrução (os dois braços, 50% da célula), uma prótese de um andarilho (40%) ou achada num cemitério ou depósito, ou um morador (30% ou uma carga).
- **O gene de terminal** (`gen/gene.js`, `app/gene.js`): o objetivo final. Numa seed há um de cada: guardado num cofre com guardas (150–300 km), esquecido num cofre (100–250 km) e numa vila portadora (80–200 km, achada com o analisador de genes). O implante é na câmara de reconstrução e leva a três finais.

### O corpo na Peregrinação

- **O começo**: um mundo novo da Peregrinação começa num lugar diferente em cada seed, na plataforma de uma estação num setor apagado, de frente para um **terminal morto**, com o leitor portátil, pouca carga e a lanterna apagada (acender ou poupar é decisão sua). A primeira leitura já traz a primeira pista, sempre com a distância.
- **O aparelho na mão direita**: uma telinha em cima com a carga (dez gomos) e o sensor. Nada de barra na tela do jogo.
- **A lanterna na mão esquerda**: guardada até você ligar. Então a mão a traz para a frente (~0,5 s), e só quando ela chega o facho acende; ao desligar, apaga e desce. Ela aponta para onde vai o facho, com o mesmo atraso de mão.
- **A lanterna é um facho**, não um brilho em volta do corpo: um cone de ~20° com miolo quente, o anel do refletor, manchas fixas da lente e um véu fraco em volta, que alcança ~30 m, acende a poeira no caminho (o cone aparece no ar) e segue o olhar com um leve atraso da mão, mirando onde os olhos olham. Perto, clareia sem estourar. Fora do facho, só um resto de luz rebatida (`flashProfile`/`flashScatter` em `shaders/chunks.js`).
- **A célula de energia**: a lanterna gasta (carga cheia dura 7 min) e falha quando está no fim; sem carga você ainda anda, só enxerga o que a Cidade ilumina. Um mundo novo começa com pouca carga.
- **Tomadas**: caixinhas nos postes das passarelas, das plataformas e nos abrigos das estações. Recarregam enquanto você fica perto, se o setor tiver energia.
- **O sensor**: achado ao pé do terminal no fim da primeira pista (e junto do console de toda estrutura única, até você ter um). Na tela do aparelho, de que lado vem o sinal mais forte, se ele está **acima ou abaixo** (▲ ▼, ou um traço no mesmo nível) e o quanto ele é nítido, nunca a distância; atrás de você, uma seta na borda. Escuta **terminais** (o console das únicas se ouve a 2,5 km), **energia viva** (setores com energia, tomadas carregadas) ou **movimento** (máquinas colossais, vagões). No modo terminais, o lugar de uma pista aberta soa diferente: é assim que você sabe que chegou. Gasta a célula (carga cheia dura 15 min).
- **Queda e despertar**: uma queda que seria fatal (ou uma queda sem fim) não mata. A vista desaba até o chão, as bordas fecham, o foco se perde, o som abafa; no escuro, só o coração. Você é arrastado aos puxões por algo que nunca dá para ver, e acorda num lugar qualquer, longe.

## A língua antiga

A Cidade fala a língua de quem a construiu e se perdeu na própria obra: humana, técnica, escrita em **estêncil** (letras de traços retos com as pontes do molde). Os números são legíveis desde o começo; as palavras, não.

- **Terminais**: diante de um, **E** abre o texto no centro da tela. Registros de manutenção adiada há milhões de ciclos, falhas, contagens, a burocracia da Netsphere (o gene de terminal, os residentes ilegais) e, raramente, fragmentos de quem se perdeu. As palavras já entendidas aparecem no seu idioma; as outras, em estêncil.
- **Aprender**: cada palavra é entendida depois de vista em fontes diferentes o bastante (as comuns em 2, as incomuns em 4, as raras em 7). Palavras entendidas durante a leitura "se resolvem" na frente dos seus olhos. O léxico é **global** (vale em todos os mundos) e só cresce na Peregrinação.
- **Endereços nas paredes**: tinta de estêncil gasta ao lado das passarelas que atravessam galerias e maciços, e nas placas das estações. Setor, nível, galeria, com formatos que mudam de setor para setor, códigos riscados e renumerados. Ler de perto também ensina, e a palavra que nomeia o lugar conta dobrado.
- **Leitor portátil** (Peregrinação): diante de um terminal sem energia, E gasta 8% da célula e arranca um fragmento do que ele guarda.
- **O diário como arquivo**: na tela de entrada, as abas DIÁRIO, REGISTROS (os terminais lidos; clicar relê com o que você sabe agora), PISTAS (Peregrinação) e LÉXICO.

## Pistas (Peregrinação)

Não há missões. Uma pista é um endereço que você leu e decide seguir.

- **A rota**: parte dos terminais tem uma linha ROTA, com o **setor** (o código da Cidade), o **nível** e a **distância** de outro lugar que existe de verdade. Um terminal com energia mostra tudo; o leitor portátil arranca uma ou duas partes por fragmento, e as outras saem apagadas.
- **Estreitar**: a distância é um número, sempre legível, e sozinha já dá um **anel** em volta de onde a pista foi lida. O setor e o nível só valem quando a palavra (SETOR, NÍVEL) já foi entendida. Juntar partes e aprender palavras encolhe a área de incerteza da pista, no mapa e no diário. Os códigos de setor pintados nas paredes dizem se você está no lugar certo, e o sensor confirma.
- **Chegar**: ler o terminal citado fecha a pista, e lá, muitas vezes, há outra.
- **Cadeias**: os terminais comuns apontam para a **estrutura única** mais próxima (um elo alguns quilômetros mais perto dela, ou ela mesma); o console de uma estrutura única aponta para um terminal a 40–55% do caminho até a próxima. As cadeias nunca voltam para onde estiveram e nunca acabam.
- **Estruturas únicas**: raras (uma a cada ~16 km, no alto das camadas), com porta, luzes e um console com energia própria. Ler o console pela primeira vez num mundo tem um efeito:

  | estrutura | efeito |
  |---|---|
  | arquivo de registros | salto de tradução: 14 palavras ainda não entendidas passam a ser entendidas |
  | usina | religa os setores apagados a até 2,5 km, com a luz saindo dali |
  | console ativo | mostra no mapa as 3 estruturas únicas mais perto (pistas completas) |
  | sala de controle dos Construtores | marca no mapa os canteiros da laje, num raio de 6 km (vivos e mortos) |
  | terminal de transmissão | uma casinha ao pé de um mastro de ~110 m com luz de alerta; o sensor passa a ouvir 2,5× mais longe |

## Religar setores (fase 4)

- **Subestações**: um setor permanentemente apagado tem subestações, uma por faixa de ~480 m de altura. São armários de manobra com alavanca, na ponta da placa de uma plataforma de estação do próprio setor. Qualquer uma delas religa o setor inteiro. A estação onde um mundo da Peregrinação começa nunca tem uma, para o começo continuar no escuro.
- **Achar**: os terminais de um setor apagado citam a subestação dele numa linha de ROTA (setor, nível, distância). É uma pista como as outras e fecha quando o setor é religado.
- **Religar**: E (Y no controle) diante do armário. Na Peregrinação a subestação precisa de um tranco da sua célula (20%); no Livre é de graça. A alavanca sobe, a lâmpada âmbar acende e a luz volta como uma frente que sai dali a 40 m/s: lâmpadas, janelas e linhas técnicas, trens, elevadores, terminais (texto completo) e tomadas.
- **A Cidade lembra**: o setor religado fica no mundo salvo, aparece no mapa em âmbar e conta no diário (SETORES RELIGADOS).
- Transporte (modo Livre): destino **Subestação**. Desenvolvimento: `--goto=subestacao --restore=8` religa aos 8 s.

## Subir nas máquinas colossais (fase 4)

- **Escotilhas de manutenção**: ao longo de cada trincheira, a cada ~1,3 km, falta uma placa da laje (um vão de 80 m). Uma passarela sai da borda até o meio do vão; dali uma escada desce ~34 m até uma plataforma pendurada na altura das longarinas da máquina.
- **O horário**: um terminal na borda (com energia própria) diz quando passa a próxima máquina ("PRÓXIMA MÁQUINA: 7 MIN", ou EMBARQUE quando ela está passando). As máquinas agora são mais frequentes (uma a cada ~2,6 km de trincheira, 75% das vagas) e um pouco mais rápidas (4 m/s).
- **Embarcar**: quando a máquina passa sob a plataforma, é só descer para a longarina (a 0,4 m). As longarinas são o convés: 260 m de comprido, 12 de largo. Quem está em cima vai junto. Para descer, espere a próxima escotilha passar e pule para a plataforma dela.
- Transporte (modo Livre): destino **Escotilha de manutenção**. Desenvolvimento: `--goto=colosso --ride=8` põe o corpo numa longarina e diz no console se ele foi junto.

## Marcas deixadas por você (fase 4)

**V** (LB no controle) pinta uma seta de estêncil em spray na superfície para onde você olha, até 7 m. Ela aponta na direção do olhar projetada na superfície: mire um pouco para o lado e ela aponta para o lado; olhando reto para uma parede, aponta para cima. Mirar numa marca e apertar de novo a apaga. A tinta só aparece com luz (a mesma conta das inscrições, lanterna incluída). As marcas ficam no mundo salvo (até 400), aparecem no mapa como setinhas e vão junto quando você compartilha a seed. As de outra pessoa vêm em cor de ferrugem.

## Seeds compartilháveis (fase 4)

No painel **MUNDOS**, **COPIAR CÓDIGO** põe na área de transferência um código com a seed, o modo e as suas marcas. Quem recebe usa **COLAR CÓDIGO**, confere (seed, modo, quantas marcas) e começa aquele mundo, que substitui o mundo salvo daquele modo, com confirmação. Como o mundo é determinístico, é a mesma Cidade, com o mesmo começo e as suas setas pintadas em cor de ferrugem. O estado da sua travessia (setores religados, pistas, léxico) não vai junto: cada um faz a própria. Tudo por botões, então funciona pelo controle.

## Travessias difíceis (fase 4)

- **Escada de manutenção nas passagens**: num setor apagado o elevador colossal para, e a camada vira um beco sem saída. Ao lado da ponte +z de cada passagem há um mastro com escada (~220 m) da plataforma de embarque de baixo até o alto da camada, com lâmpadas pequenas de energia própria. A escolha passa a ser subir no escuro ou achar a subestação e religar.
- **Pistas para as máquinas**: no alto das camadas, o terminal da passagem cita a escotilha mais perto (até 4 km), e o de uma escotilha cita a próxima no sentido em que as máquinas andam, a viagem que dá para fazer pendurado.

## Setores de energia

A Cidade é dividida em setores de formas e tamanhos irregulares (só as camadas os separam na vertical). Cerca de 30% estão **permanentemente apagados**: lâmpadas, janelas, trens, elevadores e terminais sem energia. Uns 15% são **instáveis**: a luz vai e vem em ondas. O resto tem energia. A mesma conta roda na CPU (lâmpadas) e na GPU (janelas), então as duas sempre concordam.

## Direção de arte

**Nada flutua, nada é mágico.** Como na Cidade de *Blame!*, toda estrutura está apoiada, pendurada ou presa a alguma coisa, toda luz tem uma fonte, e texto só existe pintado numa superfície. Pilares só existem em trechos presos a uma camada (ou a um volume sólido), as costelas das passarelas são pórticos sobre uma travessa sob o tabuleiro, as plataformas da rede só existem ligadas a alguma ponte, e monólitos e agulhas vão de uma camada à outra.

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
| **Teia** | a trama aberta: pilares, rede andável, cabos, treliças. |
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
- **Mapa da travessia** (M): o caminho deste mundo guardado entre sessões, um ponto a cada ~8 m. Aparece como uma linha de luz em 3D, com trilhos, teleportes tracejados, quedas e fotos marcadas, escala e extensão. Mostra também o que foi descoberto: os setores atravessados (com o estado da energia), os terminais lidos, as estruturas únicas e, na Peregrinação, as pistas abertas como círculos tracejados de incerteza (ou anéis, quando só a distância é sabida), com a rota escrita ao lado.
- **Diário da travessia**, na tela de entrada e acumulado no mundo: distância a pé, em deriva e sobre trilhos (e número de viagens), maior queda, ponto mais fundo e mais alto, regiões visitadas, apagões e colapsos testemunhados, fotos e tempo na Cidade.
- Só o `npm start` normal lê e grava isso. Qualquer flag de desenvolvimento (`--seed`, `--pos`, `--capture`…) roda uma sessão avulsa que não mexe no seu salvamento. `--profile=pasta` usa um perfil separado.

### Controle de videogame

O controle faz tudo sozinho, sem teclado nem mouse. No jogo, os botões da tabela de [Controles](#controles) (trocáveis). Em qualquer menu ou painel (tela de entrada, mundos, configurações, transporte, controles, diário, mapa, leitura), o controle para de mover o corpo e navega nele:

| nos menus | botão |
|---|---|
| mover o foco | direcional ou analógico esquerdo (← → ficam na mesma linha) |
| apertar o que está em foco | A |
| voltar / fechar | B |
| mudar um valor (controle deslizante, lista) | ← → |
| aba anterior / seguinte (diário) | LB / RB |
| rolar | analógico direito (na leitura, também o direcional) |
| mapa: girar / aproximar | analógicos / RT e LT (ou ↑ ↓) |
| abrir a tela de entrada / voltar ao jogo | START |

Um painel aberto no meio do jogo pelo controle volta ao jogo ao fechar. Transportar pelo controle também. Na tela de entrada, A em "clique para entrar" entra. Os gatilhos contam como apertados a partir de 40%. A tela cheia pelo controle passa pelo Electron (`preload.js`), já que um botão do controle não conta como gesto para a Fullscreen API. O controle vibra nos pousos, nas juntas do trilho, nos colapsos, nos apagões e quando um vagão passa rente.

## Transporte

A Cidade é grande demais para ser percorrida. A tecla **T**, ou o botão **TRANSPORTE** na tela de entrada, leva você ao exemplar **mais próximo** de cada tipo de lugar. Apertar de novo o mesmo botão leva a outro exemplar (os últimos oito visitados de cada tipo são pulados).

- **Regiões:** teia, colmeia, maciço, vazio, setor inundado.
- **Interiores:** sala de máquinas, silo, depósito.
- **Estruturas:** galeria, poço, conduto, estrato, treliça, escadaria, camada/elevador.
- **Outros:** Construtores (você chega a ~160 m do canteiro, de frente para o pórtico), cemitério de Construtores, cascata (na borda da poça), transportador (na plataforma de uma estação), máquina colossal (você chega flutuando à frente dela, e ela passa por cima), terminal (diante de um com energia), estrutura única (diante da porta), o início da Peregrinação nesta seed e a ponte inicial.

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
- **Quinas e bordas**: pulando de frente para uma quina até ~2,25 m, o corpo agarra (até 1,3 m passa por cima direto); no ar, as mãos pegam a borda que passar por elas. Pendurado: frente ou pulo sobe; os lados andam pela borda e **contornam os cantos**; **pulo + lado** salta para a borda do outro lado de um vão (até ~3 m); **pulo + trás** vira e salta para a parede de trás; **trás** solta, e as mãos pegam a próxima borda abaixo (descer uma fachada de borda em borda).
- **Descer pela borda**: andando de costas para uma beirada alta, o corpo desce e fica pendurado nela em vez de cair.
- **Rolamento**: apertar pulo logo antes de tocar o chão, numa queda média, rola: muito menos dano (20 m: 26% → 7%). As quedas grandes continuam fatais.
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
  app/player.js             estado do corpo: energia, ferramentas, o que carrega, acesso
  app/carried.js            o aparelho na mão: lanterna, célula de energia, tomadas, sensor (Peregrinação)
  app/power.js              religar um setor na subestação em frente
  app/marks.js              marcas pintadas (V / LB): no mundo salvo, no mapa
  app/share.js              o código de um mundo (seed, modo, marcas) e a área de transferência
  app/uniques.js            o efeito de cada estrutura única (na primeira leitura do console)
  world/substations.js      subestações (armários) e os setores religados (luz em cascata, shaders)
  app/wake.js               queda e despertar (Peregrinação)
  app/reading.js            ler terminais (E), o leitor portátil, pegar o sensor
  app/leads.js              as pistas do mundo (abrir, estreitar, alcançar)
  lang/leads.js             pistas: quem cita quem, a linha ROTA, a área de incerteza, o começo do mundo
  gen/sites.js              onde há terminais, pela lei do mundo (ids estáveis)
  lang/ancient.js           a língua antiga: conceitos, escrita de estêncil, desenho misturado
  lang/lexicon.js           o léxico global (palavras entendidas)
  lang/records.js           o que os terminais dizem; códigos de setor e níveis
  world/inscriptions.js     endereços pintados nas paredes
  ui/reader.js              a tela de leitura
  ui/archive.js             o diário como arquivo (abas)
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
  controls/bindings.js      todos os atalhos (teclado e controle), trocáveis e salvos
  controls/walker.js        física de caminhada (chão, paredes, degraus, pulo)
  world/geometry.js         tubo afunilado, merge, cilindro entre pontos
  world/cables.js           catenárias e fios de prumo
  i18n/index.js             t(), idiomas, números e distâncias (en.js padrão, pt.js opção)
  world/entities.js         os seres: perto com física (o Walker), longe abstrato; dano, morte, cadáveres
  world/bodies.js           os corpos procedurais e a passada
  gen/nav.js                o grafo de navegação dos seres (consultado no Field) + A*
  gen/patrols.js            territórios e circuitos de ronda dos Safeguards
  world/safeguards.js       Safeguards: rondas, percepção, caçada, golpe, paredes, chamado
  app/safeguards.js         Safeguards no jogo: sentidos, barulhos, sons, desmaio
  app/alert.js              o alerta por setor (o que chama os Safeguards)
  world/levels.js           os níveis dos hostis (baixo · médio · alto): movimento e resistência
  gen/villages.js           as vilas e quais são habitadas
  world/npcs.js             moradores, andarilhos, vida de silício
  app/people.js             conversa, trocas, cargas, despertar numa vila, a vila hostil
  ui/talk.js                o painel da conversa (navegável pelo controle)
  app/beings.js             os seres no mundo salvo; o corpo de teste
  app/inventory.js          o inventário e as mãos equipáveis
  app/hands.js              as mãos: o aparelho, a lanterna, o emissor, agarrar quinas
  app/beam.js               o emissor (a arma de Killy): carga, sobrecarga, disparo, coice, o braço perdido
  app/beamfx.js             os efeitos do emissor: clarão, anéis, faíscas, detritos caindo
  render/lens.js            a lente gravitacional do emissor
  gen/beamreach.js          até onde vai o feixe (a laje de verdade, com as trincheiras; as únicas)
  gen/cut.js                o corte de verdade: CSG peça a peça, memória das peças, fragmentos soltos
  world/cutCache.js         o cache dos chunks cortados
  world/pieceStore.js       a memória das peças cortadas no disco (IndexedDB)
  world/noCollide.js        os materiais sem colisão
  world/dynamic.js          o emissor nas estruturas ativas (colossos, vagões, elevadores, pórticos)
  app/health.js             a vida (quedas, golpe, sobrecarga do emissor; desmaio ao zerar)
  app/arms.js               recuperar o braço: câmara de reconstrução, próteses
  gen/gene.js, app/gene.js  o gene de terminal: onde está (um de cada por seed), o analisador, o implante, os finais
  dev/                      os testes: check.js, padtest, beingtest, sgtest, npctest, climbtest, movetest,
                            beamtest e damagetest, healthtest, armtest, genetest, profile; arena.js
  shaders/chunks.js         GLSL: simplex, fbm, névoa volumétrica
  shaders/materials.js      superfícies, feixes, cascatas, poeira, céu
  shaders/post.js           filme: dessaturação, grão, vinheta
  audio/audio.js            áudio procedural (Web Audio)
  ui/hud.js                 leitura de instrumento do modo Livre
  ui/settings.js            painel de configurações (tecla O)
  ui/controlsPanel.js       aba CONTROLES: trocar teclas e botões (tecla K)
  ui/padNav.js              menus pelo controle (foco, A/B, abas, rolar, mapa)
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


**Novo tipo de ligação andável**: adicione uma entrada em `EDGES` (`src/gen/network.js`) e sorteie-a em `Field.edge()`. Mantenha o topo das superfícies na altura do caminho e a inclinação ≤ ~36°.

**Densidade da rede**: ajuste `density` em `Field.node()` e as chances em `Field.edge()`. Probabilidades baixas demais quebram a rede em ilhas.

**Materiais**: estão em `World._createMaterials()`, montados a partir de receitas (concreto, concreto escuro, aço, piso, borracha, muralha). Os parâmetros de `createSurfaceMaterial` são:
- `base` (cor), `accent` / `accentAmount` (ferrugem), `panel` (tamanho da placa em m), `streaks` (escorrimentos);
- `windows` (fração de janelas acesas), `windowSize`, `windowColor`;
- `circuitAmount` (linhas técnicas fracas);
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
npm run typecheck   # antes de qualquer check: os tipos do JavaScript, em segundos
```
Teste de fumaça: numa seed fixa, visita todos os destinos do painel de transporte. Em cada um espera o terreno carregar, mede o fps (média e pior quadro) e confere se o corpo não atravessou o chão. No meio do roteiro força um apagão e um colapso. Erros de script, de shader e de WebGL reprovam. Sai com código 0 (passou) ou 1, e não toca no seu salvamento. `--check=trelica,escadaria --pos=x,y,z` roda só esses destinos, nessa ordem, partindo desse ponto.

Os outros checks, cada um de um sistema (rodar só os que a mudança pede — a tabela está no cofre, `10-Comandos-e-Verificacao`):

| check | o quê |
|---|---|
| `npm run check:pad` | os dois modos só com um controle simulado (regra absoluta) |
| `npm run check:beings` | corpos de teste atravessando a teia |
| `npm run check:moves` | os seres em quinas, escadas, elevadores e vagões |
| `npm run check:climb` | as quinas: pular, agarrar, subir |
| `npm run check:safeguards` | rondas, percepção, caçada, captura, paredes, subir atrás de você, arranque e curva |
| `npm run check:npcs` | vilas, conversa, cargas, andarilhos, vida de silício, a vila hostil |
| `npm run check:beam` | o emissor: o corte (F1), o jogo (F2); `--beampart=dano`: dano por nível, a fuga, cadáveres, as estruturas ativas, os trilhos cortados |
| `npm run check:health` | a vida: quedas, a volta, o emissor, o golpe e o arremesso |
| `npm run check:arms` | recuperar o braço |
| `npm run check:gene` | o gene de terminal: os três lugares, pegar, perder, o implante, os finais |
| `npm run profile` | ms por sistema, GPU e triângulos em vários lugares |

```bash
npx electron . --stats
```
Imprime FPS, chunks carregados, fila de geração, lotes (uso, vagas livres, compactações), draw calls, triângulos, heap e a GPU em uso. Também mostra o tempo de CPU das listas de desenho e, perto da água, o tempo de GPU do reflexo. Com `--novsync` o limite de quadros é removido, para medir desempenho de verdade. `--outage=4` força um apagão de setor aos 4 s, e `--collapse=4` um colapso distante. `--wake=4` dispara o desmaio aos 4 s, `--lantern` começa com a lanterna acesa e `--game=pilgrimage` abre a sessão no modo Peregrinação. `--read=N` abre a leitura do terminal em frente aos N s, `--lexicon=N` já entende as palavras até a classe N (1 comuns, 2 incomuns, 3 raras) e `--archive=records|lexicon|leads` escolhe a aba do diário. `--sensor=terminal|energy|motion` dá o sensor já ligado nesse modo, `--map=N` abre o mapa aos N s e `--controls=N` a aba CONTROLES. `npm run check:pad` (que usa a área de transferência do sistema para testar o código de mundo) joga os dois modos só com um controle simulado (tela de entrada, configurações, troca de botão, abas, transporte, mapa, tela cheia, leitura, lanterna, mundos).

```bash
npx electron . --capture=shot.png --pos=2000,-800,3000,0.3,0 --seed=abc --delay=8 --show
```

`--goto=construtores` (ou qualquer tipo do painel de transporte: `teia`, `colmeia`, `macico`, `vazio`, `inundado`, `maquinas`, `silo`, `deposito`, `galeria`, `poco`, `conduto`, `estrato`, `trelica`, `escadaria`, `camada`, `cemiterio`, `cascata`, `transportador`, `colosso`, `terminal`, `unica`, `inicio`, `ponte`) começa já transportado.

`--fog=0.3` e `--dist=1500` sobrescrevem a névoa e a distância só nesta sessão, sem salvar.
Captura um PNG num ponto qualquer do mundo. Outras flags:
- `--view=spawn|abyss|up|far` usa um ponto de vista pronto;
- `--autopilot=6` começa em piloto automático (o número multiplica a velocidade);
- `--mode=fly` começa voando (o padrão é andar);
- `--seed` usa base 36.

Sem `--show`, a janela oculta faz o Chromium desacelerar o loop, e a simulação quase não avança.
