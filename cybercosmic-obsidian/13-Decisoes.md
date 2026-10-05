# 13 — Decisões

Registro das decisões do usuário, com data. Uma decisão só muda se o usuário mudar.

## 2026-09-29 — rumo do gameplay

**Fase atual: discutir ideias antes de escrever qualquer código.**

| decisão | detalhe |
|---|---|
| Referência | ***Blame!* é inspiração direta para qualquer decisão** ([[14-Universo-Blame]]) |
| Nada alienígena | tirar toda característica alienígena, **inclusive os glifos**. A língua desconhecida é a de uma **civilização humana antiga que se perdeu** na construção infinda nascida da própria ganância |
| Idioma padrão | **inglês** |
| Tradução | **progresso global** (entre mundos); mas a ideia é que o jogador fique numa seed só de qualquer jeito |
| Modos de jogo | escolha **antes de iniciar o mundo**; **voo livre e teletransporte só no modo livre** ([[Ideias/Gameplay/Modos-de-jogo]]) |
| Fim | o jogo **essencialmente não tem fim** — não se apegar a isso — mas **existem objetivos a concluir** |
| Peregrinação | tem de **nascer do contexto** (ex.: um terminal com um fragmento de coordenada), **nunca sorteada ao abrir o mundo** |
| Ferramentas | **sensor + leitor portátil**, somente (ver a rodada abaixo) |
| Cargas | **standby**: entram quando houver NPCs raros |
| Futuro | **NPCs** (humanos, transumanos… os seres de *Blame!*) e **inimigos Safeguard** — arquitetar tudo pensando nisso ([[Ideias/Futuro/NPCs-e-Safeguards]]) |
| Contexto | registrar sempre no Obsidian (este cofre) |

### Respostas às perguntas (2026-09-29, segunda rodada)

| pergunta | decisão |
|---|---|
| forma da língua antiga | **opção 3**: escrita própria para as palavras, **números legíveis desde o início** |
| nomes | **os nomes da obra**: Safeguard, Netsfera, Autoridade, gene de terminal da rede |
| nome do modo com progressão | **Peregrinação** (o outro é o **Livre**) |
| a tradução avança no modo Livre? | **não** |
| português | **continua como opção de idioma** (inglês é o padrão) |
| ferramentas além do sensor | **só o leitor portátil** (as outras ficam de fora) |
| um mundo pode trocar de modo? | **não** — o modo fica preso ao salvamento |

### Terceira rodada (2026-09-29)

| pergunta | decisão |
|---|---|
| nome da mecânica de seguir endereços | **Pistas** (*leads*); "Peregrinação" é só o nome do modo |
| começo de um mundo | **perto de um terminal morto, com o leitor portátil e pouca energia**; a primeira leitura dá o primeiro fragmento ([[Ideias/Gameplay/Inicio-do-mundo]]) |
| interface | **quase nada na tela**: sensor e leitor são objetos na mão, a energia aparece no aparelho ([[Ideias/Gameplay/Interface-diegetica]]) |
| ler um terminal | **tela no centro** |
| setores / endereços | **aleatórios, nada definido, "nada certinho"** — sem grade; o usuário já tinha pedido o mesmo quando os biomas foram gerados ([[Ideias/Mundo/Enderecamento-da-Cidade]]) |
| morte e quedas longas | **você acorda num lugar aleatório** — os Safeguards acharam que você morreu e descartaram o corpo, mas você está vivo; **o mesmo vale para quedas longas**, com a animação de desmaio e de ser arrastado por algo que não se vê ([[Ideias/Gameplay/Queda-e-despertar]]) |

### Quarta rodada (2026-09-29)

| pergunta | decisão |
|---|---|
| custo de acordar | **se quem arrastou foram os Safeguards, você perde tudo** (o que "tudo" inclui: em aberto) |
| ponto de partida da Peregrinação | **aleatório** (diferente por seed) |
| HUD no modo Livre | **mantém** |
| duração do arrastar | **6–10 s** |

### Quinta rodada (2026-09-29)

| pergunta | decisão |
|---|---|
| o que "perde tudo" inclui (Safeguards) | perde **energia e o que carregava**; **mantém as ferramentas**, a tradução, o diário e as pistas |
| arrastado por NPCs | eles **ficam com algo** ou **pedem missões** (entregas, ajuda etc.) |
| antes de existirem Safeguards/NPCs | acordar **não custa nada** além do deslocamento |

### Fase 0 (2026-09-29)

| pergunta | decisão |
|---|---|
| vários mundos salvos, ou um por modo? | **um por modo** — confirmado pelo usuário |
| fogos-fátuos (luzes que orbitavam o corpo) | **removidos** — "iluminação mágica", não fazem sentido no contexto |
| commits | **commit a cada fase** (e, dentro dela, a cada etapa) |
| iniciar a fase 1? | **não por enquanto** — o usuário pediu para não começar a fase 1 |

### Fase 3 (2026-09-29) — escolhas feitas por padrão — **confirmadas em 2026-10-01** (exceto: a energia inicial passou a 100%)

O usuário pediu para finalizar a fase 3 sem responder às perguntas abertas. O que foi escolhido (tudo fácil de mudar):

| pergunta | escolha |
|---|---|
| mostrar algo quando se chega a uma pista? (estava em aberto em [[Ideias/Gameplay/Pistas]]) | **nada na tela**. A pista fecha ao **ler o terminal citado**; antes disso, o **sensor** (modo terminais) marca o lugar de uma pista aberta com ◆ "O ENDEREÇO" |
| para onde as pistas apontam | **terminais** (elos) e **estruturas únicas** (fim da cadeia). Canteiros e trincheiras ficaram para a fase 4 |
| como uma pista estreita | três partes: **setor, nível, distância**. Terminal com energia dá tudo; o leitor portátil, 1–2 partes por fragmento. Uma parte só vale com a palavra entendida (SETOR, NÍVEL, DISTÂNCIA). Raio: 5 km sem nada → 350 m com tudo · **revisto em 2026-09-29**: a distância é número e vale sempre; sozinha (sem setor) vira um anel em volta de quem citou |
| quantos terminais citam alguém | ~40% (os elos e o primeiro terminal do mundo, sempre) |
| cadeias | convergem para a única mais próxima; das únicas, seguem uma direção por seed (nunca voltam, nunca acabam) |
| onde se acha o sensor | ao pé do terminal **no fim da primeira pista**, e junto do console de toda estrutura única (até ter um) |
| modos do sensor (a nota dizia "a decidir") | **terminais · energia viva · movimento**, tecla **G**; gasta a célula (15 min com carga cheia); mostra o lado e a nitidez, nunca a distância · **revisto**: também acima/abaixo (▲ ▼ ou traço), porque as pistas trocam muito de camada |
| começo da Peregrinação | plataforma de estação num **setor apagado**, diante do terminal morto, ~~lanterna já acesa~~ **revisto: lanterna apagada** (a carga é pouca: acender é decisão do jogador); o primeiro fragmento sempre traz a distância |
| pistas no modo Livre | não (`ctx.rules.leads`); o mapa com descobertas (setores, terminais lidos, únicas) vale nos dois modos |

### Ideias escolhidas
Terminais com conteúdo · Tradução como progresso · Peregrinação (contextual) · Estruturas únicas · Mapa com descobertas · Luz como recurso · Religar setores · Ferramentas (sensor + leitor portátil) · Subir nas máquinas colossais · Diário como arquivo · Travessias difíceis · Seeds compartilháveis · Marcas deixadas por você · Cargas (standby).

Não mencionadas (continuam só propostas): copiar inscrições, credenciais de acesso, elevadores/trens como quebra-cabeça, modo expedição (provavelmente absorvido pelos [[Ideias/Gameplay/Modos-de-jogo|modos de jogo]]).

## Antes (direção de arte)

Ver [[02-Direcao-de-Arte]] e [[Ideias/Descartadas]]: sem neon, sem glitch, sem formas orgânicas, sem portais, sem neve, sem reset ao cair, iluminação escura com névoa de 0 a 200%, tempestades de poeira fora (2026-09-28).

### Ajustes da fase 3 depois da revisão (2026-09-29)

O usuário pediu os cinco ajustes da revisão da sessão cloud:
- **sensor com acima/abaixo** (em vez de prender os elos a uma camada): as pistas trocam de camada com frequência (1–2,5 km de desnível por elo), e isso fica — é *Blame!*;
- **distância sempre vale** (número legível) → anel no mapa; a primeira pista já orienta;
- elo das estruturas únicas a **40–55%** do caminho (era 50–75%: travessias de 6–13 km);
- começo **sem lanterna acesa**;
- comentário de `lang/leads.js` corrigido (as cadeias convergem para *alguma* única, não garantidamente a mesma).

### REGRA ABSOLUTA — controle independente do teclado (2026-09-30)

**Tudo o que se faz com teclado e mouse tem de dar para fazer só com o controle de videogame**: no jogo e em todo menu/painel (tela de entrada, mundos, configurações, transporte, controles, diário/arquivo, mapa, leitura, confirmações, tela cheia). Pedido explícito do usuário, vale para sempre.

Como está feito:
- ações em `controls/bindings.js`, cada uma com botão (menu = START, mapa = SELECT, interface = →, tela cheia = ←);
- `ui/padNav.js` navega qualquer painel: foco espacial (direcional/analógico; ← → só na mesma linha; ↑ ↓ vão para a linha seguinte), A aperta, B volta, ← → mudam deslizantes e listas, LB/RB abas, analógico direito rola, mapa com analógicos e gatilhos;
- um painel aberto no jogo pelo controle volta ao jogo ao fechar;
- tela cheia pelo controle via `preload.js` (IPC; um botão do controle não é gesto para a Fullscreen API);
- `npm run check:pad` (`dev/padtest.js`): um controle falso joga os dois modos e confere tudo.

### A arma do Killy — método do buraco (2026-09-30) — **SUBSTITUÍDA em 2026-10-02**

> A versão "de shader" foi feita e retirada (ver abaixo, e o histórico de 2026-10-02). A arma voltou no mesmo dia com o **corte de verdade**: CSG peça por peça (`gen/cut.js`), os chunks atingidos refeitos, as faces do corte em brasa. Camadas e estruturas únicas continuam intransponíveis. O texto a seguir fica só como registro.

Se e quando a arma existir (fase 6), o terreno será furado pelo **buraco "de shader"**: cada tiro guarda um cilindro (origem, direção, raio) no mundo; todos os shaders descartam o que está dentro; o lado de dentro das caixas é pintado como borda fundida; a colisão ignora o que está dentro. **Não** recortar geometria (CSG). Detalhes em [[Ideias/Futuro/Arma-do-Killy]]. Em aberto para a fase 6: combate × só fuga, o que o feixe não fura (recomendação: camadas e estruturas únicas), alcance, custo em energia, alerta dos Safeguards.

### Fase 4 — escolhas feitas por padrão (2026-09-30) — **confirmadas em 2026-10-01**

| pergunta | escolha |
|---|---|
| custo de religar um setor | 20% da célula na Peregrinação; de graça no Livre |
| onde ficam as subestações | armário numa plataforma de estação do setor apagado, uma por faixa de 480 m; nunca na estação do começo |
| como embarcar nas máquinas | escotilhas na laje a cada ~1,3 km de trincheira, escada até uma plataforma rente às longarinas; máquinas mais frequentes (4 m/s) |
| marcas | só tinta (seta de estêncil), sem sinalizadores; até 400; V / LB |
| seed compartilhada leva o estado? | **não**: só o mundo cru + as marcas (em ferrugem para quem recebe) |
| efeito das estruturas únicas | só na **primeira** leitura do console, por mundo; valores: arquivo 14 palavras, usina 2,5 km, console 3 vizinhas, Construtores 6 km (mesma laje), antena ×2,5 |
| travessias difíceis | escada de manutenção (~220 m) em cada passagem; pistas das passagens para as escotilhas e de escotilha em escotilha |

### Fase 5 — escolhas feitas por padrão (2026-09-30) — **confirmadas em 2026-10-01** (exceto: os seres fazem toda a movimentação do jogador — [[Ideias/Gameplay/Seres-como-o-jogador]])

| pergunta | escolha |
|---|---|
| seres procedurais ou modelos feitos à mão? | **procedurais** (corpos montados por código, animação procedural — como o resto do jogo; nenhum asset externo). O corpo de teste é uma figura humana magra, sem rosto |
| velocidade de um corpo | ~2,3 m/s perto (o `Walker` do jogador a 55%); 1,3 m/s longe (abstrato) |
| perto × longe | física completa a menos de 110 m do jogador (volta ao abstrato a 130 m); desenhado até 420 m |
| por onde os seres andam | só pelo que a rede andável e as passarelas oferecem (grafo do Field). Nada de escadas de marinheiro, elevadores nem vagões ainda |
| o que sobe o alerta de um setor | ler um terminal +0,06 · religar o setor +0,45 · pintar uma marca +0,02 · lanterna acesa num setor apagado +0,004/s. Esfria pela metade em 10 min. Avisos a 0,25 / 0,5 / 0,75 (`alert:rise`) — ninguém escuta ainda |
| acesso do jogador | existe como dado (`player.access`, 0 = nenhum); abafa o alerta proporcionalmente. Ninguém dá acesso ainda |
| lugares reservados | vila abandonada (galpão fechado com barracos), cemitério de vítimas (pátio murado com corpos embrulhados), berço de Safeguards (bloco lacrado, portão travado). São estruturas únicas com terminal; **sem efeito** na leitura. Sorteio à parte (hash 984, ~17% das únicas): em mundos já salvos algumas únicas mudam de tipo |
| despertar com sorteio | pronto e **desligado**: Safeguards 55% → cemitério (carga a 5%, perde o que carregava, ferramentas ficam) · NPCs 20% → vila · resto: ninguém visto (como antes) |

### Fase 6 — Safeguards: decisões do usuário (2026-09-30)

- **Só fuga** nesta fase (a arma de Killy fica para depois).
- **Um toque captura** (sem dano acumulado).
- **Sem acesso** por enquanto: `player.access` continua 0.
- Raridade: a proposta (primeiro encontro provocado depois de ~30–60 min de Peregrinação).
- **Pelo menos um Safeguard sempre rondando** cada território — vivo mesmo quando o jogador não sabe dele, para que dê para encontrar um de repente, ou vê-lo de longe e mudar de rota/se esconder. A mecânica do alerta continua; isto é somado. Território = setor × fatia de 480 m (o setor inteiro tem 2880 m de altura). No escuro ele é ouvido e aparece no sensor (modo movimento). Modo Livre: desligados por padrão.

### Fase 6 — escolhas feitas por padrão (2026-09-30) — **confirmadas em 2026-10-01** (mais: a animação de ser capturado)

| pergunta | escolha |
|---|---|
| velocidades | ronda 1,6 m/s · caçando ~5,2 m/s (mais que o seu andar, 4,2; menos que a sua corrida, 8,5) · chamado pelo alerta, longe, 3,5 m/s |
| alcance de visão | (9 m + 26 m × luz do setor + 60 m com a lanterna) × 0,6 de ronda (× 1,4 caçando) × (1 + 1,5 × alerta do setor); de costas 35%; nunca além de 105 m; linha de visão por raio |
| audição | correr: 14 m (ronda) / 22 m (caçando); queda: 20 m + 1,5 × altura (até 60); leitura de terminal 18 m; alavanca da subestação 70 m; marca 6 m. Ouvir não é ver: ele vai ao lugar do barulho e procura |
| perder o rastro | 1,5 s sem ver → vai ao último ponto visto → procura 7 s → volta à ronda; se vê mas não chega (outro nível) por 7 s, também desiste |
| captura | o toque (1 m na horizontal, 1,8 m na vertical) → desmaio → **cemitério de vítimas mais perto** (pode ficar longe: numa seed, ~90 km), carga a 5%, sem o que carregava. O sorteio geral das quedas continua desligado |
| saída das paredes | alerta 0,5 → 1 caçador; 0,75 → 2; no máximo 3; parede vertical com chão rente a 14–60 m; a placa abre em 0,9 s, ele sai em 1,2 s e já sabe onde você está por uns 5 s. No aberto: vem o de ronda mais perto (≤ 500 m) |
| territórios sem ronda | onde não há rede andável (~25% perto da teia; mais nas galerias, colmeia, maciço) |
| relógio das rondas | o relógio real (`Date.now`): elas andam com o jogo fechado; ao chegar perto, o relógio espera o corpo |
| modo Livre | desligados por padrão; opção "Safeguards no modo Livre" nas configurações |
| no escuro | sem luz própria; passos secos audíveis até ~180 m (com direção); zumbido quando caçam; o sensor (movimento) acha um a até 600 m |

### Fase 7 — escolhas feitas por padrão (2026-09-30) — **confirmadas em 2026-10-01**

| pergunta | escolha |
|---|---|
| quanta fala os NPCs têm (a pergunta do plano) | **pouca**: uma frase curta por conversa, no idioma do jogo (são contemporâneos, não a língua antiga); você nunca escreve nem escolhe falas — escolhe uma troca |
| quem mora nas vilas | metade das vilas; 4 a 7 humanos encapuzados, sem rosto visível; um braseiro aceso |
| o que um morador oferece | recarregar a célula (uma vez a cada 20 min por vila, só na Peregrinação) · 4 palavras da língua antiga (uma vez por vila) · o caminho até outra vila habitada (uma pista) · uma carga |
| cargas | para outra vila habitada a até 45 km (as vilas são raras: numa seed, a mais perto ficou a 39 km); carregando, não se corre e o pulo é 55%; entrega = célula cheia + 5 palavras; pego pelos Safeguards ou pelo ladrão = perdida |
| despertar | sorteio **ligado**: queda fatal → Safeguards 55% (cemitério, carga a 5%, sem o que carregava) · humanos 20% (a vila mais perto: ficam com a sua carga, ou pedem uma entrega) · ninguém 25% |
| andarilhos transumanos | em ~20% dos territórios (setor × 480 m), num circuito próprio; 1,1 m/s; param e olham quem chega. Metade troca (3 palavras por 25% da célula; onde há gente); metade não tem o que dizer e, se você carrega uma carga, arranca-a e foge |
| vida de silício | 30% dos "andarilhos"; de perto (6 m) ou ao tentar falar, se revela (o corpo muda: escura, braços longos); caça a ~5 m/s; o toque **drena a célula** (0%) e ela foge |
| terceira força | um Safeguard que vê vida de silício revelada (até 60 m) caça ela antes de você; se alcança, ela acaba; ela foge dele |

### Respostas às escolhas por padrão das fases 3–7 (2026-10-01)

O usuário respondeu item a item (na ordem deste arquivo):
- **Fase 3:** mantém tudo, **exceto a energia inicial da Peregrinação: 100%** (era menos).
- **Fase 4:** mantém tudo.
- **Fase 5:** mantém tudo, **exceto: os seres devem andar também em escadas de marinheiro, elevadores e vagões — toda movimentação que o jogador consegue fazer, os NPCs também devem poder.**
- **Fase 6:** mantém tudo, **exceto: uma animação ao ser capturado pelo Safeguard** (feita: a câmera vira para o rosto dele, ele puxa e levanta, os braços fecham em volta — `app/wake.js` fase 'grabbed', `bodies.js grab(k)`).
- **Fase 7:** mantém tudo.
- **Bateria ×3** ("a bateria acaba muito rápido"): todos os gastos da célula divididos por 3 (lanterna 21 min, sensor 45 min, religar setor, ler fragmento).
- **Arma do Killy — requisitos** (**no jogo desde 2026-10-02**, com o corte de verdade — histórico F1–F4): não atravessa camadas nem únicas; potência ajustável (alcance, raio, gasto); ≥ 5 tiros com carga máxima → [[Ideias/Futuro/Arma-do-Killy]]. Uma primeira versão (buracos por shader) foi feita e **retirada a pedido do usuário em 2026-10-02**: não convencia (peças ocas pelo furo, o próprio corpo sumindo perto do cilindro, entidades erradas no tiro). Se voltar: o corte de verdade (CSG peça por peça em `ChunkBuilder.add`, refazendo os chunks atingidos), não o shader.

### Stack: reforçar, não migrar (2026-10-02)

O usuário pediu a análise de migrar para outra stack/engine com o requisito de eu gerenciar tudo sozinho. Comparadas: ficar e reforçar; Godot 4; Bevy; Unity; Unreal. Unity e Unreal reprovam no requisito (dependem do editor; Blueprints binários). Godot passa, mas custaria reescrever ~27 mil linhas com o jogo parado. **Decisão do usuário: reforçar a stack atual.**

O perfil (`npm run profile`) mudou o plano: a física (Walker) custa ~1,3 ms — trocar pelo Rapier não traria fps; ficou de fora. O que pesava: o reflexo da água desenhando a cena de novo sem água na tela, e travadas de chegada (circuitos de ronda, obras, terminais, subida de chunks) na linha principal. E TypeScript por `checkJs` (sem build) para eu errar menos.

### Arma de Killy — potência e efeitos (2026-10-02)

- **A potência vem do tempo segurando o gatilho**, não de níveis explícitos: segurar carrega, soltar atira; alcance, raio e gasto crescem juntos com a carga (contínuo). Continua: ≥ 5 tiros com carga cheia por célula; não atravessa camadas nem únicas.
- **Efeitos visuais mais dramáticos**, levando em conta que é um feixe **gravitacional**: carregar puxa o espaço e a poeira para a boca (lente gravitacional), o tiro é um colapso em linha com distorção, onda de choque, coice, som com atraso; as bordas do corte em brasa esfriando. Detalhes em [[Ideias/Futuro/Arma-do-Killy]].
- **Plano v3** (2026-10-02) depois da revisão crítica: o risco primeiro (protótipo sem efeitos com portão de medidas), proteção por marca na geração, cache dos chunks cortados, mundo coerente (luzes, objetos, grafo dos seres, vagões/elevadores), detonação retardada que esconde o atraso do furo, orçamento em números. **Confirmadas pelo usuário (2026-10-02)**: C1 megaestrutura ancorada (solto vira detrito) · C2 andar a 60% carregando · C3 nada cortado dentro das únicas · C4 RT atira, LT cancela, lanterna do Livre no botão 10 (L3 — o plano dizia R3 por engano).
- **O chão debaixo de quem atira não se destrói** (usuário, 2026-10-03): uma coluna protegida sob os pés (raio 0,9 m); só mirando no chão logo abaixo de si ele se abre. Ver [[Ideias/Futuro/Arma-do-Killy]].
- **Sobrecarga do emissor** (usuário, 2026-10-03): segurar de 3 a 6,5 s; as cores desviam para o azul e o violeta até um traço preto no limite (exceção pedida ao "sem neon": a cor do mundo volta por um instante); o empurrão cresce muito mais; o braço paga — sem resposta até 40 s, destruído no limite (90 s para regenerar), como o de Killy.
- **A arma não se perde** (usuário, 2026-10-03): o braço destruído/bloqueado saiu; o custo da sobrecarga vai para a futura [[Barra-de-vida]]. A sobrecarga ficou em estágios que se anunciam, com a singularidade na mira e o limite muito mais forte (raio 7,7 m, empurrão ~95 m/s).
- **Além do limite, o braço se perde** (usuário, 2026-10-03): estágios 5–7 do emissor (espaguetificação, horizonte, colapso — até 11 s); disparar num deles desfaz o braço que segura a arma; recuperar fica em aberto ([[Recuperar-o-braco]]). No Livre, volta em 30 s.
- **Barra de vida decidida** (usuário, 2026-10-03): V1–V7 como propostas, com o golpe dos hostis detalhado — curta distância (sem tiro inimigo por enquanto), uma animação de ataque que **arremessa** o jogador e **tira metade da vida**; depois do arremesso, a física decide: cair da estrutura (a queda: dano e, se grande, o desmaio), cair no mesmo plano, ou bater num obstáculo (dano pelo choque); zerou por um hostil → a captura de hoje. **Quedas com dano** a partir de ~14 m/s até o limiar do desmaio (38 m/s). Animações únicas por enquanto; **variações registradas** (por trás, de frente, de baixo, lateral — 2+ cada; por tipo de NPC; etc.). Ver [[Barra-de-vida]].
- **Rework gráfico depois de toda a gameplay** (usuário, 2026-10-03): texturas variadas, modelos de NPCs detalhados e variados, animações diversas — [[Rework-grafico]].
- **O gene de terminal é o objetivo final** (usuário, 2026-10-03): o objetivo máximo do jogo, quase impossível; a mecânica será elaborada pelo usuário — [[Gene-terminal]].
- **Descartados** (usuário, 2026-10-03): quebra-cabeças de elevadores e trens, copiar inscrições, modo expedição — [[Descartadas]].

### Barra de vida revista e o braço (2026-10-03)

- **O próprio coice do emissor não dá dano de choque**: bater numa parede pelo empurrão do tiro é só o baque. O dano por obstáculo fica só para o **arremesso de um hostil**. Cair de uma plataforma pelo empurrão continua sendo uma queda (com dano) — [[Barra-de-vida]] §2.
- **A queda com dano é pela altura**: a partir de **10 m** (17,3 m/s com a gravidade do jogo, 15 m/s²), crescendo com a energia (`v²`) até **38 m/s ≈ 48 m**, o desmaio de sempre. A nota antiga dizia "14 m/s ≈ 10 m" — a conta usava 9,8 m/s² — [[Barra-de-vida]] §4.
- **Recuperar o braço**: três caminhos — **uma estrutura única nova** (a câmara de reconstrução), **loot** (a prótese) e **NPCs** (os moradores das vilas refazem). Fora: a regeneração lenta. Aprovadas R1–R6 com os preços alinhados — câmara 50% (os dois braços), prótese do andarilho 40%, moradores uma carga ou 30% (um braço) — e sem a garantia de caminho sem escada até a vila ("ainda tem outras duas alternativas"). **R7**: um aviso quando resta um braço só (ao perder o primeiro, e "ÚLTIMO BRAÇO" no estágio 5) — [[Recuperar-o-braco]].
- **Dano variável do emissor** (usuário): os inimigos não morrem de qualquer tiro, **mas a arma continua overpowered** — o tiro cheio mata tudo o que existe hoje, a sobrecarga até de raspão. Revisto no mesmo dia: **Safeguards em três níveis** — um tiro médio-fraco (~0,6–0,85 s) mata o baixo; o médio pede vários médio-fracos (3); o alto, vários tiros (4 cheios, 2 no limite); **o tiro máximo (colapso) mata qualquer ser**, até de raspão — [[Dano-do-emissor]].
- **Andarilho ou morador morto**: só se perde a troca com ele. **Ferir ou matar um morador numa vila deixa a vila hostil** (golpe de humano −25%, trocas fechadas, não é mais lugar de despertar, para sempre) — [[Dano-do-emissor]] §4.
- **A dificuldade vem do movimento dos inimigos**: arranque com aceleração até uma velocidade terminal, mais rápidos que hoje (o médio e o alto mais rápidos que a sua corrida) — fica difícil carregar sem ser pego. Números M1–M4 a confirmar — [[Movimento-dos-inimigos]].
- **Confirmações (usuário, 2026-10-03)**: o tiro que mata qualquer ser é **o nível máximo literal — o colapso (estágio 7), o que custa o braço**; a queda pelo empurrão do próprio emissor **conta** (só o choque na parede não); a vila hostil como proposta (golpe −25%, para sempre, sem despertar nela, acorda longe); **M1–M4 e a distribuição dos níveis aprovados** (só baixos perto do começo; médios e altos nas camadas fundas e perto das únicas). **A vida de silício também em três níveis.** Nota futura: **design e animação de cada hostil pelo nível, com variações no mesmo nível** — [[Rework-grafico]].
- **A mecânica do gene de terminal** (usuário, 2026-10-03): **vários caminhos** — uma cadeia longa de pistas até um lugar onde o gene está guardado (protegido por Safeguards ou esquecido; **NPCs podem pegar o gene esquecido do chão**), ou **um humano com o gene** (vila ou andarilho), achado com uma **ferramenta nova, o analisador de genes** (exceção à regra das duas ferramentas). **A dificuldade é o tamanho da Cidade**, como no mangá: o desmaio segue o de sempre — só que, numa Cidade gigante, acordar costuma ser longe. **Ao obter: o controle da Cidade** (Netsfera, mapa, Safeguards). **O final é uma escolha**: manter a Cidade, destruí-la (cutscene) ou entregar o gene a uma vila para reconstruir a humanidade — [[Gene-terminal]].
  - **G1–G5** (usuário, 2026-10-03): o gene precisa ser **implantado num lugar próprio** — até lá é um objeto normal e se perde como qualquer outro; do humano, **uma amostra com ele vivo**; o analisador de genes **em estruturas ou em trocas**; depois do implante, os Safeguards **só param de caçar**. **G6**: o lugar do implante é **a câmara de reconstrução** (a mesma do braço).
- **Sem credenciais de acesso** (usuário, 2026-10-03): o gene é o único acesso, como na obra — [[Descartadas]].
