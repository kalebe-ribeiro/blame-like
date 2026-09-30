---
status: feita (fase 4.2)
prioridade: média
tags: [gameplay, mundo, movimento]
---

# Subir nas máquinas colossais

> **Feita na fase 4.2** (`hatch`/`hatchAt`/`hatchesNear` em `gen/field.js`, `buildHatch` em `gen/macrogen.js`, casco com colisão e deslocamento em `world/colossi.js`, terminal `hatch` em `gen/sites.js`): escotilha = placa da laje que falta (80 m) a cada ~1,3 km de trincheira; passarela + escada de ~34 m + plataforma na altura das longarinas (`COLOSSUS.deck` = 38 m acima do fundo da camada), a 0,4 m de onde a máquina passa. Terminal na borda com o horário vivo (`ColossusSystem.nextAt`). Máquinas: espaçamento 2600, 75%, 4 m/s. As longarinas são o convés; quem está em cima vai junto (mesmo mecanismo dos vagões: `userData.dx/dz`). Testado: 29,8 m em 8 s com a máquina a 32. Não feito: "plataformas de embarque ao longo" além das escotilhas; pistas para trincheiras/horários.

> Escolhida (2026-09-29).

Pegar carona nos pórticos de 260 m que se arrastam nas trincheiras sob as camadas (`world/colossi.js`).

- **Como embarcar**: escotilhas e escadas de manutenção que descem do topo da camada até a trincheira, e plataformas de embarque ao longo dela. (O acoplador não foi escolhido.)
- **Horário**: as máquinas têm posição determinística — os [[Terminais-com-conteudo|terminais]] podem mostrar quando a próxima passa.
- **No modo Peregrinação** (sem teletransporte) viram **transporte de longa distância**: lento, silencioso, pendurado no teto por quilômetros.
- O corpo já sabe ser carregado (vagões, elevadores); a máquina precisa de colisão e de um convés andável.
