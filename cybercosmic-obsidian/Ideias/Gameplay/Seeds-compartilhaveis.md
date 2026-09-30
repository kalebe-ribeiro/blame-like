---
status: feita (fase 4.4)
prioridade: baixa
tags: [gameplay, social]
---

# Seeds compartilháveis

> **Feita na fase 4.4** (`app/share.js`, painel MUNDOS): código `CYC1.` + base64url de `{ s: seed, m: modo, k: marcas }`. COPIAR CÓDIGO / COLAR CÓDIGO (área de transferência pelo Electron: `preload.js` → `ipcMain` `clipboard:*`). **Decidido por padrão (a confirmar): só o mundo cru + as marcas** — sem setores religados, pistas nem léxico. Marcas importadas ficam em ferrugem. 400 marcas ≈ 22 KB de código. O "ponto de partida" não vai: o começo já é determinístico pela seed.

> Escolhida (2026-09-29).

Um código com a seed (e, opcionalmente, suas [[Marcas-do-jogador|marcas]] e o ponto de partida) para outra pessoa atravessar o mesmo mundo. O mundo já é 100% determinístico pela seed.

Em aberto: compartilhar também o **estado** (setores religados, pistas)? Ou só o mundo cru?
