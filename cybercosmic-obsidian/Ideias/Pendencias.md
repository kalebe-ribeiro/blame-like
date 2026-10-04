---
status: pendente
prioridade: alta
tags: [pendencias]
---

# Pendências (mudanças já decididas, ainda não feitas no código)

Registradas em 2026-09-29.

## Em aberto (2026-10-02)

### Arma de Killy — o que falta para fechar a F4 ([[Ideias/Futuro/Arma-do-Killy]])
- ✔ **A porta da F4** (2026-10-03): todos os checks verdes — ver [[Ideias/Futuro/Arma-do-Killy]] (Andamento F4).
- ✔ (2026-10-03) As pendências da arma — ver [[Ideias/Futuro/Arma-do-Killy]] (Andamento, "Pendências fechadas"): o caso frio de 50 cortes (memória das peças no IndexedDB), o primeiro tiro (corte a seco no aquecimento), o túnel de longe (a brasa nos chunks de longe; conferido em números — sem imagem), a lente no escuro (a luz das bobinas), o `check:pad` intermitente (o teste insiste no foco).
- ✔ (2026-10-03) **Todas as pendências da arma resolvidas** antes da barra de vida (pedido do usuário): os checks depois das mudanças no corpo e nos menus (todos verdes: `check` 31/31 a 114 fps, `check:pilgrimage` 31/31, `check:pad` 31 + 30, `check:beings` 5/5, `check:climb` 8/8, `check:moves` 6/6, `check:beam` 22/22, `check:safeguards` 9/9, `check:npcs` 10/10), o carregamento enquanto se atira (`streaming`), a memória de vídeo (`lotes`), o aviso do código de mundo, o disparo nos estágios 5–7 (≤ +6,7 ms), o túnel de longe em imagem (de dentro), e o teto de 64 fps (o Chromium no relógio de 60 Hz com a RTX desenhando — `disable-frame-rate-limit`).
- **Barra de vida** — **decidida** (2026-10-03, V1–V7 + o golpe com arremesso + quedas com dano): [[Ideias/Futuro/Barra-de-vida]] — a implementar (a próxima).
- **Rework gráfico** — depois de toda a gameplay: [[Ideias/Futuro/Rework-grafico]].
- **Em observação**: numa rodada do `profile --profshot` (a primeira na RTX, depois da troca de GPU) dois quadros de ~1,9 s no desenho, ~2 s depois do tiro; não se repetiram em duas rodadas seguintes. Hipótese: o cache de shaders do Chromium montado para a Intel. Se voltar, o `profile` agora lista os programas de shader novos de cada tiro.

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
