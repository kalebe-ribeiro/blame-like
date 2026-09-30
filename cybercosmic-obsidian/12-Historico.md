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
