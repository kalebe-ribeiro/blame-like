---
status: feita
prioridade: alta
tags: [gameplay, peregrinacao]
---

# Início de um mundo (modo Peregrinação)

> **Feito na fase 3** (`startPlace` em `lang/leads.js`, `app.js`): plataforma de estação num setor apagado, diante de um terminal morto que sempre cita alguém; leitor portátil, 35% de carga, lanterna acesa; o primeiro fragmento sempre traz parte da rota. Destino de transporte "Início da Peregrinação".

> Decidido (2026-09-29).

Você começa **perto de um terminal morto**, com o [[Ferramentas|leitor portátil]] e **pouca energia** ([[Luz-como-recurso]]). A primeira leitura já traz **um fragmento de endereço** — a primeira [[Pistas|pista]]. É o Killy acordando sem saber para onde ir, e o primeiro rastro está logo ali.

- O primeiro terminal é escolhido pelo `Field` (determinístico pela seed), num lugar que **existe** e tem chão.
- Nada de tutorial em texto: a primeira pista é o tutorial.

## Ponto de partida — decidido (2026-09-29)
**Aleatório**: um lugar diferente em cada seed (determinístico pela seed), sempre perto do primeiro terminal morto. A ponte inicial fica só para o modo Livre.
