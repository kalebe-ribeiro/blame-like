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
- **O caso frio de 50 cortes**: um chunk que já tem ~50 cortes, atirado numa sessão nova (o worker sem a memória das peças), leva até ~6,5 s no worker (o limite do §8 é 2 s; tiro a tiro, o caso normal, o pior é 0,75 s). Ideias: guardar o resultado por peça também no IndexedDB, ou subtrair em grupos menores.
- **O primeiro tiro da sessão**: +11 ms no quadro do disparo (os seguintes +3–4,4; limite 8) — o código do corte ainda frio.
- **O túnel visto de longe** (LOD): os chunks de longe são refeitos com o corte e o material `cut` deles é compilado de antemão — mas não conferido em captura.
- **A lente no escuro**: a distorção carregando quase não aparece onde não há luz perto da mira.
- **`check:pad` intermitente**: uma falha no foco inicial (2026-10-02), sem causa achada; passou nas rodadas seguintes. (A falha da tela cheia de 2026-10-03 não era isto: era o teste — ver Arma-do-Killy, F4.)

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
