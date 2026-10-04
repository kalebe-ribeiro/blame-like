---
status: pendente
prioridade: alta
tags: [pendencias]
---

# Pendências — decidido, ainda não feito no código

Reorganizada em 2026-10-04. Três listas: **a implementar** (decidido, na ordem), **esperando o usuário** (não implementar antes), **em observação**. O que foi fechado fica no fim, só com o ponteiro para o detalhe.

## 1. A implementar — nesta ordem

| # | o quê | nota | estado |
|---|---|---|---|
| 1 | **Barra de vida** — a vida, quedas com dano **pela altura** (a partir de 10 m; zera em 38 m/s ≈ 48 m), o golpe com arremesso dos hostis, o dano da sobrecarga, `check:health` | [[Barra-de-vida]] §10 | decidida (V1–V7; revista em 2026-10-04) — **a próxima** |
| 2 | **Dano variável do emissor + níveis (Safeguards e vida de silício)** — médio-fraco mata o baixo, o médio pede vários, o alto muitos; o colapso (o nível máximo, que custa o braço) mata qualquer um; ferir/matar um morador numa vila deixa a vila hostil | [[Dano-do-emissor]] | decidida (2026-10-04) — junto da barra de vida |
| 2b | **Movimento dos inimigos** — arranque com aceleração até uma velocidade terminal (o médio e o alto mais rápidos que a sua corrida); curvas custam velocidade | [[Movimento-dos-inimigos]] | decidida (M1–M4, 2026-10-04) — junto do dano (é o que equilibra a arma) |
| 3 | **Recuperar o braço** — câmara de reconstrução (única nova), prótese (loot), moradores das vilas (troca), a saída garantida sem braços e o aviso de um braço só | [[Recuperar-o-braco]] | decidida (R1–R7, 2026-10-04) |
| 4 | **Gene de terminal** — o objetivo final: pistas longas até onde está guardado (protegido ou esquecido; NPCs podem pegá-lo), um humano com o gene (amostra com ele vivo) e o analisador de genes; implantar na câmara de reconstrução; o controle da Cidade; três finais | [[Gene-terminal]] | decidida (G1–G6, 2026-10-04) — depende da câmara (item 3) |
| 5 | **Rework gráfico** — texturas, modelos de NPCs, animações variadas (as do golpe por ângulo e tipo de NPC; design e animação de cada hostil pelo nível, com variações no mesmo nível) | [[Rework-grafico]] | só **depois de toda a gameplay** |

### Regras novas que a barra de vida tem de respeitar (2026-10-04)
- **O próprio coice do emissor contra uma parede não tira vida** — o baque, o tremor e o som ficam. Só o **arremesso de um hostil** contra um obstáculo tira vida. Se o empurrão do emissor te tira de uma plataforma, a **queda** conta.
- **A queda é pela altura** (energia, `v²`), com a gravidade real do jogo (15 m/s², `controls/walker.js`) — a conta antiga ("14 m/s ≈ 10 m") estava errada: dava ~6,5 m.

### Risco já no jogo, resolvido pelo item 3
- **Peregrinação sem os dois braços = preso para sempre**: atirar além do limite com um braço só perde o segundo; sem braços não há quinas nem escadas, e nada devolve o braço (o despertar também não). Até o item 3 existir, um mundo salvo pode travar. As regras R6 (a saída) e R7 (o aviso de um braço só) de [[Recuperar-o-braco]] resolvem.

## 2. Esperando o usuário

(nada — tudo decidido em 2026-10-04; as credenciais de acesso foram descartadas)

## 3. Em observação
- **Travadas de ~1,9 s** numa rodada do `profile --profshot` (a primeira na RTX, depois da troca de GPU), ~2 s depois do tiro; não se repetiram em duas rodadas. Hipótese: o cache de shaders do Chromium montado para a Intel. Se voltar, o `profile` lista os programas de shader novos de cada tiro.
- **O código de mundo não leva os cortes do emissor** — aceito e avisado ao copiar ([[Seeds-compartilhaveis]]); só muda se o usuário quiser.

## Fechadas (só o ponteiro)
- **Arma de Killy** — F1–F4, sobrecarga com 7 estágios, o braço além do limite, coice, o chão sob os pés e as duas rodadas de pendências (todos os checks verdes, 2026-10-03): [[Arma-do-Killy]] (Andamento) e [[12-Historico]].
- **Fase 0** (2026-09-29) — tirar todo o caráter alienígena (HUD, glifos, mensagens, README → a língua antiga humana) e inglês como padrão com português opcional: [[15-Plano-de-Implementacao]] fase 0.
- **Limpeza** (2026-09-30) — materiais sem uso `organic`/`anomaly`, `buildTendril`, `lsystem.js` apagados.
