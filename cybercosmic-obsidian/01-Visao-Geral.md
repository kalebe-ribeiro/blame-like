# 01 — Visão geral

**CYBERCOSMIC** é um simulador contemplativo 3D de *cybercosmicismo*: o horror de uma construção humana que nunca parou. Brutalismo megalomaníaco na linhagem da Cidade de *Blame!* — concreto sem fim, poeira, luzes de sódio que ninguém mantém.

- **Mundo infinito** em todas as direções (inclusive para cima e para baixo), gerado proceduralmente a partir de uma seed.
- **Andável**: gravidade, colisão real, escadas, elevadores, vagões. Também dá para voar (noclip).
- **Sem objetivo hoje**: só um sistema grande demais para ser compreendido, e você dentro dele. **Em discussão** (2026-09-29): um modo com progressão — ler a Cidade, seguir rastros, religar setores — sem fim, mas com objetivos ([[Ideias/Gameplay/Plano-de-Gameplay]]). Referência direta: *Blame!* ([[14-Universo-Blame]]).
- **Tudo procedural**: geometria, texturas (no shader), som (Web Audio). Nenhum asset externo, nenhum servidor.

## Tecnologia

- **Electron 33** + **Three.js r170** (+ `three-mesh-bvh` para colisão).
- Protocolo próprio `app://bundle/` (ES modules + import map).
- Geração em **Web Workers**; o mundo é uma função pura da seed (ver [[03-Arquitetura]]).
- ~15 mil linhas de JS em `src/`.

## Estado

- Visualmente considerado fiel ao que o usuário imaginava (2026-09-26).
- Teste de fumaça (`npm run check`) visita 21 destinos e passa.
- Desempenho: 30–120 fps num notebook com RTX 4060 — a variação vem mais do plano de energia do Windows do que do jogo (ver [[06-Render-e-Desempenho]]).

## O que existe hoje (resumo)

- **Regiões**: teia, colmeia, maciço, vazio, abismo/altura/deriva, setores inundados.
- **Megaestruturas**: galerias, poços, estratos, treliças, condutos, escadarias infinitas, **camadas intransponíveis** (com elevadores colossais, relevo no topo e trincheiras de máquinas embaixo).
- **Coisas vivas (sem entidades)**: Construtores (pórticos que constroem), vagões de transportador, elevadores, **máquinas colossais**, apagões de setor, colapsos distantes, cascatas, gotas e vapor, terminais mortos.
- **Travessia**: continuar de onde parou, diário, mapa 3D do caminho (M), transporte para 21 tipos de lugar (T), modo foto (F2), controle de videogame.
- **Som**: drone, vento, obra distante, reverberação que responde ao espaço, e uma trilha de acordes raros por região.

Detalhes: [[04-Mundo-e-Geracao]], [[05-Sistemas-Vivos]], [[08-Interface-e-Travessia]].
