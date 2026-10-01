---
status: implementado (2026-10-01)
prioridade: feita
tags: [futuro, arma, safeguards, terreno]
---

# A arma do Killy — emissor de feixe gravitacional

> **Implementado (2026-10-01)** — `app/beam.js`, `world/holes.js`, `shaders/chunks.js` (`holeEdge`), `world/collision.js`. Pedido do usuário: **não atravessa camada intransponível nem estrutura única**; **potência ajustável** (alcance, raio do feixe, gasto por tiro); **pelo menos 5 tiros com a célula cheia**.
>
> | potência | alcance | raio | gasto |
> |---|---|---|---|
> | 1 | 30 m | 0,5 m | 4% |
> | 2 | 60 m | 0,9 m | 7% |
> | 3 | 120 m | 1,4 m | 11% |
> | 4 | 220 m | 2,0 m | 15% |
> | 5 | 400 m | 2,8 m | 19% (5 tiros com a célula cheia) |
>
> - Uma ferramenta do inventário (`emitter`), nos dois modos (no Livre não gasta). Vai para a mão pela regra das mãos; o primeiro aperto a põe na mão, o seguinte atira.
> - **Atirar:** Q · clique esquerdo · RT (botão 7). **Potência:** B · roda do mouse (com o emissor na mão) · R3 (botão 10). A lanterna do Livre foi do botão 7 para o 13 (↓ do direcional).
> - **Camadas:** o feixe acaba ao entrar na faixa da laje onde ela é maciça (`beamReach`, analítico pelo Field). **Únicas:** de fora acaba na caixa delas (+1 m); de dentro (dá para entrar), na face de dentro das paredes (3 m de espessura).
> - **Caixas guardadas:** o shader e a colisão **nunca** furam dentro da faixa de uma camada nem da caixa de uma única (até 6 perto, `uKeepMin/uKeepMax`). Sem isso, um feixe de 2,8 m de raio rente ao piso de uma camada abria o piso dela.
> - O que o feixe atravessa morre (`kill(e, 'beam')`). Atirar sobe o alerta do setor e os Safeguards perto ouvem. Até 200 buracos ficam salvos no mundo (`slot.holes`); 12 mais perto vão ao shader.
> - Teste `npm run check:beam` (8 itens: potência, rente à camada, camada, única de dentro e de fora, buraco atravessável a pé, morte, 5 tiros). Capturas: `--beamshot=N --beampower=P --beamlook=ms --beamhold`.
> - Achado no teste: a primeira versão parava o feixe a 0 m dentro de uma vila (as vilas são estruturas únicas e a caixa com 8 m de margem englobava quem estava dentro).


> **Decidido (2026-09-30):** quando a arma for implementada, o buraco será feito pelo **método "de shader"** descrito abaixo (cilindros salvos + `discard` + borda pintada + colisão ignorando). Nada de CSG. Continua em aberto: se a arma existe mesmo (combate × só fuga), o que ela não fura, alcance, custo.

> Discussão de 2026-09-30. O usuário perguntou quão difícil seria implementar a arma do Killy (*Blame!*, [[14-Universo-Blame]]) **capaz de destruir terreno e obstáculos, deixando um buraco circular por onde o feixe passa**. Registrado para a fase 6 ("combate ou só fuga" — [[15-Plano-de-Implementacao]]).

## Dificuldade estimada (0–100)

| parte | nota | comentário |
|---|---|---|
| a arma em si (modelo, carga, recuo, clarão, feixe na névoa, estrondo, gasto de energia, botão no teclado **e no controle**) | ~15 | igual à lanterna e ao aparelho: objeto preso à câmera |
| buraco "de shader" (**escolhido**) | ~60 no total | ver abaixo |
| buraco de geometria de verdade (CSG) | ~85 no total | recortar a malha de cada chunk atingido num worker; o feixe atravessa quilômetros → dezenas de chunks por tiro, engasgos; e todo chunk recarregado teria de reaplicar os cortes |

Por que o buraco é o difícil: o mundo **não é feito de blocos**. Cada chunk é gerado por fórmula (`Field`) e juntado numa malha só por material (`BatchedMesh`). Não existe "o pedaço de parede" para apagar.

## O buraco "de shader" (o método escolhido)

A ideia: **não cortar a geometria — esconder o que está dentro do buraco, e fazer o corpo ignorar o que está escondido.**

1. **O tiro vira um cilindro.** Cada disparo guarda só três coisas: de onde saiu, a direção, o raio. É um cilindro invisível atravessando a Cidade (ou uma cápsula, com o fim onde o feixe parou).
2. **Os shaders apagam o que está dentro.** Todo material, ao pintar cada pixel, pergunta: "este ponto está dentro de algum cilindro de tiro?" Se está, o pixel não é desenhado (`discard`). Resultado: um furo redondo e limpo em tudo o que o feixe atravessou — paredes, lajes, vigas, dutos —, visto de qualquer ângulo.
3. **A borda do corte.** As paredes são caixas **ocas** (só a casca). Sem cuidado, o furo mostraria o vazio de dentro da caixa. O truque: desenhar também o lado de dentro das caixas e pintá-lo como a borda do corte (escura, queimada, levemente incandescente logo depois do tiro). Olhando pelo furo, parece que a parede é maciça e foi fundida.
4. **O corpo atravessa.** A colisão (`world/collision.js`) passa a ignorar os pontos dentro dos cilindros — dá para passar pelo buraco, e cair por ele.
5. **A Cidade lembra.** Os cilindros ficam salvos no mundo (o `WorldState` de mudanças que já existe). Voltar ao lugar = o buraco continua lá. É determinístico: o mundo é refeito pela fórmula e o buraco é refeito pelo cilindro salvo.

O que pesa:
- o `discard` entra em **todos** os shaders — inclusive a oclusão de ambiente (SSAO), o reflexo da água, as silhuetas colossais e o LOD distante;
- há um limite de cilindros ativos por quadro (uns 32, os mais próximos);
- `discard` custa um pouco de desempenho (desliga otimizações de profundidade da placa de vídeo).

## A decisão de jogo (maior que a técnica)

Se a arma fura tudo, as **camadas intransponíveis** deixam de ser intransponíveis: um tiro para baixo atravessa 72 m de laje e desfaz a lógica das passagens, dos elevadores e das pistas que trocam de camada. Recomendação: **camadas e estruturas únicas indestrutíveis**, alcance limitado. No mangá a megaestrutura resiste até certo ponto.

Outras perguntas para a fase 6: quanta energia um tiro gasta; se atirar aumenta o alerta dos Safeguards (o barramento de eventos já alimenta isso na fase 5); se a arma existe no modo Livre.
