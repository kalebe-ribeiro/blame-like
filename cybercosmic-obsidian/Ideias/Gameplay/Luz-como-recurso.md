---
status: feita (fase 1)
prioridade: média
tags: [gameplay, recursos]
---

# Luz como recurso

> **Feita na fase 1** (`app/carried.js`): uma célula só; lanterna (F / X) gasta — 7 min de carga cheia — e falha no fim; tomadas (`ChunkBuilder.socket`) recarregam em 25 s com E / Y, se o setor tiver energia. Mundo novo da Peregrinação começa com 35%.
>
> **Refeita em 2026-09-30** (o usuário achou a primeira horrível: "só aumentou brilho e saturação"). Era uma luz pontual em volta do corpo, que acendia a névoa em volta da câmera. Agora é um **facho** dedicado nos shaders (`uFlashPos/Dir/Color`; `flashProfile` e `flashScatter` em `shaders/chunks.js`): cone com miolo, anel do refletor, manchas da lente, véu; ~30 m; poeira acesa no cone (10 amostras por pixel, sem ruído); mira no ponto a 14 m à frente dos olhos com atraso de mão; campo próximo suave e teto (não estoura). A luz 'carried' do LightRig virou só luz rebatida e não acende a névoa.

> Escolhida (2026-09-29).

## Proposta: uma energia só
Uma **célula de energia** que alimenta tudo o que você carrega: a luz, o [[Ferramentas|sensor]] e as outras ferramentas. Um recurso, uma barra — simples de entender.
- Recarrega em **tomadas de setores com energia** ([[Religar-setores]]), e talvez em baterias de máquinas mortas (pouco).
- **Sem luz você ainda anda** — só enxerga o que a Cidade ilumina. Nada de morte por escuro.
- Setores apagados viram travessias tensas; setores religados, abrigo.

## Futuro
Com os Safeguards, a luz e o uso de energia podem **chamar atenção** ([[NPCs-e-Safeguards]]) — um dilema natural: enxergar ou passar despercebido.
