---
status: feita (fase 1)
prioridade: alta
tags: [mundo, luz, base]
---

# Condições de energia por região

> **Feita na fase 1**: `Field.sectorAt` (Voronoi com pesos, célula 900 m, só as camadas cortam na vertical) + o mesmo hash em GLSL (`sectorPower`, shaders/chunks.js). ~30% apagados, ~15% instáveis. Lâmpadas, janelas, linhas técnicas, trens, elevadores e terminais obedecem. "Religar" (salvar o estado) fica para a fase 4.

Pré-requisito de [[Religar-setores]] e [[Luz-como-recurso]] (ambas escolhidas).

Setores **permanentemente** sem luz (só o que você carrega ilumina) e setores com energia instável que pisca em ondas. Hoje os apagões são temporários (`world/outages.js`). O estado "religado" de um setor fica salvo no mundo.
