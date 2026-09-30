---
status: feita (fase 4.1)
prioridade: média
tags: [gameplay, mundo]
---

# Religar setores

> **Feita na fase 4.1** (`world/substations.js`, `app/power.js`, `substationFor` em `gen/sites.js`): subestação = armário com alavanca numa plataforma de estação do setor apagado (uma por faixa de 480 m; nunca na estação do começo). Os terminais do setor citam a subestação (pista do tipo `substation`). Religar custa 20% da célula na Peregrinação; a luz volta como frente de 40 m/s a partir do armário (`Field.restored` → `sectorLight` na CPU, `uRestoredId/uRestoredFront` → `sectorPower` no shader). Salvo no mundo (`WorldState` `sector:<id>`), âmbar no mapa, contado no diário. Ficou para depois: a usina (estrutura única) religar uma região inteira; religar ser notado pelos Safeguards.

> Escolhida (2026-09-29).

Achar a **subestação** de um setor apagado (muitas vezes por uma [[Pistas|pista]]), religar e ver as luzes voltarem em cascata por quilômetros (o efeito já existe em `world/outages.js`).

O setor religado:
- acende terminais (conteúdo completo — [[Terminais-com-conteudo]]), elevadores, transportadores;
- vira ponto de **recarga** ([[Luz-como-recurso]]);
- fica no [[Mapa-de-descobertas|mapa]] e no estado salvo do mundo.

Pré-requisito: setores **permanentemente** apagados ([[Energia-por-regiao]]).

## Futuro
Religar pode ser **notado pela Cidade** (a Autoridade / os Safeguards — [[NPCs-e-Safeguards]]).
