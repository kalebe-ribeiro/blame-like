---
status: implementado (2026-10-01)
tags: [seres, npcs, safeguards, movimento]
---

# Os seres se movem como o jogador

Pedido do usuário (resposta às escolhas da fase 5, [[13-Decisoes]]): *"devem andar também em escadas de marinheiro, elevadores, vagões. Toda movimentação que o player conseguir fazer, os NPCs também devem poder."*

Os seres já usavam o **mesmo Walker** do jogador (`controls/walker.js`) e a mesma colisão — que inclui os carros dos elevadores e os vagões (quem pisa neles é carregado pelo `userData.dx/dy/dz`). Faltava a **decisão**: esperar, embarcar, descer no lugar certo, montar na escada. Em `world/entities.js`:

| movimento | quando | como |
|---|---|---|
| **vagão** | o caminho tem uma perna `ride` (o A* a escolhe: uma viagem custa 260 "m" contra 1440 a pé) | espera na passarela diante da estação → o vagão parado com ≥ 6 s de espera → entra pela porta → fica parado dentro → na estação de destino desce até a passarela. Até 3 estações de uma vez, só no sentido da linha |
| **elevador** | um alvo (`walkToward` — quem caça, quem foge) noutro nível (> 3,5 m), com um elevador a ≤ 60 m cuja ponta está no meu nível e a outra mais perto do alvo | espera ao lado do carro (lados sem guarda-corpo; vindo do lado do guarda-corpo, pela quina do anel), embarca quando ele está parado na minha ponta, desce na outra ponta pelo lado com chão |
| **escada** | idem, com degraus a ≤ 14 m (para subir) ou logo abaixo de uma beirada (para descer) | sobe de frente; no nível do alvo sai pelo lado (num patamar); para descer, vai até um chão junto do alto da escada (atrás dos degraus ou ao lado), monta nela (0,6 s) e desce |
| **quina** | o alvo mais alto, a < 6 m, atrás de uma quina de até 2,25 m | pula, agarra, sobe (o mesmo `_findLedge`/pendurar/subir do jogador) |
| **vão** | andando reto (entrar/sair de um carro) sem chão a 0,9 m e com chão a 1,8–3 m | pula correndo |

- **Sem energia** (setor apagado): elevador com o motor parado > 8 s, ou linha com o relógio parado > 10 s → o ser desiste (o evita por 60 s) e vai por outro caminho (a escada, a pé).
- As **rondas** (Safeguards, andarilhos — `gen/patrols.js`) não usam o vagão: o relógio do mundo as leva pelo circuito, ninguém embarca; e assim os circuitos dos mundos que já existem não mudam.
- `canClimb`/`canGrab` do Walker dos seres ficam desligados e só ligam quando eles decidem usar uma escada/quina (senão um desvio de lado pegaria uma escada sem querer).
- Eventos: `being:board`, `being:ride`, `being:lift`, `being:ladder`, `being:leap`, `being:level`.
- Teste: `npm run check:moves` (`dev/movetest.js`): quina, escada (subir 240 m e descer), elevador (descer 240 m), vagão (1440 m). `--moveonly=quina|escada|elevador|vagao`, `--movetrace=1` (o estado do corpo a cada segundo).

## Defeitos do mundo achados no caminho (valiam para o jogador também)

- **Duto atravessando a escada de manutenção** do elevador grande a 37 m do chão: os dutos da rede não evitavam a torre. Agora evitam a coluna das passagens (`Field.passageColumnHit`).
- **O patamar de cima da escada de manutenção ficava bem em cima de quem sobe** (batia a cabeça embaixo dele, sem saída): agora há uma abertura rente aos degraus e piso dos dois lados — de cima se sai para o lado.
- **Fixações à frente dos degraus** (a cada 12 m): o raio de "estou na escada" batia nelas e o corpo soltava. Já na escada, o Walker confere um palmo abaixo antes de soltar.
- **Descer uma escada longa contava como queda**: o Walker não atualizava a altura "de onde se caiu" na escada; ao pisar embaixo, a queda era medida desde o alto (240 m) — matava os seres e machucaria o jogador. Agora a escada zera a queda.
- **Juntas do tabuleiro**: um raio de chão exatamente sobre a aresta comum de duas peças (o ponto da estação cai em z múltiplo de 12) erra as duas, e o corpo caía. O chão agora é procurado também em 4 pontos em volta do centro, dentro do corpo.
