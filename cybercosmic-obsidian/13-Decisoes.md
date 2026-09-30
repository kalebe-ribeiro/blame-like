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

### Fase 3 (2026-09-29) — escolhas feitas por padrão, **a confirmar**

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

### A arma do Killy — método do buraco (2026-09-30)

Se e quando a arma existir (fase 6), o terreno será furado pelo **buraco "de shader"**: cada tiro guarda um cilindro (origem, direção, raio) no mundo; todos os shaders descartam o que está dentro; o lado de dentro das caixas é pintado como borda fundida; a colisão ignora o que está dentro. **Não** recortar geometria (CSG). Detalhes em [[Ideias/Futuro/Arma-do-Killy]]. Em aberto para a fase 6: combate × só fuga, o que o feixe não fura (recomendação: camadas e estruturas únicas), alcance, custo em energia, alerta dos Safeguards.

### Fase 4 — escolhas feitas por padrão, **a confirmar** (2026-09-30)

| pergunta | escolha |
|---|---|
| custo de religar um setor | 20% da célula na Peregrinação; de graça no Livre |
| onde ficam as subestações | armário numa plataforma de estação do setor apagado, uma por faixa de 480 m; nunca na estação do começo |
| como embarcar nas máquinas | escotilhas na laje a cada ~1,3 km de trincheira, escada até uma plataforma rente às longarinas; máquinas mais frequentes (4 m/s) |
| marcas | só tinta (seta de estêncil), sem sinalizadores; até 400; V / LB |
| seed compartilhada leva o estado? | **não**: só o mundo cru + as marcas (em ferrugem para quem recebe) |
| efeito das estruturas únicas | só na **primeira** leitura do console, por mundo; valores: arquivo 14 palavras, usina 2,5 km, console 3 vizinhas, Construtores 6 km (mesma laje), antena ×2,5 |
| travessias difíceis | escada de manutenção (~220 m) em cada passagem; pistas das passagens para as escotilhas e de escotilha em escotilha |

### Fase 5 — escolhas feitas por padrão, **a confirmar** (2026-09-30)

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
