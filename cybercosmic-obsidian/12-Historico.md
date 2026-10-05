# 12 — Histórico

Por que as coisas estão como estão, em ordem.

## Até 2026-09-26 — a Cidade

- Mundo infinito procedural com pilares, rede andável, passarelas, dutos; depois megaestruturas (galerias, poços, estratos, treliças, condutos, escadarias) e camadas intransponíveis com elevadores colossais.
- Direção de arte refinada a pedido: **tirou neon, glitch, entidades**; iluminação escura que funcione com 0% de névoa; brutalismo *Blame!*.
- Modo andar com colisão real, escadas, elevadores; queda sem reset.
- Regiões (colmeia, maciço, vazio), Construtores, apagões, colapsos, transportadores, cascatas, setores inundados, terminais, silhuetas.
- Usuário declarou o resultado "fiel ao que imaginava".

## 2026-09-26/27 — rodadas "o que mais dá pra melhorar"

- **Transporte** para cada bioma e para os Construtores ("é tão grande que é praticamente impossível explorar tudo — e é exatamente essa grandeza que eu queria").
- Desempenho (lotes/BatchedMesh, shader), falta de energia por setor, peso da queda, silhuetas, passos por superfície, modo foto.
- SSAO, TAA, cascatas, colapsos, trens.
- Continuar de onde parou, diário, apagões param trens/elevadores, som dos trens, terminais mortos, sombras na névoa, carregamento suave.
- **Portal do spawn removido** ("não faz sentido de acordo com a temática").
- Conforto, controle de videogame, setores inundados com reflexo, cemitérios de Construtores, maciços ocos, mapa da travessia (M), picos de desempenho.

## 2026-09-28 — repositório e maturidade

- Repositório público `blame-like` (o GitHub não aceita "!").
- `npm run check` (teste de fumaça); `app.js` dividido em `src/app/`.
- O teste achou 2 bugs dependentes do ponto de partida (escadaria em cima de camada; treliça inexistente) → corrigidos.
- **Vazamento aparente de memória** = fragmentação das páginas de lote → compactação.
- **Listas de desenho** reescritas (3 → 1,1 ms); **reflexo** barato (câmeras dividindo lista/textura).
- **Máquinas colossais** nas trincheiras sob as camadas (item 7).
- **Trilha procedural** por região (item 8).
- Item 6 (tempestades de poeira) ficou de fora a pedido.
- **Formas orgânicas removidas**: costelas, neurônios, espinha colossal, tentáculos, halos ("não faz sentido no contexto da Cidade").
- **Relevo no topo das camadas**: o topo era um plano liso até o horizonte ("parece artificial").
- Ideias de gameplay levantadas; o usuário gostou de terminais com conteúdo e peregrinação, e pediu para organizar tudo neste cofre antes de começar.

## 2026-09-29 — rumo do gameplay (fase de discussão, sem código)

- O usuário escolheu 13 ideias (+ cargas em standby) e tomou decisões: tradução global, inglês como padrão, modos Livre × com progressão (voo e teletransporte só no Livre), jogo sem fim mas com objetivos, peregrinação que nasce do contexto. Tudo em [[13-Decisoes]].
- **Tirar todo o caráter alienígena**, inclusive os glifos: a língua é de uma civilização humana antiga que se perdeu na própria construção.
- ***Blame!* como inspiração direta** para toda decisão ([[14-Universo-Blame]]).
- **Futuro**: NPCs (humanos, transumanos…) e inimigos Safeguard — a arquitetura deve prever isso ([[Ideias/Futuro/NPCs-e-Safeguards]], [[Ideias/Tecnico/Arquitetura-para-o-futuro]]).
- Segunda e terceira rodadas: língua (escrita própria + números legíveis), nomes da obra, modos Livre × Peregrinação, só sensor + leitor portátil, a mecânica vira "Pistas", começo perto de um terminal morto, interface quase nula, endereços aleatórios ("nada certinho"), e a **queda/morte que termina em despertar num lugar aleatório** depois de ser arrastado por algo que não se vê.
- Quarta rodada: Safeguards → perde tudo; partida aleatória; o Livre mantém o HUD; arrastar de 6–10 s.
- Quinta rodada: "tudo" = energia + o que carregava (ferramentas ficam); NPCs ficam com algo ou pedem missões; hoje, acordar não custa nada.

- Plano de implementação em fases (0 fundação → 7 NPCs) criado em [[15-Plano-de-Implementacao]] — plano vivo.

## 2026-09-29 — fase 0 (fundação) feita

- **0.1** Textos em `src/i18n/` (inglês padrão, português opção nas configurações); nomes da obra. **Nada alienígena**: alfabeto de glifos apagado, HUD vira leitura de instrumento, terminais com palavras gastas em vez de glifos, tela de entrada sem glifos.
- **0.2** **Barramento de eventos** (`core/events.js`): apagões, colapsos, gotas, Construtores, máquinas colossais e o corpo (queda, embarque, foto, transferência) emitem; som, HUD e diário escutam.
- **0.3** **Modos de jogo** (Livre × Peregrinação, painel MUNDOS, primeira vez pede a escolha), **perfil global + um mundo salvo por modo** com migração do salvamento antigo, `WorldState` por id estável, **estado do corpo**. `npm run check` e `check:pilgrimage` passam (21 destinos, 0 erros).
- Decisão tomada por padrão (a confirmar com o usuário): **um mundo salvo por modo** (a pergunta "vários mundos ou um por modo" era da fase 0).
- Fica para depois: começo aleatório da Peregrinação (fase 3), desmaio e despertar (fase 1 — até lá, uma queda sem fim é interrompida na Peregrinação).
- Depois da fase 0: **fogos-fátuos removidos** (luzes que orbitavam o corpo — "iluminação mágica"); "um mundo salvo por modo" confirmado; o usuário pediu commit a cada fase.
- **Toda luz com luminária**: ~1/3 das luzes da Cidade não tinha objeto — o halo na poeira parecia uma luz flutuando (o que o usuário chamava de fogo-fátuo). `B.lamp()` põe carcaça, lente e suporte em todas; faróis dos Construtores, elevadores, máquinas colossais e a lâmpada da ponte inicial também ganharam peça.

## 2026-09-29 — fase 1 (corpo e risco) feita

- **1.1 Setores de energia**: distritos irregulares, ~30% apagados de vez, ~15% instáveis; o mesmo hash inteiro na CPU e no shader. Lâmpadas, janelas, trens, elevadores e terminais obedecem; as máquinas colossais têm energia própria.
- **1.2 Queda e despertar** (Peregrinação): a sequência inteira do cofre; largado onde há luz (no escuro total não se via o chão passar).
- **1.3 Célula, lanterna, aparelho na mão, tomadas** (Peregrinação). A primeira versão da lanterna estourava a tela (intensidade alta demais perto do corpo).
- Descoberta: parte das rodadas do teste de fumaça "afundava" a 1 fps porque o Windows marcava a janela como coberta — a oclusão foi desligada no Electron.

## 2026-09-29 — fase 2 (ler a Cidade) feita

- **2.1 A língua antiga**: escrita de estêncil humana (não alienígena), 104 conceitos, léxico global no perfil; terminais em tokens (códigos de setor irregulares, fragmentos raros da história); destino de transporte "Terminal".
- **2.2 Ler terminais** (E): tela no centro; palavras recém-entendidas se resolvem; ensina só na Peregrinação; vai para o arquivo do mundo.
- **2.3 Endereços pintados** nas galerias, túneis do maciço e placas de estação; gastos, alguns renumerados; lidos de perto ensinam (o nome do lugar conta dobrado). A primeira versão tinha letras de 3 m e sumia atrás dos contrafortes.
- **2.4 Leitor portátil**: fragmento de terminal morto por 8% da célula.
- **2.5 Diário como arquivo**: abas DIÁRIO / REGISTROS / LÉXICO.

## 2026-09-29 — fase 3 (seguir rastros) feita

- **3.1 Estruturas únicas** (`c87258a`; não tinha sido registrada no cofre): console ativo, arquivo de registros, usina. Uma por célula de ~16 km (75%), no alto das camadas, longe de passagens, canteiros, relevo e assentamentos; porta, luzes próprias e um console sempre com energia e registros especiais. Destino de transporte "Estrutura única".
- **3.2 Pistas** (`08bd6b2`): ~40% dos terminais têm uma linha ROTA (setor, nível, distância de outro lugar que existe). Os lugares dos terminais saíram de `world/terminals.js` para `gen/sites.js` (a mesma conta e os mesmos ids para quem precisa de terminais longe). Lógica pura em `lang/leads.js`; estado no mundo salvo em `app/leads.js` (`slot.leads`); aba PISTAS no arquivo.
  - A primeira versão das cadeias fazia **ciclo A→B→A** entre duas únicas próximas (camadas empilhadas) e **morria** quando o elo escolhido não citava ninguém. Correção: de única em única, a cadeia segue uma **correnteza** (direção por seed, ≥3 km adiante), e só terminais que citam alguém viram elos. Medido em 40 seeds: começo encontrado em todas; 35 cadeias passam de 30 elos (o limite do teste), as outras 5 param depois de 10 ou mais.
- **3.3 Início do mundo** (`eafd97c`): plataforma de estação num setor apagado, diante de um terminal morto que sempre cita alguém (lugar diferente por seed, `startPlace`); lanterna acesa no começo; destino de transporte "Início da Peregrinação" (entra no teste de fumaça).
- **3.4 Sensor** (`d9dad31`): no aparelho da mão, tecla G (controle: direcional ↓); terminais / energia viva / movimento; mostra só o lado e a nitidez; ◆ no lugar de uma pista aberta. Achado ao pé do terminal no fim da primeira pista e nos consoles das únicas. Flag `--sensor=`.
- **3.5 Mapa com descobertas** (`c0b9214`): setores atravessados (`slot.sectors`), terminais lidos, únicas, pistas com área de incerteza e a rota escrita. Flag `--map=N`.
- Verificação feita num contêiner na nuvem, sem GPU: render por software a ~1 fps. O `npm run check` inteiro passa do limite de 6 min do `main.js` nessas condições; foi rodado em partes (`--check=a,b,…`) e todos os destinos passaram nos dois modos, com 0 erros. Numa máquina com GPU o roteiro inteiro cabe no tempo, como antes.

## 2026-09-29 — revisão da fase 3 (feita na sessão cloud) e ajustes

- Revisada a branch `claude/dreamy-tesla-8pvapl`: checks passam, cadeias sem loops (~1 ms por terminal).
- Ajustes: sensor com acima/abaixo; distância sempre legível (anel no mapa e no diário); elo das únicas a 40–55%; começo com a lanterna apagada; comentário das cadeias corrigido. Mergeado em main.

## 2026-09-29 — aba CONTROLES

- A tela de entrada listava todas as teclas (inchada). Agora: `controls/bindings.js` guarda todos os atalhos (teclado e controle, por modo) e a aba **CONTROLES** (K) troca qualquer um, com troca automática em conflito.
- Controle revisado: mapa no START, o resto trocável; saíram os atalhos duplicados de voo (E/Q/C). Textos que citam teclas seguem o atalho atual.

## 2026-09-30 — o controle independente do teclado (regra absoluta)

- Pedido do usuário, como regra para sempre: tudo que o teclado/mouse faz, o controle faz.
- `ui/padNav.js`: menus pelo controle (foco espacial, A/B, valores, abas, rolagem, mapa). START abre a tela de entrada (mapa foi para SELECT, interface para →); tela cheia no ← via `preload.js`.
- Painéis abertos no jogo pelo controle voltam ao jogo ao fechar (antes caíam na tela de entrada); transportar pelo controle também.
- `npm run check:pad`: um controle falso joga os dois modos. Achou três defeitos no caminho: `offsetParent` nulo em painéis fixos, a borda do botão recém-apertado comparada com o estado já atualizado, e a navegação pulando linhas.

## 2026-09-30 — a lanterna virou um facho

- A primeira lanterna era uma luz pontual em volta do corpo (parecia brilho e saturação). Agora: cone de verdade nos shaders, anel do refletor, manchas da lente, poeira acesa, mira convergente, atraso da mão, sem estourar de perto. Também ilumina as inscrições (só dentro do facho).

## 2026-09-30 — teste do usuário na Peregrinação

- **Exploit**: no terminal inicial, arrancar fragmentos repetidos ensinava o léxico inteiro (cada fragmento era uma fonte nova). Agora cada fonte conta cada palavra uma vez (`lexSeen`); o fragmento conta como o próprio terminal.
- **Polimento**: a lanterna virou um objeto na mão esquerda — sobe ao ligar (e só então acende), desce ao desligar, aponta com o atraso da mão. O aparelho da direita ficou só com a telinha (carga e sensor).

## 2026-09-30 — estudo: a arma do Killy

- O usuário perguntou a dificuldade de uma arma que fura o terreno deixando buraco circular. Registrado em [[Ideias/Futuro/Arma-do-Killy]]: ~60/100 com buraco de shader (cilindros salvos + `discard` + borda pintada + colisão ignorando), ~85 com CSG. Decisão de jogo pendente para a fase 6 (camadas indestrutíveis?).

## 2026-09-30 — fase 4 começa: 4.1 religar setores

- Subestações (armário com alavanca) nas plataformas das estações dos setores apagados, uma por faixa de 480 m (nunca na estação do começo). Terminais do setor citam a subestação (pista `substation`); pistas passaram a aceitar várias por terminal.
- Religar: 20% da célula (Peregrinação); luz volta em frente de 40 m/s (CPU e shader); salvo no mundo, âmbar no mapa, no diário.
- O check achou o aviso X4000 do compilador do Windows (return depois de laço no shader) — corrigido com um return só. O teste do controle precisou varrer mais linhas no painel de transporte (novo destino Subestação).

## 2026-09-30 — 4.2 subir nas máquinas colossais

- Escotilhas: uma placa da laje falta a cada ~1,3 km de trincheira; passarela, escada e plataforma na altura das longarinas. Terminal `hatch` (energia própria) com a próxima máquina.
- Máquinas mais frequentes e a 4 m/s; o casco tem colisão e carrega quem está em cima (`--ride` mediu 29,8 m em 8 s, a máquina 32).

## 2026-09-30 — 4.3 marcas do jogador

- Seta de estêncil em spray pintada onde se olha (V / LB), apaga mirando nela; mundo salvo, mapa. Primeiro teste "não achou onde pintar": era o chão ainda não carregado para a colisão logo depois do `--pos`.

## 2026-09-30 — 4.4 seeds compartilháveis

- Código `CYC1.` (seed, modo, marcas) no painel MUNDOS: COPIAR / COLAR, com confirmação; área de transferência via Electron. O teste do controle copia e cola de verdade.

## 2026-09-30 — 4.5 estruturas únicas com efeito

- Primeira leitura do console: arquivo (14 palavras), usina (religou 12 setores no teste), console (3 únicas no mapa), sala dos Construtores (nova — 22 canteiros no teste, depois de filtrar para a mesma laje: antes marcava 194), antena (nova — sensor 2,5×).
- Na Peregrinação, o primeiro E num console único pega o sensor (se ainda não tiver) — o efeito vem na leitura seguinte.

## 2026-09-30 — 4.6 travessias difíceis; fase 4 feita

- Escada de manutenção em cada torre de passagem (~220 m, com patamar na ponte e lâmpadas próprias): o setor apagado deixa de ser beco sem saída.
- Pistas para as escotilhas (passagem → escotilha; escotilha → a próxima no sentido das máquinas).
- **Fase 4 completa**: 4.1 religar setores · 4.2 subir nas máquinas · 4.3 marcas · 4.4 seeds compartilháveis · 4.5 estruturas únicas com efeito (+ Construtores, antena) · 4.6 travessias. A fase 5 só quando o usuário pedir.

## 2026-09-30 — nada flutua; lanterna no Livre

- Fotos do usuário: texto pintado no ar (inscrições de galeria na placa que a passarela remove — 298 de 50 mil tinham parede!), arcos soltos na ponte inicial, plataforma no ar. Correções: objetos flutuantes removidos; pilares só em trechos presos (30% dos segmentos eram pedaços soltos); costelas viraram pórticos com travessa; plataformas só com ligação (22 de 540 estavam soltas) e sem a "raiz" cônica; monólitos/agulhas de camada a camada; inscrições só onde `galleryWallAt` diz que há parede.
- Lanterna no modo Livre (atalho `torch`: L / RT), sem célula nem aparelho.
- Regra registrada: nada flutua, nada é mágico — pensar sempre no contexto de *Blame!*.

## 2026-09-30 — nada flutua (segunda rodada)

- Novas fotos do usuário (bioma teia e outros). Corrigidos: o poste das passarelas ficava fora do tabuleiro nas estreitas (a 2,7 m do eixo); a borda das plataformas era um polígono girado com as pontas no ar (agora nos cantos do piso); **grupos de plataformas ligados só entre si** — agora um grupo só existe se, pelas pontes, chega a uma passarela (`nodeLinked` faz uma busca no grafo; 9% das plataformas eram ilhas); sacadas das galerias presas a placas de parede que não existem (`galleryWallAt`) e dos poços onde uma passarela fura a parede; objetos do piso das galerias sobre buracos.

## 2026-09-30 — nada flutua (terceira rodada)

- Fotos: cano vertical terminando no ar (dutos com lacunas por ruído → trechos soltos: agora contínuos), cubos da treliça (a zona era uma bolha 3D no ar e parava 20 m antes das camadas: agora ocupa a faixa inteira entre duas camadas, as colunas entram nas lajes e não falham), cabos dos elevadores com 400 m fixos (pontas no ar acima da torre: agora esticados até o cabeçote; o elevador de fachada ganhou uma viga de cabeçote).
- Só o `check` rodou (mudança de geração do mundo/elevadores, igual nos dois modos) — ver a tabela em [[10-Comandos-e-Verificacao]].

## 2026-09-30 — o poste que sempre flutuou

- O poste das passarelas tinha o pé **0,4 m acima do tabuleiro** (e o poste fixo da ponte inicial, no `world.js`, também). Eu tinha olhado a foto e dito que estava certo — erro meu: não medi. Corrigido e provado com captura rente ao tabuleiro.
- Na mesma revisão (42 luminárias com haste): a lâmpada de cima da escotilha ficava sobre o vão; a da plataforma pendia de uma haste que acabava no ar (agora vai ao teto da trincheira); o braço da luminária da porta das únicas acabava 0,6 m antes da parede; a lâmpada do console podia pender sob o rasgo do teto; as lâmpadas da escada da passagem ficavam a 0,2 m do mastro; a do topo da torre, 3,5 m acima do pilar; as hastes das luminárias do teto das camadas acabavam 10 m abaixo da laje.

## 2026-09-30 — pontes da rede que paravam antes da plataforma

- As pontes da rede (e os conectores e as rampas em espiral) terminavam no raio do círculo da plataforma, mas o piso é um polígono regular: em direção ao meio de um lado a borda fica mais perto → vão de ~2 m no ar. Agora `edgeDist` calcula a borda real do polígono em cada direção.
- As costelas das pontes da rede (outro gerador, não revisado antes) tinham os pés no ar: agora pórticos com travessa, como nas passarelas.
- Erro meu da rodada anterior: as vigas radiais sob as plataformas usavam a convenção de ângulo trocada (x = cos em vez de x = sin) e saíam pela borda. Corrigido e provado com captura de cima.


## 2026-09-30 — código sem uso apagado

- Apagados os materiais `organic` e `anomaly`, o ramo "carne" do shader de superfície (`uOrganic`, `uFleshColor`, `uVeinColor`, `uVeins`) e a respiração por vértice (`uDisplace`), `buildTendril` e `world/lsystem.js`. Nada os usava desde a remoção das formas orgânicas; o visual não muda (todos os materiais tinham `organic: 0`, `displace: 0`).

## 2026-09-30 — fase 5: preparar os seres

- **Camada de entidades** (`world/entities.js`): os seres como um sistema do mundo. Perto (< 110 m), o corpo anda com o **mesmo `Walker`** do jogador e a sua própria `CollisionWorld`; longe, avança pela polilinha do caminho, sem física. Um fiscal por quadro confere se o peito atravessou alguma parede.
- **Navegação** (`gen/nav.js`): o grafo não é pré-calculado (o mundo é infinito) — é consultado no Field com **as mesmas regras** de `network.js` e `buildWalk` (bordas `edgeDist`, hélice das torres em espiral com o mesmo RNG, curva da ponte suspensa, trechos de passarela sem vão). A* ~1–20 ms para caminhos de até 4,5 km. Travessia das plataformas desvia do que está em cima delas (monólito, guarita, pés do arco, postes). `wander` escolhe destinos pelo custo andando (Dijkstra).
- **Desvio local**: rumo com chão à frente e nada bloqueando (9 ângulos); empacou 3 s → desvio lateral; de novo → outro caminho sem a aresta; em cima do ponto mas noutro nível (uma rampa corre sob a ponte) → outro caminho na hora.
- Bugs achados pelo teste: o destino "a 140 m" em linha reta virava um caminho de 4,6 km (agora pelo custo); a ponte suspensa cede ~3 m no meio e o caminho previa o piso reto (o corpo girava sobre o ponto); rampa e ponte saindo da mesma plataforma na mesma direção se sobrepõem.
- **Corpo de teste** (`world/bodies.js`): figura magra sem rosto; passada procedural pela distância andada; o quadril fica na altura em que o pé mais baixo encosta no chão. Captura de lado provou o pé apoiado.
- **Alerta** (`app/alert.js`) por setor, pelo barramento; `alert:rise` a 0,25/0,5/0,75. **Acesso** (`player.access`) abafa.
- **Lugares reservados**: vila, cemitério de vítimas, berço de Safeguards (capturas feitas por fora e por dentro). A haste da luz de sinal da sala dos Construtores ficava 0,2 m acima do teto (teto de 1,4, haste até 1,6): corrigido junto (`ROOF` por tipo).
- **Despertar com sorteio** pronto e desligado (`WAKE_LOTTERY`).
- Teste novo: `npm run check:beings` (`dev/beingtest.js`). Flags: `--body=N`, `--bodydist`, `--bodyseed`, `--follow`, `--followside`, `--gounique=<tipo>`, `--wakeas=safeguard|npc`.

## 2026-09-30 — fase 6: Safeguards

- O usuário decidiu: só fuga, um toque captura, sem acesso por enquanto, a raridade proposta — e acrescentou **um Safeguard sempre rondando cada setor**, vivo mesmo quando o jogador não sabe dele. Avaliado: um setor tem 900 × 900 m e **2880 m de altura**; um só nele quase nunca cruzaria ninguém → território = setor × fatia de 480 m (a das subestações).
- **Rondas** (`gen/patrols.js`): o circuito sai do grafo da fase 5 (plataformas alcançáveis sem sair do território, 3–4 paradas espalhadas); ~73% dos territórios perto da teia têm ronda (voltas de 0,4 a 5,5 km; 5–24 ms para calcular, um por quadro). Posição = relógio do mundo no circuito; perto, o corpo anda de verdade e o relógio espera por ele (sem saltos à vista).
- **Safeguard** (`world/safeguards.js` + corpo em `world/bodies.js`): alto (~2,3 m), pálido, sem rosto — uma fenda. Percepção (visão pela luz, cone, raio de linha de visão; audição), caçada com o `Walker`, busca, volta à ronda, captura → desmaio → cemitério (o `wake.start` ganhou o captor).
- **Paredes**: alerta 0,5/0,75 → a placa se abre e ele sai (capturado por foto na colmeia). No aberto não havia parede perto (todos os raios de 60 m erravam) → o de ronda mais perto é chamado pelo grafo.
- **Sons**: passos secos com direção, um tom quando te vê, a placa abrindo, zumbido de caçada. **Sensor** (movimento) acha Safeguards.
- **Modo Livre**: opção nas configurações, desligada por padrão.
- Erro meu achado no primeiro teste: durante o desmaio os sentidos vêm nulos e a percepção lia `lantern` de null.
- Teste novo `npm run check:safeguards` (`dev/sgtest.js`). Flags: `--sgwatch`, `--sgnear=N --sgdist=D`, `--sgcam=N`, `--sgemerge=N`.

## 2026-09-30 — fase 7, etapa 1: humanos (7.1–7.4)

- **Vilas habitadas** (`gen/villages.js`, a disposição comum à geometria e aos moradores): metade das vilas; 4–7 moradores encapuzados (`world/npcs.js`, corpo em `world/bodies.js`: o rosto é só escuro — material sem luz, porque a lanterna fazia brilhar a cabeça); braseiro aceso (tambor + brasa + fumaça).
- **Conversa** (`ui/talk.js` + `app/people.js`): E diante de um morador; uma frase curta; as escolhas são trocas (recarregar a célula · aprender 4 palavras · o caminho até outra vila · levar uma carga · entregar). Navegável pelo controle (camada do `padNav`).
- **Cargas**: nas costas; carregando, não se corre e o pulo é baixo; o aparelho mostra CARGA → distância. Entrega = célula cheia + 5 palavras. Pego pelos Safeguards: perdida.
- **Despertar com sorteio ligado**: queda fatal → Safeguards 55% (cemitério) · humanos 20% (a vila habitada mais perto: ficam com a carga, ou pedem uma entrega) · ninguém 25%.
- O `check:safeguards` falhou uma vez sem relação com isto: o relógio real fazia cada rodada cair noutro ponto da ronda. Agora o teste fixa o relógio e tenta ser visto até 3 vezes; e um Safeguard parado no meio de uma ponte não achava de onde partir quando chamado (`_plan` agora usa a plataforma mais perto).

## 2026-09-30 — fase 7, etapa 2: andarilhos e vida de silício (7.5–7.7)

- **Andarilhos** (`world/npcs.js`): um circuito próprio por território (o de ronda com outro sal — `patrolCircuit(..., salt)`), posição pelo relógio; transumanos (corpo com braço de máquina) que param e olham quem chega; os que trocam, os que roubam cargas.
- **Vida de silício**: disfarçada de andarilho; de perto (ou ao tentar falar) troca de corpo (`entities.replaceRig`), caça, drena a célula e foge. Safeguards a caçam primeiro (`sg.prey`) e ela foge deles.
- Tropeço meu ao capturar: na Peregrinação a câmera não voa, então a flag de câmera deixava o jogador a pé perto de um andarilho que era vida de silício — ele se revelava e parecia "o corpo errado". Não era defeito dos corpos. (O modo Livre serve para capturas de perto.)
- Erro meu no teste: li o cache da disposição da vila (`_memo` com uma função que devolvia null — o que também o sujaria) em vez de chamar `villageLayout`. O teste agora também termina na hora se der erro.
- Teste `npm run check:npcs` (`dev/npctest.js`), 10 itens. Flags: `--talk=N --talkpick=…`, `--wcam=N [--wreveal]` (no modo Livre para ver de perto).

## 2026-09-30 — quinas e mãos

- Pedido a partir de uma foto (uma mureta baixa demais para ser parede, alta demais para pular): agarrar quinas e subir, em todos os casos realistas para um corpo humano; e mãos (animações e segurando itens). Detalhes em [[Ideias/Gameplay/Quinas-e-maos]].
- Achados no teste: a lateral dos discos das plataformas pende para baixo (o disco é mais estreito embaixo) e a regra de "parede" só aceitava faces verticais → aceita também faces pendentes; o rebordo das plataformas (um cano baixo junto da borda) fazia a busca do topo bater na lateral dele → o topo é procurado em 3 pontos, e o pé pousa no chão depois do rebordo (`landY`).
- Mãos: a luva preta quase não aparecia; as mangas das mãos que seguram tapavam a vista (só as que agarram têm antebraço); os olhos pendurados ficavam 12 cm abaixo da borda e as mãos sumiam atrás dela (agora rente).
- Teste novo `npm run check:climb`.

## 2026-09-30 — vila no ar, desmaio, corrimãos, destinos dos seres, mão por mão

- **Vilinha flutuando** (foto do usuário): era um *assentamento* de `gen/human.js` (o anel de 9 blocos da fogueira), não a vila da fase 7. A checagem de chão olhava 2 pontos na diagonal a 25 m; os estratos são placas de 80 m que podem faltar → o centro podia cair num furo. Agora: chão no centro e em 8 pontos a 21 m (e o mesmo para o entulho). Na seed da foto (6lcfi8), 47 de 1.254 assentamentos de estrato eram assim. (Verificado no código e na contagem; a captura de antes/depois saiu escura e não mostrou nada.)
- **Desmaio no vazio retirado**: só quando o corpo chega ao chão ou bate em algo.
- **Corrimãos sem colisão**: os raios de parede do corpo saíam a 0,6 / 0,94 / 1,6 m e os de empurrar a 0,6 / 1,36 m; um corrimão fino a 1,1 m passava entre eles. Agora há raios a 0,8 / 1,0 / 1,15 m. Provado: com o código antigo o teste atravessou o corrimão e caiu da ponte (x = 25 m); com o novo parou em 2,33 m.
- **Transporte (Livre)**: grupo "seres" — vila com moradores, andarilho, vida de silício, Safeguard (quem é andarilho saiu de `world/npcs.js` para `gen/patrols.js`, `wandererOf`, para o teleporte usar a mesma regra).
- **Pela borda**: mão por mão, com o corpo balançando; os braços vão do punho ao ombro.
- `check:climb` ganhou `corrimao` e `borda`; `--climbonly=corrimao`, `--shimmy=±1`.
- Desempenho: cada corpo (jogador, Safeguards, moradores) refazia a cada quadro a lista de todas as malhas de colisão do mundo; agora a lista é reaproveitada enquanto o corpo não andou 1 m (até 0,3 s). O fps baixo do check na vila (≈20) era o carregamento depois de um salto de 20–40 km: parado lá, 76–88 fps (`--stats`), e igual sem os moradores (`--nonpcs`).

## 2026-10-01 — inventário, mãos equipáveis, cargas com contexto, morte por queda, conversa pelo teclado

- **Vida de silício atravessando corrimão** (foto): as alturas dos raios de parede tinham sido feitas proporcionais aos olhos; a vida de silício tem 1,9 m de olhos e os raios passavam por cima e por baixo de um corrimão a 1,0 m. Agora em metros do mundo; o desvio local dos seres olha também a 1,0 m. Erro meu no caminho: `_slide`/`_pushOut` usavam uma variável `s` que não existe nelas (quebrava o movimento) — achado pelo teste do controle.
- **Morte**: `entities.damage/kill`, `e.hp`; queda > 5 m machuca, > 12 m mata; o corpo fica deitado onde caiu e sai de cena longe; `being:die`. A vida de silício pega por um Safeguard também morre assim (fica o corpo). Preparado para a arma de Killy.
- **Inventário e mãos**: [[Ideias/Gameplay/Inventario-e-maos]].
- **Cargas**: o que é (6 tipos), por que vai (4), e uma recompensa prometida na hora (palavras · os lugares da região no mapa · célula maior); a célula cheia sempre; o destino no mapa (◇ e uma linha desde você).
- **Andarilhos**: perguntar sobre a Cidade (6 falas), de onde vem (4).
- **Conversa**: o menu não abre mais por trás; W/S escolhem, E confirma, 1–9 direto, Esc sai; o corpo fica parado enquanto se conversa; a tecla que abre não escolhe a primeira resposta.
- **Aviso de shader X3595** que passou a reprovar o `check:pad` (também no código do commit anterior — não era destas mudanças): a oclusão de ambiente (`render/pipeline.js`) lia a profundidade com derivada implícita dentro de laços. Agora `textureLod(…, 0.0)` nos passes de tela inteira. Achado por uma sonda que registra o último programa compilado no instante do aviso.
- O `| head` num teste fechou a saída do Electron e o processo principal mostrou um erro EPIPE na tela do usuário: `main.js` agora ignora erro de escrita na saída; e nunca mais `| head` na saída de um teste.

## 2026-10-01 — decisões confirmadas, captura, bateria ×3, arma de Killy

- Respostas do usuário às escolhas por padrão das fases 3–7: [[13-Decisoes]] (energia inicial 100%; seres em escadas/elevadores/vagões; animação de captura).
- **Captura pelo Safeguard:** fase 'grabbed' do despertar (1,2 s): a câmera vira para a cabeça dele, ele puxa 0,35 m e levanta 0,18 m, com tremor; o corpo dele fecha os braços (`grab(k)`); depois o impacto e o escuro. `--grabtest=N --grabfreeze=s`.
- **Bateria ×3.**
- **Arma de Killy** implementada: [[Ideias/Futuro/Arma-do-Killy]]. Erros achados no teste: o feixe parava a 0 m dentro das vilas (a caixa da estrutura única com margem); e um feixe largo rente a uma camada abria o piso dela (agora o shader e a colisão guardam as camadas e as únicas).
- Os 8 checks passaram (`check`, `check:pilgrimage`, `check:pad`, `check:safeguards`, `check:beings`, `check:npcs`, `check:climb`, `check:beam`). As falhas `ladrao`/`terceira` do `check:npcs` de uma rodada anterior não se repetiram.

## 2026-10-01 — os seres se movem como o jogador

- Escadas de marinheiro, elevadores, vagões, quinas e vãos: [[Ideias/Gameplay/Seres-como-o-jogador]]. O grafo de navegação ganhou as pernas de vagão (`ride`).
- Cinco defeitos achados subindo e descendo de verdade (valiam para o jogador): duto atravessando a escada de manutenção; patamar de cima sem saída; fixações soltando quem sobe; raio de chão caindo pela junta de duas peças; descer uma escada longa contava como queda de 240 m.
- Checks com o código final: `moves` (5/5), `safeguards`, `npcs`, `beings`, `climb`; antes das duas últimas correções (só na escada e nas rondas) também `pad`, `check`, `pilgrimage`, `beam`.
- Erros meus no caminho: o desvio local sem rumo ainda avançava devagar (o corpo caiu no poço do elevador); o ponto de montar na escada para descer supunha um telhado atrás dos degraus; uma linha de depuração quebrou a sintaxe e custou 12 min de teste; dois Electron escreveram no mesmo log.

## 2026-10-01 — arma: a colisão furava muito além do cilindro

- Relato do usuário: ao atirar, toda uma área em volta ficava atravessável, não só o cilindro.
- Causa (erro meu): em `world/holes.js`, `insideScene` passava o ponto no vetor temporário `_v`, e `HoleSystem.dist` usa o mesmo `_v` para o ponto mais perto do eixo → a distância saía sempre 0. Todo ponto dentro do comprimento do feixe, a qualquer distância de lado, contava como "dentro do buraco" para a colisão (o desenho estava certo). O teste não pegou porque só olhava pontos dentro do raio e o piso das camadas (protegido pelas caixas guardadas).
- Correção: um vetor próprio para o ponto consultado. Caso novo `cilindro` no `check:beam` (3 m fora do raio = sólido; 0,2 m dentro = furado): reprova com o código antigo, passa com o novo.

## 2026-10-01 — arma: corte maciço e o jogador não some mais

- Fotos do usuário: pelos furos via-se o oco das peças (cascas); e perto de um cilindro o próprio jogador ficava invisível.
- Oco: as faces de trás entram no desenho com buracos por perto e só aparecem vistas por um furo, pintadas como o corte (prova: captura com o corte em vermelho — a espessura da parede e o fundo do rasgo; depois as cores reais).
- Invisível: o descarte estava no shader comum, que o corpo e as mãos também usam. Agora só nas malhas do mundo (lotes). Prova: captura de dentro do túnel, no eixo — mãos, arma e lanterna visíveis.

## 2026-10-02 — a arma de Killy retirada

- O usuário não gostou do resultado ("muito bugado"; difícil de ficar convincente pelo método de shader; entidades erradas no tiro) e pediu para deixar o jogo como se a arma nunca tivesse sido feita.
- Retirado: `app/beam.js`, `world/holes.js`, `dev/beamtest.js` (`check:beam`), os buracos nos shaders e na colisão, a ferramenta `emitter`, os atalhos `fire`/`power` (a lanterna do Livre voltou ao botão 7 do controle), o som, os textos e as flags de captura. Ficaram: a animação de captura, a célula inicial em 100%, a bateria ×3 e tudo dos seres.
- A nota [[Ideias/Futuro/Arma-do-Killy]] voltou a ser só ideia; os requisitos do usuário e o método recomendado se ela voltar estão em [[13-Decisoes]].

## 2026-10-02 — stack reforçada: perfil, desempenho, TypeScript

- **Perfil por sistema** (`npm run profile`, `dev/profile.js`). Média de 9 lugares (parado): render ~14 ms de CPU, reflexo 4,5 ms (12–21 ms onde há água), corpo 1,3 ms, seres 1 ms (5–11 na vila); ~250 chamadas e ~2,8 milhões de triângulos por quadro; GPU 10–16 ms e pouco sensível à resolução (o custo está nos triângulos, não nos pixels).
- **Reflexo da água**: só desenha com alguma placa inundada no campo de visão (antes: com água a até 350 m abaixo, mesmo fora da tela); alcance 1200 → 700 m. transportador 35 → 58 fps, safeguard 27 → 52, estrato 28 → 61 (água perto, fora da tela). Captura num setor inundado: o reflexo igual.
- **Travadas de chegada**: os circuitos de ronda (Safeguards, andarilhos) passaram para os workers de geração (`world.circuitAsync`; o Field é determinístico — o mesmo circuito); as obras dos Construtores e os terminais são montados um por quadro; a subida de chunks tem teto de 4 ms por quadro. Comparando lado a lado: Safeguards/NPCs 25–148 ms → fora dos picos; Construtores 34–68 → ≤ 5. Sobram picos de ~20–30 ms (primeiro terminal — compilação do material —, colisão dos corpos montando BVH).
- **TypeScript sem build** (`npm run typecheck`, `tsconfig.json` com `checkJs`): 339 erros na primeira passada, nenhum bug real — campos criados fora do construtor (agora declarados nele), a interface DOM, JSDoc desatualizado. Zero erros.
- Rapier ficou de fora: a física não é o gargalo (1,3 ms).

## 2026-10-02 — Safeguard sobe atrás de você

- Dois defeitos achados ao escrever o teste: caçando, se a distância não diminuía em 7 s ele desistia — esperando o elevador ela não diminui; procurando, parado contava como "procurou e não achou" — parado esperando o carro também. Com um elevador/escada em andamento (`e.vert`), nenhum dos dois conta.
- Casos novos no `check:safeguards`: `subir:elevador` e `subir:escada` — procurando você 240 m acima (a ponte de cima de uma passagem), ele chega de elevador; sem elevador, pela escada de manutenção. (No teste a câmera voa atrás dele — a Peregrinação não deixa voar: liberado só nesse caso.)

## 2026-10-02 — picos de chegada restantes; a arma preparada

- **Colisão montada no worker**: a árvore (BVH) de cada malha colidível de um chunk é montada no worker de geração e chega serializada (`MeshBVH.serialize`/`deserialize`). Montar uma árvore de chunk grande na linha principal travava o corpo ~35–40 ms ao chegar; lado a lado (3 rodadas): vila 34/38/39 → 8–20 ms. A `three-mesh-bvh` entra no worker por uma cópia gerada (`npm run vendor`, `tools/vendor-bvh.mjs` — o worker não enxerga o import map).
- **Orçamento de colisão por quadro**: as árvores que ainda são montadas na linha principal (elevadores, vagões…) somam no máximo ~4 ms por quadro para todos os corpos juntos (antes, cada corpo montava até 2 por quadro).
- **Terminais**: criar, fazer os textos (~10 ms) e o primeiro desenho em quadros separados (vila: 48/34/41 → 41/23/25 ms).
- **Arma de Killy preparada**: `three-bvh-csg` 0.0.17 instalada; teste de viabilidade do corte de verdade (`tools/csg-spike.mjs`) com chunks reais: 0 falhas, nada sobra dentro do furo (fora das lajes das camadas, que não se cortam), ~70–100 ms por chunk no worker. Plano em [[Ideias/Futuro/Arma-do-Killy]].
- **Custo de base do desenho** (a pendência): medido por material (`npm run profile` agora conta os triângulos de cada material): 2–4,4 milhões por quadro, espalhados (pontes, nervuras, estruturas, dutos, camadas, colmeia…), sem um vilão. Com as melhorias de hoje o jogo roda a ~100 fps em todos os lugares medidos (quadro ~10 ms, GPU ~9 ms) — reduzir geometria não se paga agora. Fica o perfil para quando algo novo pesar.

## 2026-10-02 — viagens entre camadas; as pontes de cima até a laje

- Pontes da rede até os elevadores das passagens e a perna `lift` no grafo: [[Ideias/Gameplay/Seres-como-o-jogador]] (Viagens entre camadas). Capturas: o tabuleiro de baixo (88 m) e a rampa de cima (173 m).
- O vão em volta das passagens era maior que o buraco (placas inteiras): as pontes de cima não chegavam à laje — corrigido para todos (jogador incluído).
- Erros achados no caminho do teste: a regra "embaixo de um ponto noutro nível = ponte errada" descartava a perna do elevador; o seguir-caminho tomava o controle antes de sair do carro; atravessar o carro de um lado ao outro levava mais que a parada (o carro descia com o corpo).
- **Vagão instável** (achado ao rodar tudo de novo): (1) o corpo embarcava com só 6 s de parada pela frente e andar até o meio do vagão leva ~5 s — às vezes ele partia no meio; agora 10 s; (2) com o chão em volta ainda não carregado (a 36 m/s entra-se em chunks novos a todo instante) o corpo de um ser ficava parado no quadro — inclusive sem ser levado pelo piso: o vagão andava, ele ficava no ar e caía. Agora, de pé num piso que se move, ele vai junto mesmo assim (`_carry`). 3 de 3 depois.
- `check:moves` com limite de 25 min (6 casos).

## 2026-10-02 — a arma de Killy: o corte (F1) e o jogo (F2)

- F1 (o corte de verdade, protótipo de risco) e F2 (carga, controles, cancelamentos, gasto, mortes, alerta, som básico): detalhes em [[Ideias/Futuro/Arma-do-Killy]] (Andamento). `npm run check:beam` 13/13: furo perto p95 145 ms, tiro inteiro p95 538 ms.
- Os cortes do emissor têm um worker só deles; as rampas das escadarias infinitas são trechos de até 48 m (uma rampa inteira custava 183 ms de CSG).
- Controle: a lanterna do Livre saiu do RT para o botão 10 (L3); RT = o emissor (segurar), LT cancela a carga.

## 2026-10-02 — a arma de Killy: os efeitos (F3)

- Lente gravitacional, poeira puxada, traço, luz-linha do tiro, detonação a 1500 m/s (clarões, anéis, poeira), estrondo pela distância, brasa nas faces do corte, faíscas, lascas e detritos caindo: [[Ideias/Futuro/Arma-do-Killy]] (Andamento F3). Medido no orçamento: disparo +3–4,4 ms, carregando ≤ 0,1 ms.
- O primeiro tiro travava 1,7 s compilando shaders: compilação antecipada (`compileAsync`) por mundo.

## 2026-10-03 — a arma de Killy fechada (F4); o jogo na GPU dedicada

- F4 (salvar do cache, teto de 64 cortes, memória das peças no worker, peças finas cortadas) e a porta: todos os checks verdes — [[Ideias/Futuro/Arma-do-Killy]].
- O jogo às vezes rodava na GPU integrada do notebook (Iris Xe, ~25 fps): `main.js` pede a dedicada (`force_high_performance_gpu`).
- `check:pad`: o teste da tela cheia agora compara largura, altura e posição (numa tela da largura da janela, só a altura muda).
- Pendências da arma fechadas: a memória das peças cortadas no IndexedDB (o caso frio), corte a seco e lente aquecidos (primeiro tiro +7,3 ms), a brasa nos chunks de longe, a luz das bobinas carregando (a lente visível no escuro), o foco do `check:pad`.
- Arma: o chão debaixo de quem atira fica (cilindro de pontas retas em todas as contas; coluna protegida sob os pés; só mirando para baixo ele se abre) — `check:beam` caso `chao`.
- Arma: coice da mira e empurrão do corpo, os dois crescendo com a carga (carga cheia: mira +6,5°, empurrado ~2,6 m) — `check:beam` caso `coice`.
- Arma: sobrecarga (segurar de 3 a 6,5 s) — cores do branco quente ao violeta e um traço preto no limite, empurrão até ~40 m/s, o braço sem resposta ou destruído (90 s); a brasa sem a "estampa de onça". `check:beam` 19/19.
- Arma: o braço não se perde mais (o custo vai para a barra de vida — planejada no cofre); a sobrecarga em estágios que se anunciam (onda na tela, baque, a cor virando), a singularidade na mira, o tiro do limite com raio 7,7 m, 1000 m e empurrão ~95 m/s (73 m no teste).
- Arma: estágios além do limite (espaguetificação, horizonte, colapso — até 11 s; furo até 18,7 m e 2000 m; o mundo invertido); disparar neles faz perder o braço que atira — recuperar fica em aberto no cofre. `check:beam` caso `alem`.
- Pendências resolvidas antes da barra de vida: o disparo dos estágios 5–7 mais leve (≤ +6,7 ms), o carregamento e a memória de vídeo medidos com tiros, o aviso de que o código de mundo não leva os cortes, o túnel visto de dentro; e o jogo saiu do teto de ~64 fps (a RTX desenhando para a tela da Intel: o Chromium num relógio de 60 Hz — `disable-frame-rate-limit`): `check` 114 fps. Todos os checks verdes.
- **Planejado** (só o cofre): a [[Barra-de-vida]] decidida — V1–V7 aprovadas, o golpe dos hostis com animação e arremesso (−50%, três caminhos: cair da estrutura, cair no mesmo plano, bater num obstáculo), quedas com dano até o limiar do desmaio, animações únicas agora e variações registradas; o [[Rework-grafico]] depois de toda a gameplay.
- **Decidido** (só o cofre): o **gene de terminal** é o objetivo final e máximo do jogo — quase impossível; a mecânica, o usuário elabora ([[Gene-terminal]]). Descartados: quebra-cabeças de transporte, copiar inscrições, modo expedição.

## 2026-10-03 — o cofre reorganizado (só o cofre)

- [[Ideias/Pendencias]] virou a fila: a implementar (na ordem), esperando o usuário, em observação, fechadas (só o ponteiro). [[Ideias/00-Ideias]] e [[00-INDEX]] com o estado de hoje; a tabela do Futuro na ordem de trabalho; notas velhas acertadas (a arma não é mais "a próxima", os NPCs e Safeguards estão feitos, a "porta da F1" no lugar certo).
- [[Barra-de-vida]] revista: sem dano de choque no próprio coice do emissor; a queda pela altura (a conta antiga usava g = 9,8 — o jogo usa 15).
- [[Recuperar-o-braco]]: escolhidos os três caminhos (câmara de reconstrução, prótese, moradores das vilas), com as propostas R1–R6 e a saída garantida sem os dois braços — o risco de travar a Peregrinação, que já existe no jogo.
- Depois: [[Recuperar-o-braco]] decidida (R1–R7: preços alinhados, sem a garantia de caminho sem escada, o aviso de um braço só); planejado o [[Dano-do-emissor]] (dano variável nos seres, a arma continua overpowered).
- Depois: o [[Dano-do-emissor]] revisto (três níveis de Safeguard; o colapso mata qualquer um; vila hostil ao ferir um morador) e o [[Movimento-dos-inimigos]] planejado (aceleração e velocidade terminal — a dificuldade).
- Depois: confirmados o colapso como o tiro que mata qualquer ser, a queda pelo próprio empurrão, a vila hostil e M1–M4; a vida de silício em três níveis; o design e a animação de cada hostil pelo nível no [[Rework-grafico]].
- Depois: a mecânica do [[Gene-terminal]] decidida (vários caminhos, o analisador de genes, a dificuldade pelo tamanho da Cidade, o controle da Cidade, três finais); G1–G5 em aberto.
- Depois: [[Gene-terminal]] G1–G5 respondidas (o implante num lugar próprio, a amostra com o portador vivo, o analisador em estruturas ou trocas, os Safeguards só param de caçar).
- Depois: G6 — o gene se implanta na câmara de reconstrução; o gene entrou na fila de [[Ideias/Pendencias]] (nada mais esperando o usuário além das credenciais).
- Depois: credenciais de acesso descartadas — nada mais esperando o usuário; o planejamento está fechado.
- Depois: a branch `claude/laughing-dijkstra-envmdu` trazida para `main`; datas acertadas (estavam um dia à frente) e a ordem da fila igual em todas as notas (vida → dano e movimento → braço → gene → rework).

## 2026-10-04 — a barra de vida

- **Feita** ([[Barra-de-vida]] §11): a vida (salva, no aparelho só quando muda, regeneração pelo tempo), quedas com dano pela altura, o dano do emissor por estágio, o golpe dos Safeguards com arremesso (três caminhos: o mesmo plano, cair da estrutura, bater num obstáculo) e a captura só ao zerar. `check:health` novo, 12/12; `check:safeguards` 9/9. Achado no caminho: depois de um golpe que arremessa para longe da vista, o Safeguard ficava sem o último ponto visto (erro a cada quadro) — corrigido.
- Regressões depois da vida, todas verdes: `check` 31/31 (116 fps), `check:pilgrimage` 31/31, `check:pad` 31 + 30, `check:beam` 22/22, `check:climb` 8/8, `check:moves` 6/6, `check:npcs` 10/10, `check:beings` 5/5. O `check:pilgrimage` tem média de ~80 fps e mínimo de ~30 (início, ponte, vila) — **o mesmo do código de antes da vida** (b20928f, no mesmo momento: 77 fps, mín 31): não é regressão. Uma rodada fora do carregador deu 19 fps na ponte.

## 2026-10-04 — o dano do emissor e o movimento dos inimigos

- **Feitos** ([[Dano-do-emissor]], [[Movimento-dos-inimigos]] — Andamento): os níveis (baixo/médio/alto, pelo lugar), a resistência, o dano pela carga (o colapso mata qualquer um; raspão ×0,5), os feridos (cambaleiam; faíscas; o andarilho foge), a vila hostil para sempre (golpe −25%), o arranque com aceleração até a terminal e as curvas que custam velocidade. O golpe com arremesso foi para `app/health.js` (`struck`) — o mesmo para Safeguards e moradores.
- Testes novos: `check:beam` parte `dano` (8), `check:safeguards` `arranque`/`curva`, `check:npcs` `hostil`/`andarilho`. Achados no caminho, todos do próprio teste: a célula vazia depois dos tiros, um gatilho lido por um getter que não existe, a vala do tiro entre o jogador e o Safeguard, e a vida de silício do caso "terceira" que já tinha saído de cena.
- **Defeito real achado pelos testes**: depois de reconstruir o mundo (trocar de mundo), os Safeguards novos podiam ficar sem a ligação do golpe — voltavam à captura pelo toque. Agora `app/safeguards.js` religa todo sistema novo (`sg.wired`).
- Regressões, todas verdes no fim: `check:beam` 30/30 (com a parte `dano` no fim — o check desliga os Safeguards, só a fuga os liga), `check:safeguards` 11/11, `check:npcs` 12/12, `check` 31/31 (121 fps), `check:pilgrimage` 31/31 (118 fps, mín 58), `check:pad` 31 + 30, `check:climb` 8/8, `check:moves` 6/6, `check:beings` 5/5; `check:health`: 12/12 com os casos `borda`/`parede` passando depois de exigir uma borda com o chão de baixo já carregado e uma parede alta (o arremesso joga para cima). **Ainda depende do lugar sorteado**: `golpe:borda` pode reprovar com "nenhuma borda alta" numa rodada em que nenhum lugar tem a borda certa — rodar `--healthpart=borda` de novo.
- Imagem conferida: a pose de ferido (braços abertos, cabeça para trás) ao lado da parada (`--strikepose=cycle,N`). As faíscas do ferido **não** ficaram visíveis na captura — não conferidas em imagem.

## 2026-10-04 — recuperar o braço

- **Feito** ([[Recuperar-o-braco]] — Andamento): a câmara de reconstrução (a única nova, só em células antes vazias), a prótese (cemitérios, andarilhos; instalada do inventário; o braço de metal), os moradores refazendo um braço, os avisos de um braço só e do último braço, e a pista para onde refazer sem os dois. `check:arms` novo, 7/7. Fica a prótese nos depósitos.
- Regressões depois do braço, todas verdes: `check:arms` 7/7, `check:beam` 30/30, `check:npcs` 12/12, `check:pad` 31 + 30, `check` 31/31 (115 fps), `check:pilgrimage` 31/31 (118 fps). Imagem conferida: a câmara por dentro.

## 2026-10-04 — o gene de terminal

- **Feito** ([[Gene-terminal]] — Andamento): os depósitos da Netsfera (raros, longe; guardados ou esquecidos), as cadeias de pistas, o analisador de genes, os portadores e a amostra, o implante na câmara, o controle da Cidade e os três finais. `check:gene` novo, 9/9. Com isso, **toda a fila de gameplay decidida está feita**; o próximo é o rework gráfico (depois de jogar e ajustar os números).
- Regressões depois do gene: `check:gene` 9/9, `check:beam` 30/30, `check:npcs` 12/12, `check:arms` 7/7, `check:pad` 31 + 30, `check` 31/31 (120 fps), `check:pilgrimage` 31/31 (116 fps). **Instáveis, dependem do lugar sorteado** (passaram em rodadas anteriores; o mecanismo está testado): `check:safeguards` `curva` (às vezes o Safeguard contorna a mudança de alvo devagar — curva suave não conta — ou nem vira; o teste agora confere a regra pelo ângulo de fato virado), `check:health` `choque` (o coice real precisa de uma parede a 0,8–2,6 m) e `golpe:borda` (uma borda com o chão de baixo carregado). Ver [[Pendencias]] (em observação).
- **Revisto pelo usuário**: um de cada caminho do gene no mundo inteiro — `Field.geneSites()` (o depósito guardado, o esquecido, a vila do único portador, longe); `check:gene` 9/9.

## 2026-10-04 — as pendências antes do playtest

- **Os testes que dependiam do lugar sorteado**: a vida numa arena preparada (`dev/arena.js`); o arranque e a curva dos Safeguards numa simulação determinística; o "parede" dos Safeguards com o jogador a pé antes. `check:health` 12/12, `check:safeguards` 11/11.
- **A prótese nos depósitos do maciço** (rara, 15%): `check:arms` 8/8.
- **As faíscas de um ser ferido conferidas em imagem** (`--sparkshot=N`): um leque de pontos quentes saindo do impacto. (A captura antes saía cedo demais.)
- Um detalhe para o playtest: o arremesso vai de 12 a 16 m/s e o choque conta de 12 m/s — os arremessos mais fracos perdem força no voo e nunca chegam a bater forte numa parede.
- Fora: a distinção visual dos níveis dos inimigos (é do [[Rework-grafico]]).

## 2026-10-04 — três correções pedidas pelo usuário

- **Os Construtores** (`world/builders.js`): eram atravessáveis (a colisão só via a obra — o pórtico, os trilhos, o gancho, a carga e os destroços passavam pelo corpo) e o tiro não os destruía (o canteiro só sumia se o corte pegasse o centro dele). Agora **tudo do canteiro é sólido** (`world/collision.js`), **os blocos que o corte atravessa somem**, e **um corte numa perna ou na viga derruba o canteiro** — vira um cemitério como os outros, com estrondo e faíscas. Como os cortes ficam no mundo salvo, o canteiro recriado já nasce assim. `check:beam` caso `construtor`.
- **A textura não acompanhava o que se move** (as placas deslizavam pelos elevadores, vagões, colossos, o pórtico dos Construtores, os pedaços que caem): o desenho era calculado na posição do mundo. Agora há a variante "presa ao objeto" do material de superfície (`shaders/materials.js` `movingMaterial`, `USE_OBJECT_PATTERN` — os mesmos uniforms), usada nessas peças; pré-compilada com as outras no aquecimento do emissor. **Conferido em imagem** (`--buildercam=N`): o pórtico andou 14,9 m entre duas capturas e as juntas das placas ficaram no mesmo lugar da perna.
- **O corpo morto flutuava** quando o tiro levava o piso debaixo dele (o morto não tinha física): agora ele confere o chão a cada 0,4 s e cai com a gravidade do Walker até o próximo piso (`world/entities.js` `_settleCorpse`). `check:beam` caso `cadaver`.

## 2026-10-04 — o emissor nas estruturas ativas (pedido do usuário, pelas fotos do playtest)

> Usuário: "as estruturas móveis não são destruídas, o raio simplesmente ignora [a estação, a máquina colossal]. O trilho dos Construtores, ao atirar, some, em vez de ter um corte cilíndrico; o mesmo com os blocos. Quero que os blocos tenham as mesmas características das construções existentes. A máquina colossal, ao receber um tiro, continue funcionando mesmo com o corte, a menos que atinja um ponto essencial; e uma 'barra de vida' própria, que faça a máquina se destruir após diversos cortes. Quero que funcione pra toda estrutura que esteja ativa."

- **`world/dynamic.js`** (novo): o corte de verdade (o mesmo `cutPiece` da geração, no jogo) na geometria do **próprio objeto, nas coordenadas dele** — o furo anda junto, as faces em brasa (material `cut`, preso ao objeto). Cada estrutura ativa tem **pontos essenciais** e uma **resistência** (cada corte gasta `0,12 + 0,06·r` — ~3–6 tiros cheios; o colapso de uma vez). Atingir um essencial ou zerar a resistência: **ela para**. Tudo salvo no mundo (`dyn:<id>`) e refeito quando o objeto volta a existir.
- **Colossos**: o essencial é o módulo central (o núcleo). Destruído: apaga, e **a trincheira inteira para** no instante do fim (as outras máquinas da esteira não o atravessam — `colLane:<id>`).
- **Vagões**: o essencial são os truques sobre o trilho. Destruído: apaga, e **a linha para de vez** (`transitDead:<id>` — como o trilho cortado).
- **Carros dos elevadores**: o essencial são os cantos dos cabos. Destruído: **parado onde está**.
- **Construtores**: o pórtico é estrutura ativa (essencial: a base das pernas e o meio da viga; gasto, cai — vira cemitério). **A obra e os trilhos são cortados como a Cidade** (bloco a bloco, memorizado; a obra que cresce já vem cortada).
- Testes (`check:beam` parte `dano`): `construtor` (furo no bloco e no trilho; a perna no meio: segue com 71%; +3 cortes: cai; a base da perna: cai de um tiro), `elevador`, `vagao`, `colosso` (cortado: segue; o essencial: para — e a linha/trincheira parada). Imagem: o furo na parede de um vagão (`--cutcar=N`).
- Regressões: `check` 31/31 (119 fps), `check:pilgrimage` 31/31 (111 fps — uma rodada antes deu 81, o estado da máquina; repetida, normal), `check:moves` 6/6, `check:beings` 5/5, `check:beam` parte `dano` 13/13 (o elevador: o essencial dos cantos dos cabos com raio menor — num carro estreito um corte no meio já os pegava).

## 2026-10-04 — O corte oco nas estruturas ativas

Fotos do usuário: o furo na máquina colossal saía **oco** (sem as faces do corte; o vazio de dentro à mostra). Duas causas em `world/dynamic.js`:
1. **O 2º corte em diante**: a malha já cortada é aberta (as faces ficam numa malha à parte), e o corte seguinte caía no recorte sem faces (`clipOpen`). Agora o corte parte sempre da geometria **original** com **todos** os cortes, usando a memória da peça (`gen/cut.js`: o resultado anterior, malha + faces, volta a ser um sólido fechado e só o corte novo passa pelo CSG). As faces de todos os cortes formam uma malha só, trocada a cada corte.
2. **Caixas que se tocam nos cantos** (o vagão): fundidas, deixam de parecer fechadas, e até o 1º corte saía oco. O `mergeAll` (`world/geometry.js`) agora guarda o primeiro vértice de cada peça (`userData.parts`). Usa vértices e não o índice porque **a BVH da colisão reordena o índice** da geometria compartilhada. O corte dinâmico corta **peça a peça** (cada caixa ou tubo é um sólido fechado), como a Cidade.
- Os blocos e trilhos dos Construtores já eram cortados peça a peça a partir do original: sem o problema.
- Imagens: `--cutobj=col|car|lift|gantry` (três cortes encavalados fora do essencial; a câmera presa ao objeto olha o furo de viés) gera `cutobj-<tipo>.png`. Nas quatro: as paredes do furo aparecem.
- Testes (`dano`): `construtor`, `elevador`, `vagao` e `colosso` também exigem **0 peças ocas** — 13/13; `check:moves` 6/6. (Uma rodada perdeu o colosso do mapa logo depois do corte no núcleo: instável, a seguinte passou; o teste agora diz quando isso acontece.)

## 2026-10-04 — O feixe não chegava ao que fica dentro da trincheira

Foto do usuário: o **bloco central da máquina colossal não era cortado**; e, de certa distância, **nada** da máquina era cortado, mesmo na potência máxima.
- **Causa** (`gen/beamreach.js`): o feixe tratava a laje como uma faixa cheia `[fundo, topo]` onde a placa existe. Mas as **trincheiras das máquinas são escavadas por baixo até 56 m** (`Field.trenchAt`, placa a placa, como `gen/macrogen.js` monta a laje). O feixe parava no plano do fundo da laje mesmo na trincheira aberta. Tudo o que fica acima desse plano era inalcançável: o bloco central, as longarinas e os rodízios. E quem atirava de dentro da trincheira (acima do fundo, numa placa "cheia") começava "dentro do concreto": o feixe tinha 0 m.
- **Correção**: o concreto agora é o de verdade. Em cada ponto: a placa existe (`barrierTileSolid`) **e** a altura está entre o fundo da trincheira (fundo + `trenchAt`) e o topo. O feixe anda pelo trecho dentro da faixa (passos de 2 m e aperto por bissecção) e para ao entrar no concreto pela face de baixo, pela de cima ou pela parede de uma trincheira. Antes, um feixe horizontal dentro da faixa, numa passagem, atravessava a laje de lado; agora para na parede.
- **Distância**: o tiro **cheio vai até 400 m** (`shotOf`: 30 + 370k); a sobrecarga vai até 1000 m, e além dela até 2000 m. É assim por projeto. Medido (`--colreach`): de baixo, cheio a 380 m, sobrecarga a 900 m; cortam a plataforma, a longarina e o bloco.
- Imagem: `--cutobj=colcore` mostra o bloco central furado. O `--cutobj` agora corta pelo trecho do feixe (`beamReach`).
- Teste (`dano`, `colosso`): o feixe tem de chegar ao bloco e à longarina de dentro da trincheira e de baixo, a 120 e a 380 m. `check:beam`: f1 16/16, f2 6/6, dano 13/13.

## 2026-10-04 — Varredura final de bugs (antes do rework gráfico)

Pedido do usuário: "uma última varredura de bugs e inconsistências antes de iniciar o rework". Checks completos, análise estática (tipos estritos, i18n, eventos, salvamento, invariantes deste cofre) e revisão do código novo. Achados e correções:

**Estruturas paradas e o mundo salvo**
- **Vagão / elevador parados de vez voltavam a andar.** Ao recriar (sair e voltar, ou recarregar), o relógio recomeçava do tempo atual: os vagões apareciam noutro lugar e andavam ~6 s antes de parar. Agora o ponto da parada fica no mundo salvo (`transitStop:<linha>`, `liftStop:<id>`) e eles reaparecem onde ficaram, parados. Testes: `vagao` e `elevador` (some e volta: 0,00 m de diferença).
- **O colosso parado aparecia "andando" no transporte, no sensor e na escotilha.** `nearest()` e `nextAt()` ignoravam a trincheira parada. Agora o transporte "colosso" escolhe uma máquina que anda, o sensor de movimento ignora as paradas, e a escotilha diz `TRENCH DAMAGED`. A estação de uma linha parada diz `LINE DAMAGED` (antes: "sem energia").
- **Trilho cortado.** Vagões e elevadores paravam, mas **o colosso passava por cima dos trilhos cortados do teto da trincheira** e **o pórtico dos Construtores atravessava o trilho cortado**. Agora a trincheira para (`colLane`) e o pórtico chega até o corte e fica preso (`site.railBreaks`, `site.stuck`). Testes: `colosso:trilho`, `construtor:trilho`.
- **Detecção de trilho cortado por amostras.** Os vagões amostravam 21 pontos do corte: num tiro de 2 km, um a cada 100 m, e um corte que cruzava o trilho passava batido. Agora a distância é exata (`gen/cut.js railDist`).

**Corpos**
- **O cadáver não acompanhava o piso que anda.** Num vagão ou no convés do colosso, a máquina saía de baixo dele; num elevador subindo, o piso passava por ele. Agora o morto vai junto (`corpseOn`, como o `_carry` dos vivos) e herda o piso em que o vivo estava apoiado. Teste: `cadaver:vagao`.
- **O pórtico dos Construtores não dizia quanto andou** (`userData.dx`), então quem estava de pé nele não era levado junto. Agora diz, e zera quando o canteiro cai.
- **Safeguards e andarilhos de ronda sumiam na frente do jogador.** Um tiro que cortava o circuito removia na hora a ronda inteira, inclusive o corpo de quem esse tiro acabara de matar. Agora o corpo fica onde caiu, e a ronda viva à vista só sai quando está longe (além de 450 m: `STALE_DROP`). Teste: `ronda:corte`.

**Robustez e custo**
- **Geometria vazia derrubava a colisão.** Um corte que apaga uma malha inteira deixava uma geometria sem `position`, e a BVH quebra nela: um tiro de colapso num carro de elevador derrubaria o jogo. `world/collision.js` agora ignora malha sem triângulos.
- **Cada estrutura ativa guardava todos os cortes do mundo**, e o primeiro tiro montava as peças de todas as estruturas carregadas (dezenas de colossos a 7 km). Agora há um filtro pela esfera de cada malha.
- **`cutMemo` dos Construtores vazava.** As chaves levam a lista de cortes, e as velhas nunca saíam. Agora é zerado quando a lista muda.
- O `beamReach` novo (que entra na trincheira) custa até 1,4 ms por tiro de 2 km. As paradas são exatas: a parede a 80 m, o teto a 156 m.

**Nada flutua (C1) fora dos chunks**
- Um fragmento pequeno (< 8 m³) solto por um corte, que não encosta em nada, vira entulho que cai. Isso valia só para os chunks. Agora vale também para as estruturas ativas e para a obra dos Construtores (`gen/cut.js dropLoose`, evento `cut:loose`). Como nos chunks, só perto de um tiro recente: ao voltar a um lugar, os cortes salvos refeitos não fazem cair de novo.

**Retorno e documentação**
- A destruição de colosso, vagão e elevador não tinha som nem efeito (`structure:dead` sem ouvinte). Agora tem o mesmo estrondo do canteiro, no ponto do corte.
- O README estava atrás do jogo. Dizia que Safeguards e raros vivos vinham "no futuro" e que a lanterna do Livre era no RT (é L3; o RT é o emissor). Faltavam o emissor e o inventário nos controles, e as mecânicas novas. Atualizado, assim como a tabela de controles deste cofre (o inventário: I / R3).

**Mais achados (segunda metade)**
- **O Livre podia ficar sem braço para sempre.** O braço perdido volta em 30 s, mas o relógio era só da sessão: salvar e recarregar antes disso deixava o braço perdido. Agora o Livre reagenda a volta de todo braço que falta, inclusive ao abrir o mundo.
- **A câmara cobrava antes.** Os 50% da célula saíam no começo dos 20 s; sair do jogo no meio levava a carga sem devolver os braços. Agora saem no fim, junto com os braços. A prótese e o implante já eram assim.
- **Cadáver herdando um chão velho.** Um ser morto longe (sem física) tinha o `groundObj` de quando esteve perto, noutro lugar. Agora só herda o piso se estava com física.
- **O cofre contradizia o jogo.** `13-Decisoes` dizia "Não recortar geometria (CSG)" e que a arma "não está no jogo". Marcado como substituído (a arma voltou com o corte de verdade em 2026-10-02). O mapa de arquivos estava sem 27 módulos, e a "Estrutura" do README sem 37. Completados; o README ganhou a tabela de todos os checks.
- **O fiscal dos Safeguards não dizia onde.** Agora diz o material, a posição e o estado de quem atravessou (`stats.wallLast`). Duas rodadas seguidas de `check:safeguards` falharam cada uma num caso diferente (`subir:elevador`, depois o `fiscal` com 1 atravessamento) e passaram no outro: instável, em observação com o diagnóstico novo.

- **O pórtico derrubado ao vivo pulava e o canteiro mudava.** O `_wreck` foi feito para gerar cemitérios: rodando na hora da destruição, mandava o pórtico para um ponto qualquer do trilho, fazia blocos aparecerem e sumirem, e criava blocos caídos e pórticos velhos do nada. Agora, derrubado pelo emissor, o pórtico tomba onde estava, o gancho e a carga caem embaixo de onde estavam e nada mais muda. O lugar fica salvo (`bgWreck:<id>`), e o canteiro recriado volta igual. Teste: `construtor` confere o tombo no lugar.
- **A máquina parada continuava batendo as garras.** O baque (com o controle vibrando) usava o relógio do mundo, não o da trincheira. Agora uma trincheira parada não bate.
- **A bordo de uma linha destruída**, o aviso dizia "SEM ENERGIA · aguardando religamento". Agora diz "LINHA DANIFICADA · parada de vez" (`hud.transit.damaged`; `transit.stoppedForGood`).

- **Testes novos** (`check:beam --beampart=dano`, agora 18 casos em ~2 min): `construtor:trilho`, `cadaver:vagao`, `solto:vagao` (dois tiros de verdade no guarda-corpo: um pedaço de 0,12 × 0,12 × 0,28 m sai e cai), `ronda:corte`, `colosso:trilho`; e mais conferências em `elevador`, `vagao` (somem e voltam onde pararam) e `construtor` (o tombo no lugar).
- **Instáveis vistos** (passaram na rodada seguinte, sem mudança no código deles): `check:safeguards` `subir:elevador` e o `fiscal` (1 atravessamento — agora diz onde); `check:arms` `andarilho` (a posição do andarilho no circuito quando o teste chega).

**Desempenho: as travadas de ~1/3 s e 18% da CPU no three.js**
- No `check` do Livre, `unica` tinha o pior quadro em 334–375 ms. Isolado, repetia em 370–453 ms, também na Peregrinação; já existia no commit de 03/10 à noite, quando o jogo passou à GPU dedicada sem limite de quadros. Parado ali, travava 200–450 ms a cada 1–2 s, sem shader novo, sem coleta de lixo e sem nenhum sistema do quadro acima de 3 ms.
- O perfil de CPU do Chromium (`--cpuprofile`, nova) mostrou ~18% da CPU em `getProgram`/`getParameters` do three. **Bug do three r170:** o `setProgram` confere `object.colorTexture` num `BatchedMesh`, que guarda a textura em `_colorsTexture`. `undefined !== null`, então todo lote reavaliava o programa em toda chamada de desenho, montando a chave com o código inteiro do shader. Contorno: um getter `colorTexture` no protótipo (`world/batches.js`). O tempo sumiu do perfil.
- Também: o mesmo `ShaderMaterial` desenhado ora num lote, ora numa malha comum (Construtores, terminais, elevadores, mãos…), trocava de programa ~1.000×/s (`--progswitch`, nova). `world.js` agora dá a toda malha comum uma cópia própria (`soloMaterial`: os mesmos uniforms), a cada 0,5 s. Trocas: ~0.
- Com a CPU livre, as travadas pioraram: sem o limite de quadros do Chromium (`disable-frame-rate-limit`), a CPU enfileirava quadros mais rápido que a GPU desenhava, e o driver a segurava de uma vez. **No máximo 4 quadros esperando a GPU** (uma fence do WebGL2 no fim de cada quadro; o rAF seguinte passa a vez se a GPU ainda estiver neles: `app.js MAX_INFLIGHT`). Medido nos quadros desenhados: o pior quadro caiu de 334–453 ms para ≤ 42 ms em `unica`, `terminal`, `teia` e `colmeia`, com a média igual à de antes (2 em voo: ~80 fps em todo lugar; 3: −25% na teia; 4: o equilíbrio). Parado na única: 94–98 fps sem nenhuma travada (antes ~100 com travadas a cada 1–2 s).
- **Os testes medem os quadros desenhados.** `ctx.frameHooks` (app.js) avisa a cada quadro desenhado; `check`, `check:beings`, `profile`, `--stats` e `--hitch` passaram a usá-lo, porque um rAF que passa a vez não é um quadro.
- O `profile` agora também mede a vida, os braços, o gene e o despertar.

**Conferido e sem problema:** tipos estritos (só código morto inofensivo); i18n (as mesmas chaves nos dois idiomas, placeholders iguais, nenhuma chave usada faltando, inclusive as montadas); eventos (nenhum ouvinte sem emissor); salvamento (tudo por id estável); `Math.random` só em eventos de sessão e comportamento; configurações reaplicadas ao reconstruir o mundo; a origem flutuante nos efeitos novos; os seres desistem de uma linha parada (10 s) e evitam a aresta.
