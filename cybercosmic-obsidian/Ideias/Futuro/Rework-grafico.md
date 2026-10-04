---
status: futuro — decidido que vem DEPOIS de toda a gameplay (usuário, 2026-10-03)
prioridade: depois da gameplay
tags: [futuro, grafico, texturas, modelos, animacao, npcs]
---

# O grande rework gráfico

> Usuário (2026-10-03): "deixe notado que após finalizarmos todos os aspectos da gameplay, haverá um grande rework gráfico, adicionando texturas variadas, modelos de NPCs detalhados e variados, e animações diversas variadas."

## Quando
**Depois de finalizar todos os aspectos da gameplay.** Até lá, o visual é o de agora — formas geométricas, materiais procedurais (`shaders/materials.js`), corpos simples dos seres (`world/bodies.js`) e animações únicas. As features de gameplay continuam sendo feitas com esse visual e **não** esperam o rework (nem o antecipam).

## O que entra (registrado — o detalhe se decide na hora)
| frente | o que |
|---|---|
| **texturas variadas** | superfícies com textura de verdade (concreto, aço, ferrugem, fuligem, grades…) no lugar (ou além) dos padrões procedurais de hoje — variadas por bioma, por estrutura, por idade |
| **modelos de NPCs detalhados e variados** | os seres (moradores, andarilhos, vida de silício, os tipos de Safeguard) com modelos detalhados, e mais de um modelo por tipo |
| **cada hostil pelo seu nível** (2026-10-04) | o **design** (o modelo, o tamanho, a silhueta, os materiais, as luzes do corpo) e a **animação** (o andar, a corrida — o arranque e a velocidade de [[Movimento-dos-inimigos]] —, o golpe, o ferido, a morte) de cada hostil **mudam com o nível** (baixo, médio, alto — Safeguards, vida de silício e os que vierem), para o jogador **ler o perigo de longe**; e **variações dentro do mesmo nível** (mais de um modelo e de um jeito de se mover por nível), para dois do mesmo nível não serem cópias |
| **animações diversas e variadas** | andar, correr, escalar, agarrar, golpear, cair, levantar — com variações; em especial **as do golpe e do arremesso**, por ângulo (por trás, de frente, de baixo, lateral — 2+ cada) e por tipo de NPC ([[Barra-de-vida]] §5) |

## O que precisa ser lembrado na hora
- A direção de arte continua a de [[02-Direcao-de-Arte]] e [[14-Universo-Blame]] (*Blame!* como referência direta; sem neon/glitch/alienígena/formas orgânicas/portais — com as exceções conscientes já decididas, como as cores da sobrecarga do emissor).
- O orçamento de desempenho ([[06-Render-e-Desempenho]], `npm run profile`): texturas e modelos novos passam pelo mesmo crivo (fps, GPU, memória de vídeo — `check:beam` caso `lotes`).
- A geração é determinística e em workers: texturas e variações de modelo têm de sair da seed do mesmo jeito.
- As capturas no instante certo (`--fxshots`, `--capture`) e a regra de nunca afirmar algo visual sem medir e capturar.
