---
status: pendente
prioridade: alta
tags: [pendencias]
---

# Pendências — decidido, ainda não feito no código

Reorganizada em 2026-10-03. Três listas: **a implementar** (decidido, na ordem), **esperando o usuário** (não implementar antes), **em observação**. O que foi fechado fica no fim, só com o ponteiro para o detalhe.

## 1. A implementar — nesta ordem

| # | o quê | nota | estado |
|---|---|---|---|
| 1 | **Barra de vida** — a vida, quedas com dano **pela altura** (a partir de 10 m; zera em 38 m/s ≈ 48 m), o golpe com arremesso dos hostis, o dano da sobrecarga, `check:health` | [[Barra-de-vida]] §10 | **feita** (2026-10-04): `check:health` 12/12, `check:safeguards` 9/9 — ver o Andamento da nota |
| 2 | **Dano variável do emissor + níveis (Safeguards e vida de silício)** — médio-fraco mata o baixo, o médio pede vários, o alto muitos; o colapso (o nível máximo, que custa o braço) mata qualquer um; ferir/matar um morador numa vila deixa a vila hostil | [[Dano-do-emissor]] | **feita** (2026-10-04) — ver o Andamento da nota |
| 2b | **Movimento dos inimigos** — arranque com aceleração até uma velocidade terminal (o médio e o alto mais rápidos que a sua corrida); curvas custam velocidade | [[Movimento-dos-inimigos]] | **feita** (2026-10-04) |
| 3 | **Recuperar o braço** — câmara de reconstrução (única nova), prótese (loot), moradores das vilas (troca), a saída garantida sem braços e o aviso de um braço só | [[Recuperar-o-braco]] | **feita** (2026-10-04) — inclusive a prótese nos depósitos |
| 4 | **Gene de terminal** — o objetivo final: pistas longas até onde está guardado (protegido ou esquecido; NPCs podem pegá-lo), um humano com o gene (amostra com ele vivo) e o analisador de genes; implantar na câmara de reconstrução; o controle da Cidade; três finais | [[Gene-terminal]] | **feito** (2026-10-04) — `check:gene` 9/9 |
| 5 | **Rework gráfico** — texturas, modelos de NPCs, animações variadas (as do golpe por ângulo e tipo de NPC; design e animação de cada hostil pelo nível, com variações no mesmo nível) | [[Rework-grafico]] | **feito na branch `rework-grafico`** (2026-10-09, frentes 1–6) — aguardando revisão e merge do usuário |

### Do playtest do rework (2026-10-09, fotos do usuário)
| # | o quê | nota | estado |
|---|---|---|---|
| 6 | **Pendurado no corrimão, não anda de lado** — dá para se agarrar no corrimão (guarda-corpo), mas o movimento lateral pendurado não funciona nele (nas quinas comuns funciona — [[Mobilidade]]) | ![[playtest-corrimao.png]] | pendente |
| 7 | **Os braços em primeira pessoa continuam errados** — pendurado, os dois braços sobem do meio de baixo da tela e se **cruzam em X** (os ombros parecem sair do mesmo ponto, o defeito da frente 1 que a frente 4 deveria ter resolvido: `app/limbs.js`, o IK do ombro até a mão da quina). Conferir também com o aparelho, a lanterna e o emissor | ![[playtest-bracos-x.png]] | pendente |

### Regras novas que a barra de vida tem de respeitar (2026-10-03)
- **O próprio coice do emissor contra uma parede não tira vida** — o baque, o tremor e o som ficam. Só o **arremesso de um hostil** contra um obstáculo tira vida. Se o empurrão do emissor te tira de uma plataforma, a **queda** conta.
- **A queda é pela altura** (energia, `v²`), com a gravidade real do jogo (15 m/s², `controls/walker.js`) — a conta antiga ("14 m/s ≈ 10 m") estava errada: dava ~6,5 m.

### ✔ Risco resolvido pelo item 3 (2026-10-04)
- **Peregrinação sem os dois braços = preso para sempre**: atirar além do limite com um braço só perde o segundo; sem braços não há quinas nem escadas, e nada devolve o braço (o despertar também não). Até o item 3 existir, um mundo salvo pode travar. As regras R6 (a saída) e R7 (o aviso de um braço só) de [[Recuperar-o-braco]] resolvem.

## 2. Esperando o usuário

- **Escalar pelos apoios da parede** ([[Mobilidade]] §4) — pendência pedida pelo usuário (2026-10-05). **Em 2026-10-08: nada novo de mobilidade por ora** (o usuário fica com o que existe). O levantamento (`--holdstats`) não achou nenhuma parede escalável: a escalada precisa que a geração ganhe relevo (cornijas, nervuras, grampos de manutenção) onde a Cidade teria. Decidir antes de implementar.

## 3. Em observação

- **Regressão do rework (2026-10-09): o Safeguard não embarca no elevador grande** (`check:safeguards`, caso `subir:elevador`). Com o Safeguard de território mais perto do elevador (o teste agora escolhe esse — antes pegava o primeiro da lista, que dependia da ordem em que nasciam), a versão de antes das sombras (`6aba3d3`) passa sempre (4/4) e a de depois (`23d85d4`, frente 2) falha quase sempre: o Safeguard chega, espera rodeando o ponto de espera (velocidade 1–2 m/s em vez de parar) e, no embarque, fica parado na borda da cabine até desistir. Bisseção feita dentro do commit: **não é** o limite dos cabos (0,1/0,2 m), **nem** a marca `down` das luminárias, **nem** a lista de recorte dos lotes, **nem** o passe de sombra (desligado também falha), **nem** quadros lentos na CPU (15 ms a mais por quadro: a versão de antes ainda passa). Sobra o custo dos shaders na GPU (o laço do jogo pula quadros quando a GPU está atrás). A escada (`subir:escada`) passa. Investigar: o que no embarque depende do ritmo da GPU. (Decisão do Claude: registrar e seguir o rework; não desfazer a luz.)
- ✔ **Casos de teste que dependiam do lugar sorteado** — resolvidos (2026-10-04): a vida usa uma **arena preparada** (`dev/arena.js`: plataforma, parede, borda, piso 70 m abaixo, no vão de um poço); o arranque e a curva dos Safeguards conferem a regra numa **simulação determinística** do mesmo `accelerate()` (no mundo, só que o corpo chega à terminal).
- **Travadas de ~1,9 s** numa rodada do `profile --profshot` (a primeira na RTX, depois da troca de GPU), ~2 s depois do tiro; não se repetiram em duas rodadas. Hipótese: o cache de shaders do Chromium montado para a Intel. Se voltar, o `profile` lista os programas de shader novos de cada tiro.
- **O código de mundo não leva os cortes do emissor** — aceito e avisado ao copiar ([[Seeds-compartilhaveis]]); só muda se o usuário quiser.

## Fechadas (só o ponteiro)
- **Arma de Killy** — F1–F4, sobrecarga com 7 estágios, o braço além do limite, coice, o chão sob os pés e as duas rodadas de pendências (todos os checks verdes, 2026-10-03): [[Arma-do-Killy]] (Andamento) e [[12-Historico]].
- **Fase 0** (2026-09-29) — tirar todo o caráter alienígena (HUD, glifos, mensagens, README → a língua antiga humana) e inglês como padrão com português opcional: [[15-Plano-de-Implementacao]] fase 0.
- **Limpeza** (2026-09-30) — materiais sem uso `organic`/`anomaly`, `buildTendril`, `lsystem.js` apagados.
