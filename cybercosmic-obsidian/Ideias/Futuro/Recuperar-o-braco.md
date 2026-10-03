---
status: futuro — em aberto (pedido do usuário, 2026-10-03: "deixa em aberto")
prioridade: a decidir
tags: [futuro, gameplay, corpo, arma, estruturas-unicas, loot]
---

# Recuperar o braço

> Pedido do usuário (2026-10-03): níveis do emissor além do limite em que "o braço usado pra atirar é perdido" — e "deixa registrado no cofre uma futura mecânica que permite recuperar o braço em algumas estruturas específicas, ou loot, não sei. Deixa em aberto."

## O que existe hoje (feito)

- O emissor ([[Arma-do-Killy]]) tem estágios além do limite: **5 espaguetificação (8 s) · 6 horizonte (9,5 s) · 7 colapso (11 s)**. Disparar num deles **desfaz o braço que segura o emissor** (`app/beam.js` `loseArm`, `ARM_LOSS_STAGE`).
- O estado: `player.arms = { right, left }` (salvo no slot, `app/player.js`). Um braço perdido não segura nada (`app/inventory.js` `equip` — o emissor volta ao inventário e o outro braço o pega); **sem os dois braços**, o corpo não agarra quinas nem sobe escadas de marinheiro (`walker.canGrab` / `walker.canClimb`).
- **Peregrinação: o braço não volta** — até existir esta mecânica. **Livre** (sem custos): volta sozinho em 30 s (`ARM_REGROW_FREE`).
- Teste: `check:beam` caso `alem`.

## Em aberto — como recuperar

Ideias soltas para decidir depois (nenhuma escolhida):

| caminho | como seria | combina com |
|---|---|---|
| **estruturas únicas** | um tipo novo (ou o `cradle` — o berço) onde o corpo é refeito: entrar, ficar um tempo, sair inteiro | *Blame!*: as máquinas que fazem e consertam corpos; as [[Estruturas-unicas]] já são os lugares "sagrados" do mapa |
| **loot** | um braço (prótese, peça de corpo) achado num lugar raro — num cemitério de vítimas, num depósito — e instalado | [[Cargas]] e o cemitério ([[Queda-e-despertar]]) |
| **NPCs** | alguém numa vila refaz o braço em troca de uma carga, de energia ou de uma missão | [[NPCs-e-Safeguards]], a troca que já existe na conversa |
| **regeneração lenta** | o corpo de Killy se refaz: o braço volta sozinho, mas em muito tempo (minutos/horas de jogo), talvez só dormindo/parado | a [[Barra-de-vida]] (regeneração) |
| **combinação** | lento sozinho, rápido numa estrutura ou com uma peça | — |

Perguntas para quando for a hora:
- O braço novo é igual ao antigo, ou diferente (prótese visível, outra luva)?
- Perder os dois braços deve ter uma saída garantida (para o jogador não ficar preso sem quinas e escadas)?
- Recuperar custa algo (energia, uma carga, tempo)?
- Os estágios além do limite deveriam também tirar vida (a [[Barra-de-vida]])?
