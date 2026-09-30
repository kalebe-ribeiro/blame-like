---
status: em andamento
prioridade: alta
tags: [gameplay, mundo, direcao]
---

# Estruturas únicas

> **Fase 4.5** (`app/uniques.js`; `builders`/`antenna` em `uniqueSite`/`buildUnique`): **efeitos na primeira leitura do console** (salvos em `slot.uniques`): arquivo = 14 palavras entendidas de uma vez; usina = religa os setores apagados a 2,5 km (`restoreSector`); console ativo = 3 únicas vizinhas no mapa como pistas completas (`lead:reveal`); **sala de controle dos Construtores** (nova) = canteiros da laje a 6 km no mapa; **terminal de transmissão** (novo: casinha + mastro de ~110 m com luz de alerta) = sensor 2,5× (`slot.boosts.antenna`). Os tipos novos saem de um sorteio à parte (hash 983, 30%), então os mundos antigos mantêm os seus. **Fase 5**: a vila abandonada (`village`), o cemitério de vítimas (`graveyard`) e o berço de Safeguards lacrado (`cradle`) existem — com terminal, sem efeito; sorteio à parte (hash 984).

> **Fase 3.1** (`uniqueSite` em `gen/field.js`, `buildUnique` em `gen/macrogen.js`): console ativo, arquivo de registros e usina — uma por ~16 km, no alto das camadas, fim das cadeias de [[Pistas]]; o console tem energia própria e guarda o [[Ferramentas|sensor]] (até você ter um). Os efeitos (salto de tradução, religar a região, ampliar o sensor) e as outras estruturas ficam para a fase 4 em diante.

> Escolhida (2026-09-29). São os **objetivos** do jogo: raras, no fim de cadeias de [[Pistas|pistas]].

Construções muito raras por seed (uma a cada dezenas de km). Achar uma é um evento. Ideias, todas no repertório de *Blame!* ([[14-Universo-Blame]]):

| estrutura | o que é / dá |
|---|---|
| **terminal ativo** | um ponto que ainda fala com "a rede": muito texto, mapas grandes, pistas raras |
| **arquivo de registros** | salas de memória física: salto grande de [[Traducao-como-progresso|tradução]] |
| **usina / subestação-mãe** | religa uma região inteira de uma vez ([[Religar-setores]]) |
| **sala de controle dos Construtores** | mostra os canteiros de uma região; um dia, talvez, influir neles |
| **terminal de transmissão / antena** | amplia o alcance do [[Ferramentas|sensor]] |
| **vila abandonada** | onde viveram humanos — **reservada para os NPCs futuros** ([[NPCs-e-Safeguards]]) |
| **berço de Safeguards** (lacrado) | **reservado para o futuro**: hoje só uma estrutura lacrada e inquietante |

Implementação futura: grade enorme no `Field`, geometria própria na macro, fora do teletransporte do modo livre? (Decidir.)
