---
status: em andamento
prioridade: alta
tags: [tecnico, arquitetura, base]
---

# Arquitetura para o futuro

> **Fase 0 (2026-09-29)**: feitos os itens 1 (perfil × mundo salvo — `app/saves.js`), 2 (`WorldState` por id estável), 3 (barramento — `core/events.js`), 4 (estado do corpo — `app/player.js`) e 6 (modos — `app/modes.js`). O item 5 (entidades) é da fase 5.

O que precisa existir **antes** do gameplay, pensado para aguentar NPCs e Safeguards depois ([[NPCs-e-Safeguards]]). Proposta para discussão — sem código ainda.

## 1. Duas memórias separadas
| memória | escopo | guarda |
|---|---|---|
| **perfil** | global (todos os mundos) | léxico / [[Traducao-como-progresso|tradução]], configurações |
| **mundo** | por seed + modo | posição, energia, ferramentas, pistas, registros lidos, setores religados, portas abertas, marcas; no futuro, estado dos NPCs |

## 2. O mundo = lei + diferenças
O `Field` continua gerando tudo; o salvamento guarda só **o que mudou** (um setor religado, uma porta aberta, um item pego). Isso pede **ids estáveis** para tudo que é interativo (terminal, porta, subestação, NPC), derivados das coordenadas no `Field`.

## 3. Um barramento de eventos
Hoje cada sistema tem sua fila (`builders.events`, `colossi.events`, callbacks de apagão). Um **barramento único** ("setor religado", "porta cortada", "luz ligada no escuro", "colapso") serve ao som, ao HUD, ao diário — e, no futuro, ao **nível de alerta** dos Safeguards.

## 4. Estado do corpo
Componentes para o jogador desde já: energia (luz/ferramentas), inventário (ferramentas), acesso. Depois: vida e dano, sem reescrever.

## 5. Camada de entidades (para depois, mas prevista)
- Entidades como um sistema do mundo (igual aos que existem: `update / rebase / dispose`), com física do mesmo `Walker`/`CollisionWorld`.
- **Navegação** a partir do `Field` (rede de nós, passarelas, pisos, escadas → grafo grosso) + desvio local com colisão.
- Simulação em dois níveis: completa perto, abstrata e lenta longe.
- **Populações determinísticas** (vilas nas [[Estruturas-unicas]]) + **surgimentos dinâmicos** (Safeguards saindo das paredes por evento).

## 6. Modos
O modo ([[Modos-de-jogo]]) é parte do salvamento do mundo; regras (voo, teletransporte, energia) consultadas num lugar só.
