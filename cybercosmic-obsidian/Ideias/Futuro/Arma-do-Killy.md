---
status: futuro — pronto para retomar (corte de verdade)
prioridade: futura
tags: [futuro, arma, safeguards, terreno]
---

# A arma do Killy — emissor de feixe gravitacional (fase 6)

> ## Preparado para retomar (2026-10-02) — o corte de verdade (CSG)
>
> A primeira versão (buracos por shader) foi retirada a pedido do usuário: não convencia. Os requisitos dele continuam: **não atravessa camada intransponível nem estrutura única**; **potência ajustável** (alcance, raio do feixe, gasto por tiro); **≥ 5 tiros com a célula cheia**. Retomando, o furo é **geometria de verdade**.
>
> **Viabilidade medida** (`node tools/csg-spike.mjs [raio] [chunks]`, `three-bvh-csg` 0.0.17 — a 0.0.18 exige three ≥ 0.179): chunks reais do mundo, um cilindro atravessando, cada peça que ele cruza recortada (peça − cilindro).
> - 11 chunks, raio 1,4 m: 226 peças perto do feixe, 97 cortadas, **0 falhas**; ~70–100 ms por chunk com a máquina livre (pior ~250 ms; com outros testes rodando na máquina, até 2 s — medir de novo antes de fechar números). Tudo no worker de geração: o quadro não trava.
> - Conferência: **nenhum triângulo dentro do cilindro** fora das lajes das camadas (`barrier`) — que a arma não corta.
> - As peças cortadas ganham triângulos (8,3 mil → 22 mil nas cortadas): aceitável.
>
> **Como fica (o plano):**
> 1. A jogabilidade da versão retirada volta quase igual (`git show 458d019:src/app/beam.js`): o emissor no inventário e nas mãos, Q/clique/RT, potência B/roda/R3, a tabela de potência, o gasto, a morte do que está no caminho, o som, o alerta. Sai tudo o que era buraco de shader.
> 2. Os cortes ficam no mundo salvo: cilindros GLOBAIS (a, b, r), como antes.
> 3. A geração: o pedido de cada chunk leva os cilindros que tocam a caixa dele; em `ChunkBuilder.add` cada peça que um cilindro cruza sai recortada (CSG) — **nunca** as lajes das camadas, as peças das estruturas únicas, nem dentro das "caixas guardadas" (a faixa das camadas, a caixa das únicas). A `three-bvh-csg` vai para o worker como a `three-mesh-bvh` (`tools/vendor-bvh.mjs` → um vendor para ela também).
> 4. O tiro: os chunks cruzados (perto, macro; os LOD podem ficar sem o furo de longe) são pedidos de novo; a malha velha fica até a nova chegar (sem piscar).
> 5. A colisão vem da malha nova (com a árvore já montada no worker) — sem truque nenhum: corpo, mãos, seres e vagões nunca somem.
> 6. Teste `check:beam` de volta, conferindo a geometria: o raio de colisão passa pelo furo, a parede do corte existe (um raio de dentro do furo, para o lado, bate a ~r do eixo), as camadas e únicas ficam inteiras, 5 tiros na potência máxima.

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
