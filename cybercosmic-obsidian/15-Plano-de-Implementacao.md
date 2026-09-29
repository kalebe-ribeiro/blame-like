# 15 — Plano de implementação

> Criado em 2026-09-29. **Plano vivo**: a ordem e o conteúdo podem mudar a qualquer momento — aqui está o caminho provável, não um contrato.
> Vai da fundação até a **fase final: os NPCs**. Base: as decisões em [[13-Decisoes]], as ideias em [[Ideias/00-Ideias]], a referência [[14-Universo-Blame]].

## Como cada etapa é feita

- Uma etapa = algo que dá para **jogar e ver** no fim (nada de semanas de infraestrutura invisível sem checar).
- Antes de começar: reler [[02-Direcao-de-Arte]] e [[13-Decisoes]]. Nada alienígena, nada "certinho", *Blame!* como referência.
- No fim: `npm run check` passando (e ele passa a cobrir o que a etapa criou), capturas com névoa 0 e 0,3 quando mudar algo visual, commit, **nota da ideia com status `feita`**, [[12-Historico]] atualizado.
- O modo **Livre** nunca pode quebrar: tudo o que é da Peregrinação fica atrás das regras do modo.

## Visão geral

| fase | nome | em uma frase |
|---|---|---|
| 0 ✔ | Fundação | limpar, preparar idiomas, modos, salvamento e a base para tudo o que vem |
| 1 ✔ | Corpo e risco | a queda que acaba em despertar, a energia, o escuro |
| 2 ✔ | Ler a Cidade | a língua antiga, os endereços, os terminais, o leitor, o diário |
| 3 ✔ | Seguir rastros | pistas, sensor, mapa, o começo de um mundo, as primeiras estruturas únicas |
| 4 | Energia e travessia | religar setores, subir nas máquinas, marcas, seeds compartilháveis |
| 5 | Preparar os seres | tudo o que Safeguards e NPCs vão precisar — ainda sem nenhum deles |
| 6 | Safeguards | o sistema de defesa da Cidade |
| 7 | NPCs | humanos, transumanos, vida de silício — a fase final |
| — | contínuo | desempenho, distribuição, polimento |

---

## Fase 0 — Fundação ✔ (feita em 2026-09-29)

> Feita em três etapas (commits `149aac6`, `55e79b2`, `a16a534`). Detalhes em [[12-Historico]]. Um mundo salvo **por modo** (vários mundos por modo ficaram de fora). O começo aleatório da Peregrinação ficou para a fase 3, e a queda na Peregrinação continua sendo interrompida até a fase 1.

**Objetivo**: o jogo de hoje, igual por fora, mas pronto por dentro.

- **Tirar o caráter alienígena** ([[Ideias/Pendencias]]): HUD, glifos, tela de entrada, mensagens, README. No lugar, textos neutros (a língua antiga só chega na fase 2).
- **Idiomas**: todos os textos saem do código para arquivos por idioma; **inglês padrão, português opção** (nas configurações). Nomes da obra (Safeguard, Netsphere, Authority, Builders…).
- **Duas memórias** ([[Ideias/Tecnico/Arquitetura-para-o-futuro]]):
  - **perfil global** (configurações; depois o léxico);
  - **mundo salvo** (por seed + modo): o que já existe hoje (posição, diário, mapa) + espaço para "o que mudou no mundo".
  - Talvez **vários mundos salvos** (escolher qual continuar).
- **Ids estáveis** para tudo que será interativo (terminais primeiro), derivados do `Field`.
- **Barramento de eventos**: as filas de hoje (Construtores, máquinas, apagões, colapsos) passam por um canal só.
- **Modos de jogo** ([[Ideias/Gameplay/Modos-de-jogo]]): tela de escolha antes de iniciar um mundo; regras num lugar só (voo, teletransporte, HUD, tradução). A Peregrinação nasce "vazia": igual ao Livre sem voo nem teletransporte e sem HUD.
- **Estado do corpo**: componentes de energia, inventário e acesso, ainda sem efeito visível.

**Pronto quando**: dá para escolher o modo, jogar os dois, trocar de idioma, e nada alienígena aparece.

---

## Fase 1 — Corpo e risco ✔ (feita em 2026-09-29)

> Três etapas: `61c241a` (setores de energia), `488fd6b` (queda e despertar), `bf6cf83` (célula, lanterna, aparelho, tomadas). Detalhes em [[12-Historico]].

**Objetivo**: a Peregrinação ganha peso físico.

- **Queda e despertar** ([[Ideias/Gameplay/Queda-e-despertar]]): a animação completa (impacto, bordas escurecendo, borrão, escuro, abrir aos poucos, **ser arrastado por algo que não se vê**, 6–10 s, apagar, acordar e levantar). Lugar aleatório com chão. Sem custo por enquanto. Também para a queda sem fim.
- **Setores** (a base irregular — [[Ideias/Mundo/Enderecamento-da-Cidade]]): regiões de formas e tamanhos aleatórios no `Field`. Primeiro uso: energia.
- **Energia por região** ([[Ideias/Mundo/Energia-por-regiao]]): setores permanentemente apagados, instáveis e com energia.
- **Luz como recurso** ([[Ideias/Gameplay/Luz-como-recurso]]): a célula de energia, a lanterna (os fogos-fátuos viram a luz que você carrega), recarga em tomadas de setores com energia. Sem luz você anda, só não enxerga.
- Primeira versão da **interface mínima** ([[Ideias/Gameplay/Interface-diegetica]]): a energia aparece num aparelho na mão, não numa barra.

**Pronto quando**: atravessar um setor apagado com pouca carga dá tensão, e uma queda longa leva você para outro lugar.

---

## Fase 2 — Ler a Cidade ✔ (feita em 2026-09-29)

> Cinco etapas: `3e2a399` (a língua antiga), `c469b4b` (ler terminais), `fd0cd88` (endereços nas paredes), `f7712c4` (leitor portátil), `81aed15` (diário como arquivo). Copiar inscrições ficou de fora (as inscrições já ensinam quando lidas de perto). Detalhes em [[12-Historico]].

**Objetivo**: a Cidade passa a ter algo escrito — e você começa a entender.

- **A língua antiga** ([[Ideias/Gameplay/Traducao-como-progresso]]): a escrita de estêncil (procedural, humana, gasta), **números legíveis**, o léxico global, a função de tradução, a tela que mistura palavras conhecidas (no idioma do jogo) e desconhecidas (na escrita antiga). Só avança na Peregrinação.
- **Endereços nas paredes**: códigos irregulares pintados em estêncil (muito em alguns lugares, nada em outros, renumerados, repetidos).
- **Terminais com conteúdo** ([[Ideias/Gameplay/Terminais-com-conteudo]]): o gerador de registros (manutenção, obras, horários, endereços, esquemas, fragmentos de história) a partir do `Field`; a **tela no centro**; estados morto / com energia.
- **Leitor portátil** ([[Ideias/Gameplay/Ferramentas]]): o objeto na mão, que alimenta um terminal morto e arranca um fragmento.
- **Diário como arquivo** ([[Ideias/Gameplay/Diario-como-arquivo]]): registros (que se re-traduzem), léxico, lugares.
- (Opcional) **Copiar inscrições**, se fizer falta como fonte de palavras.

**Pronto quando**: ler um terminal ensina palavras, e reler um registro antigo no diário revela mais do que da primeira vez.

---

## Fase 3 — Seguir rastros ✔ (feita em 2026-09-29)

> Cinco etapas: `c87258a` (3.1 estruturas únicas), `08bd6b2` (3.2 pistas), `eafd97c` (3.3 início do mundo), `d9dad31` (3.4 sensor), `c0b9214` (3.5 mapa com descobertas). Detalhes em [[12-Historico]]. Escolhas feitas por padrão (a confirmar) em [[13-Decisoes]]. Ficaram para a fase 4: pistas para canteiros e trincheiras/horários de máquinas, e as outras estruturas únicas (sala de controle dos Construtores, antena, vila, berço).

**Objetivo**: os objetivos aparecem — sem nenhuma missão.

- **Pistas** ([[Ideias/Gameplay/Pistas]]): fragmentos de endereço vindos dos terminais → pista no diário → mais fragmentos estreitam a região → chegar → outro terminal, outra pista. Cadeias.
- **Sensor** ([[Ideias/Gameplay/Ferramentas]]): capta energia, terminais, máquinas; na tela do aparelho; confirma a chegada.
- **Mapa com descobertas** ([[Ideias/Gameplay/Mapa-de-descobertas]]): lugares, pistas com área de incerteza, setores.
- **Início do mundo** ([[Ideias/Gameplay/Inicio-do-mundo]]): partida aleatória perto de um terminal morto, leitor e pouca energia; a primeira pista.
- **Estruturas únicas** ([[Ideias/Gameplay/Estruturas-unicas]]) — as primeiras: terminal ativo, arquivo de registros, usina. No fim das cadeias.

**Pronto quando**: um mundo novo de Peregrinação, do primeiro terminal até uma estrutura única, é uma travessia que se joga sozinha, sem nenhum texto de missão.

---

## Fase 4 — Energia e travessia

**Objetivo**: mudar a Cidade e atravessá-la de verdade.

- **Religar setores** ([[Ideias/Gameplay/Religar-setores]]): subestações, a cascata de luzes voltando, o setor religado salvo no mundo (terminais completos, recarga, elevadores, trens).
- **Subir nas máquinas colossais** ([[Ideias/Gameplay/Subir-nas-maquinas]]): escotilhas e plataformas de embarque, convés andável, horários nos terminais. Transporte longo da Peregrinação.
- **Travessias difíceis** ([[Ideias/Gameplay/Travessias-dificeis]]): ajuste do mundo para que as rotas longas tenham escolhas (poços, treliças, setores apagados).
- **Marcas do jogador** ([[Ideias/Gameplay/Marcas-do-jogador]]) e **seeds compartilháveis** ([[Ideias/Gameplay/Seeds-compartilhaveis]]).
- Mais estruturas únicas; a **sala de controle dos Construtores**.

**Pronto quando**: dá para passar horas numa seed, religando uma região, com a Cidade lembrando do que você fez.

---

## Fase 5 — Preparar os seres

**Objetivo**: tudo o que Safeguards e NPCs precisam, sem nenhum deles ainda — para as fases 6 e 7 serem sobre comportamento, não sobre encanamento. ([[Ideias/Futuro/NPCs-e-Safeguards]], [[Ideias/Tecnico/Arquitetura-para-o-futuro]])

- **Camada de entidades**: um sistema do mundo como os outros; corpo com a mesma física do jogador; simulação completa perto, abstrata e lenta longe; estado salvo no mundo.
- **Navegação**: um grafo grosso a partir do `Field` (rede, passarelas, pisos, escadas, elevadores) + desvio local.
- **Percepção e alerta**: o barramento de eventos alimenta um **nível de alerta** por região (luz no escuro, setor religado, terminal lido…). O **acesso** do jogador (o análogo do **gene de terminal da rede**) passa a existir como dado.
- **Como os seres são feitos**: decidir o caminho visual — **procedural** como o resto do jogo (corpos montados por código, animação procedural) ou **modelos feitos à mão** (seria a primeira vez que o jogo teria assets externos). Protótipo de um corpo andando.
- **Lugares reservados** ganham forma: vilas abandonadas, cemitérios, o berço de Safeguards lacrado.
- **Despertar com sorteio** pronto para ligar (cemitério × colônia), ainda desligado.

**Pronto quando**: um corpo de teste (sem rosto, sem papel) atravessa a Cidade sozinho, de um lugar a outro, sem se perder nem atravessar paredes.

---

## Fase 6 — Safeguards

**Objetivo**: a Cidade percebe que você não deveria estar ali.

- **Surgimento**: Safeguards **saindo das paredes** quando o alerta de uma região passa do limite; níveis crescentes.
- **Comportamento**: caçar, perder o rastro, voltar; desenho e som à maneira de *Blame!*.
- **Hostilidade pelo acesso**: sem o "gene", você é um residente ilegal.
- **Dilemas**: luz × ser visto; religar setores × chamar atenção.
- **Morte → despertar** no **cemitério de vítimas**, perdendo energia e o que carregava (ferramentas ficam).
- **Defesa**: decidir se há a arma de Killy (o **emissor de feixe gravitacional**) ou se a Peregrinação continua sem combate (fugir, esconder, apagar a luz). Decisão para esta fase.
- No **modo Livre**: Safeguards desligáveis (decidir).

**Pronto quando**: a Cidade continua quieta e vazia quase sempre — e, quando um Safeguard aparece, é um evento que você não esquece.

---

## Fase 7 — NPCs (fase final)

**Objetivo**: os raros vivos da Cidade.

- **Humanos**: vilas escondidas; pouca fala; trocas.
- **Transumanos / ciborgues**: andarilhos, ambíguos.
- **Vida de silício**: inimigos da Autoridade, perigosos para todos — a terceira força.
- **Despertar numa colônia**: eles ficam com algo seu, ou **pedem uma missão** (entrega, ajuda).
- **Cargas** ([[Ideias/Gameplay/Cargas]]) saem do standby: entregas entre vilas.
- Relações com os Safeguards (vilas escondidas porque existem Safeguards).

**Pronto quando**: encontrar alguém vivo é raro, e cada encontro muda a travessia.

---

## Contínuo (entra onde couber)

- **Desempenho**: [[Ideias/Tecnico/Resolucao-dinamica]] (cedo, provavelmente junto da fase 1); cuidado com o custo das entidades nas fases 5–7.
- **Distribuição**: [[Ideias/Tecnico/Instalador-e-releases]] — um `.exe` a partir de alguma fase jogável (talvez depois da 3).
- **Mundo**: [[Ideias/Mundo/Relevo-em-outras-superficies]], [[Ideias/Mundo/Ruinas-de-colapsos]], [[Ideias/Mundo/Som-por-regiao]] e outras propostas, entre as fases.
- **O teste de fumaça** cresce a cada fase: modos, despertar, terminais, pistas, entidades.
- **O cofre** acompanha tudo.

## Perguntas que o plano deixa para a hora certa

- Fase 0: vários mundos salvos, ou um por modo?
- Fase 5: seres procedurais ou modelos feitos à mão?
- Fase 6: combate (a arma de Killy) ou só fuga? Safeguards no modo Livre?
- Fase 7: quanta fala os NPCs têm?
