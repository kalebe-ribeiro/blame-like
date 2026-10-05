# 06 — Render e desempenho

## Luzes

16 luzes dinâmicas (`world/lights.js`): duas fixas acompanham o observador de longe (brasa de sódio 300 m abaixo, clarão frio 450 m acima); as outras 14 são as mais próximas da Cidade. **Não há luz orbitando o corpo** (os fogos-fátuos saíram em 2026-09-29).

## Cadeia de um quadro

1. **Máscara das silhuetas** (meia resolução) — escurece a névoa onde há estruturas distantes (`world/silhouettes.js`).
2. **Reflexo planar** (só perto de água) — `render/reflection.js`.
3. **ScenePass** (`render/pipeline.js`): cena com tremor de TAA → SSAO em meia resolução + blur → **raios/sombras na névoa** em ¼ de resolução para as 4 luzes mais fortes → resolução do TAA (YCoCg, Catmull-Rom) → nitidez.
4. **UnrealBloom** → OutputPass → **Signal** (filme: dessaturação, grão, vinheta — `shaders/post.js`).

Névoa volumétrica, janelas, placas, ferrugem: tudo no shader de superfície (`shaders/materials.js`). Shaders que desenham lotes precisam de `#include <batching_pars_vertex>` / `<batching_vertex>`.

## Ritmo dos quadros (2026-10-04)

- O jogo roda sem o limite de quadros do Chromium (`main.js disable-frame-rate-limit`, por causa da RTX desenhando para a tela da Intel). Sem freio, a CPU enfileirava quadros além da GPU, e o driver a segurava por 200–450 ms de uma vez nas vistas pesadas. Agora há **no máximo 4 quadros em voo**: uma fence do WebGL2 no fim de cada quadro, e o rAF seguinte passa a vez se a GPU ainda estiver neles (`app.js MAX_INFLIGHT`). Pior quadro ≤ 42 ms nos lugares medidos, com a mesma média.
- **fps se mede pelos quadros desenhados** (`ctx.frameHooks`), nunca pelo intervalo do rAF.
- Dois cuidados com o three r170 (ver [[11-Invariantes-e-Armadilhas]]): o getter `BatchedMesh.colorTexture` (`world/batches.js`) e as cópias `soloMaterial` das malhas comuns (`world.js`).

## Lotes (`world/batches.js`)

- Um `MaterialBatch` por material, com **páginas** de `BatchedMesh` de 64k–128k vértices (páginas pequenas: envio grande de buffer trava o Chrome/ANGLE).
- Cada chunk ocupa uma **vaga** com tamanho arredondado (classes de ~25%); vagas livres são reaproveitadas.
- **Compactação**: vagas livres fragmentam; num quadro calmo a página mais esburacada é compactada (`BatchedMesh.optimize()`), e antes de abrir página nova tenta-se compactar. Sem isso as páginas cresciam para sempre (76 → 260, heap 700 → 960 MB).
- **Páginas reserva** são criadas antes de precisar, num quadro sem outros envios (`BatchSet.tick`).
- **`fastLists`** substitui o `onBeforeRender` do three: esferas já no mundo (matrizes só translação), ordem de frente para trás refeita só a cada 8 m, frustum inline, textura de índices só reenviada quando a lista muda, **uma lista e uma textura por câmera** (a do reflexo tem as suas).

## Reflexo (`render/reflection.js`)

Câmera espelhada (quaternion (−x, y, −z, w) em y' = 2L − y), plano near **oblíquo** (Lengyel) em vez de clipping planes (evita recompilar todos os shaders), recorte próprio (projeção normal até 1200 m + a água como piso), meia resolução, sem poeira. A água lê a textura em espaço de tela com v invertido e mistura por Fresnel.

## Números de referência

- Teste de fumaça: 30–120 fps de média conforme o estado do notebook; pior quadro 20–60 ms.
- Listas de desenho: ~1,1 ms de CPU por quadro (eram 3 ms).
- Reflexo: ~5–7 ms de GPU (eram ~10 ms).
- ~140–180 páginas de lote, ~650–750 MB de heap em viagem longa (estável).

## Sobre a máquina do usuário

Notebook híbrido (RTX 4060 + Iris Xe). O Electron usa a **RTX** (`--stats` imprime `gpu=`). No plano de energia **Equilibrado**, a placa fica em ~13 W e 1,1–1,5 GHz (máx 3,1 GHz) — daí o fps variar de 30 a 120 entre execuções idênticas. Para medir, usar **Melhor desempenho** + tomada, e comparar só medidas da mesma sessão.

## Ferramentas de medição

`--stats` imprime a cada 2 s: fps, chunks, fila, lotes (uso, vagas livres, compactações), draw calls, triângulos, heap, tempo de CPU das listas, vagas desenhadas por câmera, e perto da água o tempo de GPU do reflexo (timer query). Ver [[10-Comandos-e-Verificacao]].
