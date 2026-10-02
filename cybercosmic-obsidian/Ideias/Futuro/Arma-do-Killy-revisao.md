---
status: revisão crítica do plano (2026-10-02)
tags: [futuro, arma, revisao]
---

# Revisão crítica do plano da arma de Killy

Pedido do usuário: revisar [[Arma-do-Killy]] "como um agente completamente diferente", buscando falhas, erros e decisões fracas (ele vai comparar com a análise de outros três agentes). Conferido no código onde dava. Gravidade: **[G]** grave (o plano não fecha sem resolver) · **[M]** média · **[L]** leve.

## 1. O corte de verdade (CSG)

1. **[G] O custo é pago a cada carregamento, não uma vez.** O plano refaz o chunk aplicando os cilindros na geração. Toda vez que o chunk entra em alcance (andar pra lá e pra cá, voltar ao lugar), o worker recorta tudo de novo. Com muitos tiros numa área, cada recarga custa (peças × cilindros) recortes — o "~80 ms por chunk" vira segundos num lugar muito atirado, e o carregamento do mundo trava por trás. Falta: guardar o resultado recortado (cache por chunk + lista de cortes, em IndexedDB) ou fundir os cilindros de uma peça num só pincel.
2. **[G] O teste de viabilidade não conferiu o que importa.** O `tools/csg-spike.mjs` só verificou (a) exceções e (b) triângulos que sobraram DENTRO do cilindro. Não verificou se o CSG **apagou geometria de FORA** do cilindro (peças abertas ou não-manifold — dutos `open: true`, planos, guarda-corpos, partes das fachadas — costumam sumir inteiras ou ganhar buracos). "0 falhas" não prova que o resultado está certo. Falta comparar a área fora do cilindro antes × depois.
3. **[G] Os números de tempo não servem para decidir.** Medidos com a máquina ocupada (mesmo cenário deu 1 s e 3 s), em 11 chunks, com feixes ao acaso; um caso de peça levou 1,3 s. Não há p95, não há o custo de um TIRO inteiro (400 m cruzam 3–6 chunks + macro), nem a disputa com o streaming (os mesmos 2–6 workers geram o mundo: atirar enquanto se anda atrasa o chão chegando).
4. **[G] O furo demora a aparecer.** "A malha velha fica até a nova chegar" = por 0,1–0,5 s (ou mais, ver 3) o feixe atravessa paredes ainda inteiras; o feixe visível (~0,4 s) some antes do furo existir; um ser morto atrás da parede cai "dentro" dela. Contradição: a primeira versão foi retirada por parecer bugada, e esta tem um atraso visível em todo tiro. Falta um plano para esse intervalo (esconder com o clarão/poeira, ou um corte provisório só visual até a malha chegar).
5. **[G] "Nada flutua" (regra do projeto) é quebrado pelo próprio corte.** Cortar um pilar, a perna de uma torre, o cabo de uma ponte suspensa, o trilho do vagão, o poço do elevador deixa a parte de cima no ar — e os vagões/elevadores seguem andando sobre trilho cortado. O plano não decide nada sobre consequência estrutural (aceitar a megaestrutura autoportante? impedir cortar o que sustenta? desabar?).
6. **[G] O resto do mundo não sabe do corte.** Luzes com luminária (regra: toda luz tem fonte) ficam acesas no ar se a luminária for cortada; o mesmo para gotas/vapor, tomadas, terminais, inscrições, degraus de escada, placas. O grafo de navegação (`gen/nav.js`) é tirado do Field e **não vê o corte**: moradores, andarilhos e rondas andam para dentro do buraco e caem, ou as rondas abstratas "atravessam" o vão. Também as pontes até os elevadores e as escadas usadas pelos seres. Nada disso está no plano.
7. **[M] Os LOD "podem ficar sem o furo".** Um feixe de 400 m passa da faixa do LOD: de longe o furo some e "pula" para existir ao se aproximar. Decisão fraca para a parte mais vistosa do tiro (o túnel comprido).
8. **[M] Como saber o que não pode ser cortado.** As estruturas únicas usam os mesmos materiais (`wall`, `frame`…) — só a caixa delas as protege; e dentro da caixa das vilas (que são únicas) não se corta nada (casas, varais): regra estranha para o jogador e não registrada.
9. **[M] Os lotes de desenho.** As peças cortadas crescem ~2,6× em triângulos; refazer um chunk maior que a vaga dele na página do `BatchedMesh` força realocar (travadas) — não previsto.
10. **[M] Toques em sequência.** Um toque custa ~3% → ~33 tiros por célula, cada um um cilindro novo de 0,4 m: chuva de cilindros pequenos (triângulos, memória, recortes a cada carga — ver 1). Falta um limite (tempo mínimo de carga, intervalo, teto de cortes por área).
11. **[L] Versão presa.** `three-bvh-csg` 0.0.17 porque a 0.0.18 pede three ≥ 0.179: atualizar o three um dia obriga a trocar tudo junto. E vai precisar de outra cópia "vendorizada" para o worker (com a `three-mesh-bvh` da mesma versão).
12. **[L] Salvamentos antigos.** A versão retirada gravava `slot.holes`; mundos salvos daquela época ainda podem ter esses cilindros — voltar a arma os aplicaria (decidir: ignorar ou converter).

## 2. A carga (potência pelo tempo)

13. **[G] O controle não tem botão sobrando.** Hoje: 0 pulo, 1 descer, 2 voar/lanterna, 3 usar, 4 marcar, 5 foto, 6 correr, 7 lanterna do Livre, 8 mapa, 9 menu, 11 inventário, 12 piloto, 13 sensor, 14 tela cheia, 15 HUD — **livre só o 10 (R3)**. O plano diz "atirar no RT" (o 7, que é a lanterna do Livre) e "cancelar: definir depois". Da versão retirada, a lanterna foi para o 13 — que hoje é o **sensor**. A REGRA do controle é absoluta: o mapeamento tem de estar decidido no plano.
14. **[G] Estados durante a carga não estão definidos.** O que acontece carregando quando: abre o inventário/conversa/menu, desmaia, é agarrado pelo Safeguard, agarra uma quina (as duas mãos), sobe escada, troca a ferramenta da mão, a célula acaba, o mundo é trocado? Solta e atira por acidente? Cancela? Sem isso vem tiro sem querer.
15. **[M] A curva e os números estão soltos.** `k = 1 − (1 − t/T)²` com `T ≈ 2,5 s`, toque ≈ 0: quanto é "um toque" (100 ms? 200?) — define se o toque é um tiro de verdade; mínimo de carga para disparar; o que é mostrado ao jogador do quanto está carregado (só as bobinas? no escuro se veem?).
16. **[M] "Anda devagar carregando" contra o jogo, que é de fuga.** Pode ser o certo (compromisso), mas é decisão de jogo, não técnica — precisa da confirmação do usuário.
17. **[L] "5 tiros na carga cheia" é frágil.** 5 × 19% = 95% só com a célula cheia e nada mais gastando (a lanterna drena enquanto carrega); deveria ser dito "com a lanterna apagada" ou o gasto recalculado.

## 3. Os efeitos

18. **[G] A lente na boca da arma, em primeira pessoa.** A boca está no canto de baixo da tela, colada à câmera: distorção radial ali deforma a própria arma e as mãos, e enjoa; e o passe de distorção conflita com o **TAA** do pipeline (`render/pipeline.js`: histórico reprojetado — distorcer antes borra/fantasma, distorcer depois não entra no TAA). O plano não diz onde o passe entra.
19. **[M] "As partículas que já existem" é otimista.** A poeira é um campo animado no shader (`createDust`, posição em função da câmera) — puxar para a boca exige um atrator no shader; os detritos "com física simples" não existem (sem motor de física; cada detrito com raios de colisão custa) e precisam obedecer "nada flutua".
20. **[M] Luzes ao longo do feixe.** O sistema tem **16** luzes por quadro (`LIGHT_COUNT`): o clarão com várias luzes rouba as vagas das luminárias de verdade — as lâmpadas em volta piscam/apagam no tiro.
21. **[M] Bordas em brasa.** Os lotes empacotam a geometria por material (normais em int8) — um atributo novo de "tempo do tiro" em todos os materiais custa memória e muda todos os shaders; a alternativa (um material próprio "corte" para as faces novas, lendo os tiros recentes) não foi escolhida.
22. **[M] "Empurrar a névoa".** A névoa é analítica (`applyFog`): uma onda de choque nela é um modo novo de névoa, não "usar o que existe".
23. **[M] Sem orçamento.** "Não derrubar o fps mais que um instante" não é critério: faltam números (ms por quadro carregando; pico no disparo; quantos efeitos simultâneos).
24. **[L] Fidelidade ao *Blame!*.** O plano descreve um "laser" branco com halo; no mangá o que marca o emissor é a linha fina + a **explosão retardada** gigante e o túnel perfeitamente reto até onde a vista alcança. O atraso do colapso está no som, mas não no visual.

## 4. Processo

25. **[G] A ordem não ataca o risco primeiro.** O plano começa pela jogabilidade e deixa para depois justamente o que pode inviabilizar (custo do recarregamento, furo atrasado, mundo que não sabe do corte, nada flutua). Deveria haver um protótipo de ponta a ponta mínimo (um tiro → chunks refeitos → furo na tela → seres e luzes coerentes → medir) antes de efeitos.
26. **[M] Testes insuficientes.** O `check:beam` planejado confere a geometria, mas não: geometria apagada indevidamente, desempenho (tiro e recarga de área muito atirada), luzes sem luminária, nada flutuando, o grafo evitando o buraco, salvar/recarregar o mundo cortado.
27. **[L] A nota do cofre se contradiz.** Abaixo do plano novo ainda está "Decidido (2026-09-30): método de shader… Nada de CSG" e a tabela de dificuldade antiga — quem ler de cima a baixo encontra duas decisões opostas.

## O que eu mudaria antes de implementar

1. Decidir as **regras de mundo**: o que pode ser cortado (e o que sustenta), o que acontece com o que fica solto, luzes/objetos presos ao que foi cortado, e que o grafo dos seres passa a evitar os cortes.
2. **Protótipo de risco** primeiro (sem efeitos): tiro → corte → recarga com cache → furo na tela; medir em máquina livre: p95 do tiro, recarga de um lugar com 50 cortes, disputa com o streaming; conferir área fora do cilindro preservada.
3. Fechar o **mapeamento do controle** (o 10 é o único livre) e os **estados** da carga.
4. Só então os efeitos, com orçamento em ms e decisão de onde a distorção entra no pipeline (antes/depois do TAA).
