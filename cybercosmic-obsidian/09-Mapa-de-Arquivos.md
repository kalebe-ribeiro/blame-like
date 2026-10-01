# 09 — Mapa de arquivos

```
main.js                     Electron: protocolo app://, janela, flags, fotos, relatório do --check
index.html                  import map do three + overlays (tela de entrada, HUD, painéis)
src/
  app.js                    bootstrap e loop principal (contexto compartilhado ctx)
  app/render.js             renderizador, pós-processamento, reflexo, foto
  app/body.js               o corpo: passos, água, queda, vagões, vibração
  app/sound.js              sons e avisos dos acontecimentos do mundo
  app/travel.js             salvamento, diário e mapa da travessia
  app/ui.js                 tela de entrada, painéis, teclas, teleporte, novo mundo
  app/dev.js                flags de desenvolvimento, --stats
  app/saves.js              perfil global + um mundo salvo por modo (WorldState)
  app/modes.js              modos de jogo e regras (ctx.rules)
  app/player.js             estado do corpo (energia, ferramentas, acesso)
  app/carried.js            aparelho na mão: lanterna, célula de energia, tomadas, sensor
  app/wake.js               queda e despertar
  app/reading.js            ler terminais, leitor portátil, pegar o sensor, reabrir do arquivo
  app/leads.js              as pistas do mundo (abrir, estreitar, alcançar)
  lang/ancient.js           a língua antiga: conceitos, escrita de estêncil, drawTokens
  lang/lexicon.js           o léxico global
  lang/records.js           o que os terminais dizem; sectorCode, levelNumber
  lang/leads.js             pistas: leadFor, leadLine, leadArea, startPlace (o começo do mundo)
  core/events.js            barramento de eventos (world.bus)
  i18n/index.js             t(), idiomas, formatação de números e distâncias
  i18n/en.js, i18n/pt.js    os textos (inglês padrão, português opção)
  dev/check.js              teste de fumaça (npm run check)

  core/rng.js, noise.js     RNG por seed, simplex 3D + fbm
  lib/three.js              ponte do three que funciona dentro dos workers

  gen/hash.js               hash de coordenadas → base de tudo que é infinito
  gen/sites.js              onde há terminais (ids estáveis), sem carregar nada
  gen/field.js              A LEI DO MUNDO (grades, regiões, estruturas, trincheiras, relevo…)
  gen/chunkgen.js           gera um chunk (worker): pilares, passarelas, flutuantes
  gen/network.js            rede andável (plataformas e ligações)
  gen/macrogen.js           megaestruturas + camadas (relevo, trincheiras, passagens) + anomalias
  gen/dressing.js           detalhes das megaestruturas na escala humana
  gen/closed.js             colmeia e maciço (inclusive os ocos: máquinas, depósito, silo)
  gen/human.js              escala humana: assentamentos, entulho, cabos, vestígios
  gen/beams.js              geometria dos feixes de luz
  gen/colors.js             cores das luzes (sódio, fluorescente, frio, alerta, solda)
  gen/cascades.js           cascatas
  gen/floods.js             setores inundados
  gen/transit.js            trilhos e estações dos transportadores

  world/world.js            orquestra streaming, sistemas, materiais e origem flutuante
  world/chunks.js           WorkerPool + ChunkLayer (streaming)
  world/chunkWorker.js      o worker
  world/batches.js          lotes de desenho (páginas, compactação, fastLists)
  world/lights.js           seleção dinâmica das 16 luzes
  world/collision.js        colisão BVH para o modo andar
  world/teleport.js         destinos do transporte (finders por tipo)
  world/elevators.js        elevadores
  world/builders.js         Construtores e cemitérios
  world/transitCars.js      vagões dos transportadores
  world/colossi.js          máquinas colossais
  world/outages.js          apagões de setor
  world/collapses.js        colapsos distantes
  world/terminals.js        terminais (registros na língua antiga; nearest/readable)
  world/inscriptions.js     endereços pintados nas paredes
  world/particles.js        gotas e vapor
  world/silhouettes.js      silhuetas a dezenas de km
  world/geometry.js         merge, cilindro entre pontos, tubo afunilado
  world/cables.js           catenárias e fios de prumo
  world/entities.js         camada de entidades (fase 5): perto com física, longe abstrato
  world/bodies.js           corpos procedurais (o corpo de teste) e a passada
  gen/nav.js                grafo de navegação consultado no Field + A*
  gen/patrols.js            territórios e circuitos de ronda dos Safeguards
  world/safeguards.js       Safeguards: rondas, percepção, caçada, captura, paredes
  gen/villages.js           disposição das vilas; quais são habitadas (fase 7)
  world/npcs.js             moradores, andarilhos, vida de silício (fase 7)
  app/people.js             conversa, trocas, cargas, despertar numa vila (fase 7)
  ui/talk.js                o painel da conversa (navegável pelo controle)
  dev/npctest.js            npm run check:npcs
  app/hands.js              as mãos: segurando o aparelho e a lanterna, agarrando quinas
  dev/climbtest.js          npm run check:climb (quinas)
  app/safeguards.js         Safeguards no jogo: sentidos, barulhos, alerta, sons, desmaio
  dev/sgtest.js             npm run check:safeguards
  app/alert.js              percepção: alerta por setor (fase 5)
  app/beings.js             os seres no mundo salvo; corpo de teste
  dev/beingtest.js          npm run check:beings: corpos de teste atravessando a teia

  render/pipeline.js        ScenePass: SSAO, TAA, raios na névoa
  render/reflection.js      reflexo planar da água
  shaders/chunks.js         GLSL: simplex, fbm, névoa volumétrica
  shaders/materials.js      superfícies, feixes, cascatas, poeira, céu
  shaders/post.js           filme: dessaturação, grão, vinheta

  controls/noclip.js        entrada (teclado, mouse, controle), olhar, andar/voar, piloto
  controls/bindings.js      todos os atalhos (teclado + controle), trocáveis
  controls/walker.js        física de caminhada
  audio/audio.js            áudio procedural
  ui/hud.js                 leitura de instrumento (modo Livre)
  ui/worlds.js              painel MUNDOS (modos de jogo)
  ui/settings.js            configurações (O)
  ui/controlsPanel.js       aba CONTROLES (K)
  ui/padNav.js              menus pelo controle (REGRA: controle independente do teclado)
  dev/padtest.js            npm run check:pad: um controle falso joga sozinho
  preload.js                ponte mínima com o Electron (tela cheia pelo controle)
  ui/transport.js           painel de transporte (T)
  ui/journey.js             diário (os dados ficam no mundo salvo)
  ui/trailmap.js            mapa da travessia (M), com as descobertas
  ui/reader.js              tela de leitura
  ui/archive.js             o diário como arquivo (abas: diário, registros, pistas, léxico)
```
