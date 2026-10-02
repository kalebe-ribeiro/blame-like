---
status: pendente
prioridade: alta
tags: [pendencias]
---

# Pendências (mudanças já decididas, ainda não feitas no código)

Registradas em 2026-09-29.

## Em aberto (2026-10-01) — depois da arma e dos movimentos dos seres

1. **Elevadores e escadas só de perto**: o grafo de navegação tem os vagões, mas não os elevadores nem as escadas. Quem persegue ou foge (`walkToward`) usa um elevador a até 60 m ou uma escada a até 14 m; uma viagem longa planejada (um morador, um andarilho indo a outra vila) ainda não troca de camada por eles. Pôr elevadores/escadas no grafo pede achar as escadas de fachada pela lei do mundo (hoje só a geometria sabe onde estão).
2. **Safeguard subindo atrás do jogador** por escada/elevador: usa o mesmo `walkToward` que o `check:moves` testa, mas não tem um teste próprio (no `check:safeguards`).
3. **Arma — onde o furo ainda não chega**: só os shaders das superfícies descartam o buraco. Não verifiquei o reflexo da água, as silhuetas colossais, o LOD distante nem a oclusão de ambiente. O lado de dentro das peças agora aparece como corte (2026-10-01). No shader, 12 buracos por vez (os mais perto); elevadores e vagões não são furados.
4. **Escolhas por padrão a confirmar** (arma): o emissor existe nos dois modos (no Livre não gasta); atalhos Q / clique (atirar) e B / roda (potência); no controle RT (7) e R3 (10) — a lanterna do Livre foi do botão 7 para o 13 (↓).
5. **Cofre**: `Copiar-glifos.md` apagado e `.obsidian/` (grafo, área de trabalho) mudados fora das minhas tarefas — deixados sem commit.

## ✔ Feitas na fase 0 (2026-09-29)

### Tirar todo o caráter alienígena
- HUD "interface alienígena" (`ui/hud.js`): mensagens, nome, tom.
- **Glifos alienígenas** (`ui/glyphs.js`): na tela de entrada, no HUD, no mapa.
- Mensagens do tipo "tradução 34% · o resto é fome", "CARNE/CÓDIGO…", "THE SIGNAL IS NOT FOR YOU" — revisar todas à luz de [[14-Universo-Blame]].
- README (seções "Direção de arte", "interface alienígena").
- Substituir pela **língua antiga humana** ([[Traducao-como-progresso]]).

### Inglês como idioma padrão
- Toda a interface (tela de entrada, configurações, transporte, diário, mapa, HUD) em inglês.
- **Português continua como opção de idioma** (decidido 2026-09-29) → precisa de um sistema de idiomas (textos fora do código, um arquivo por idioma).
- Nomes da obra em todo lugar: Safeguard, Netsphere/Netsfera, Authority/Autoridade, Builders/Construtores, net terminal gene.

## Ainda pendente

(nada — os materiais sem uso `organic`/`anomaly`, `buildTendril` e `lsystem.js` foram apagados em 2026-09-30)
