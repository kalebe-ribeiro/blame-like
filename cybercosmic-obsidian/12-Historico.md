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

