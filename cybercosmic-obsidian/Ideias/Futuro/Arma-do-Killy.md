---
status: em andamento — plano v3 (2026-10-02); C1–C4 confirmadas; fase F1 (protótipo de risco)
prioridade: próxima
tags: [futuro, arma, safeguards, terreno]
---

# A arma do Killy — emissor de feixe gravitacional (plano v3)

> Plano reescrito depois da [[Arma-do-Killy-revisao|revisão crítica]] (27 falhas). Cada falha está marcada **(R n)** onde é resolvida. A primeira versão (buracos por shader) foi feita e retirada; o histórico está no fim.

## 0. Requisitos (do usuário)

- Não atravessa **camada intransponível** nem **estrutura única**.
- **Potência pelo tempo segurando o gatilho**, sem níveis: alcance, raio do feixe e gasto crescem juntos.
- **≥ 5 tiros com carga cheia** com a célula cheia.
- Furo **de verdade** e **efeitos dramáticos** coerentes com um feixe **gravitacional**.

## 1. Decisões de jogo — **confirmadas pelo usuário em 2026-10-02**

| # | proposta | por quê |
|---|---|---|
| C1 | **A megaestrutura é ancorada**: o corte não derruba estruturas; o que fica solto de verdade (fragmentos sem contato) cai como detrito (ver §3.4) | derrubar estruturas é outro jogo (física de colapso); "nada flutua" fica garantido pelo detrito |
| C2 | **Carregando, anda a 60%**, sem correr nem pular | compromisso: carregar é se expor — num jogo de fuga, escolher atirar custa |
| C3 | **Dentro das estruturas únicas nada é cortado** (paredes E conteúdo: casas das vilas, consoles) — o feixe mata o que atravessa, mas não fura | as únicas são o "sagrado" do mapa (pistas, terminais, vilas) |
| C4 | **Controle**: RT (7) atira; **segurando RT, o LT (6) cancela** a carga (correr está desligado enquanto carrega, então o LT fica livre); a lanterna do modo Livre vai do 7 para o **R3 (10)**, o único botão livre. Teclado: **Q ou clique esquerdo** atira; **clique direito ou Shift** cancela | **(R 13)** — o controle só tem o 10 livre; o 13 é o sensor |

## 2. Ordem de trabalho — o risco primeiro **(R 25)**

| fase | o quê | portão para seguir |
|---|---|---|
| **F0** | regras do mundo (§3), testes novos vazios (§9), limpar esta nota | — |
| **F1 — protótipo de risco** (sem efeitos, sem carga: um tiro "cheio" por tecla de dev) | corte na geração com proteção por marca, cache, ordem de refazer, grafo/luzes/objetos sabendo do corte, fragmentos soltos → detrito | **medições do §8 dentro do orçamento**, geometria fora do furo preservada, `check:beam` (parte F1) verde. Se não passar: parar e decidir com o usuário |
| **F2 — jogo** | emissor na mão, carga, estados, controle, gasto, morte, alerta, som básico | `check:beam` (F2) e `check:pad` verdes |
| **F3 — efeitos** | §7, cada um com orçamento medido | `npm run profile` caso `tiro` dentro do §8 |
| **F4 — acabamento** | salvamento, migração, LOD, testes de recarga | todos os checks |

## 3. Regras do mundo

### 3.1 O que nunca é cortado — por MARCA, não por caixa **(R 8)**
A geração marca as peças protegidas na hora de criá-las (`B.protect(true)` … `B.protect(false)` em volta): as **lajes das camadas**, a **casca e o conteúdo das estruturas únicas** (C3), e a **torre da passagem** (pilares e cabeçote do elevador grande — sem eles a travessia entre camadas morre). O CSG pula as peças marcadas. O feixe continua parando nas camadas e nas únicas pela conta analítica (`beamReach`, da versão retirada).

### 3.2 A estrutura (C1) **(R 5)**
- Peças cortadas no meio continuam presas aos vizinhos (vigas viram balanços) — a Cidade é superdimensionada.
- **Fragmentos soltos**: depois do CSG, cada peça vira componentes conexos; um componente que não toca nenhuma outra peça (caixa expandida 5 cm) e é menor que 8 m³ **sai da malha e vira detrito** (§7) — nada flutua.
- **Trilho do vagão cortado**: a linha para no trecho (como num apagão — o relógio da linha para) e um vagão não entra num trecho cortado; **cabos/guia de um elevador cortados**: o elevador para de vez (como sem energia) — os seres já sabem desistir de elevador/vagão parado.
- **Escadas de marinheiro**: os degraus cortados somem; o Walker já para onde a escada acaba.

### 3.3 O que estava preso ao que foi cortado **(R 6)**
Como o chunk é **refeito** com os cortes, o que nasce na geração já sai certo: `B.lamp` não cria a luminária (nem a luz) se a fixação cai num corte; o mesmo para gotas/vapor (`B.emit`), tomadas (`B.socket`). Fora da geração:
- **Terminais, inscrições, obras dos Construtores, subestações**: consultam `Field.cutAt(x, y, z)` ao montar e somem/apagam se cortados.
- **Grafo dos seres** (`gen/nav.js`): uma aresta cujo caminho passa a < r + 0,5 m do eixo de um corte é **inválida**; uma plataforma com o ponto de pé dentro de um corte sai do grafo; as pontes até os elevadores e as escadas idem. Rondas e andarilhos: o circuito memorizado do território é refeito quando um corte o toca.
- **Field compartilhado**: os cortes (lista GLOBAL) vão para o Field do jogo e de cada worker (`Field.setCuts`) — a mesma regra nos dois lados.

### 3.4 Limites **(R 10)**
- Carga mínima para disparar: **0,25 s** (antes disso, um estalo seco — sem tiro, sem gasto).
- Intervalo entre tiros: **0,8 s**.
- Raio mínimo do corte: **0,6 m** (um toque fura algo que um corpo atravessa abaixado? não — passa só um braço; é um tiro de "teste").

## 4. O corte (CSG)

### 4.1 Onde
`three-bvh-csg` **0.0.17** (a 0.0.18 pede three ≥ 0.179 — **(R 11)** ao subir o three, sobe junto; anotado em [[11-Invariantes-e-Armadilhas]]) no worker, por uma cópia gerada como a da `three-mesh-bvh` (`tools/vendor.mjs` generalizado para as duas, mesma versão de `three-mesh-bvh`).

### 4.2 Peça por peça, com conferência **(R 2)**
- Em `ChunkBuilder.add`, uma peça não protegida que algum corte do chunk cruza (pré-filtro: esfera da peça × segmento do corte) é recortada por **todos** os cortes que a cruzam, numa passada (os cilindros juntos num pincel).
- **Peças fechadas** (caixas, cilindros fechados — a geração marca `closed`): CSG completo, com as faces do corte.
- **Peças abertas** (`open: true`, planos, fitas): **sem CSG** — só se removem os triângulos dentro do cilindro e se partem os da borda (recorte de triângulo por cilindro). Nunca some nada de fora.
- **Conferência obrigatória no protótipo** (o `csg-spike` v2): para cada peça, a área FORA do cilindro antes × depois tem de bater (± 0,5%); nada dentro; faces novas só sobre a superfície do cilindro.

### 4.3 Cache — o custo não se repete **(R 1)**
- A saída de um chunk cortado (as malhas por material, já fundidas, com a árvore de colisão serializada) vai para o **IndexedDB**, com a chave `seed · camada · nível · chunk · hash(lista de cortes do chunk)`.
- Carregar um chunk: se a chave bate, **nada de CSG** — só ler. Atirar: só os chunks que o corte novo cruza mudam de chave.
- Teto de segurança: 64 cortes por chunk (com os limites do §3.4, inatingível jogando; se atingido, o emissor engasga ali — aviso no aparelho).

### 4.4 Ordem de refazer e a disputa com o streaming **(R 3)**
- Os chunks cruzados são pedidos **do mais perto para o mais longe** (o mesmo sentido da detonação, §7.2).
- No máximo **1 worker** de cada vez fica com cortes (os outros continuam gerando o mundo); prioridade acima dos chunks novos.
- **LOD** **(R 7)**: os chunks de longe (LOD1/LOD2) cruzados também são refeitos (peças mais simples, mais baratos), por último; o túnel aparece de longe.

### 4.5 Os lotes de desenho **(R 9)**
Um chunk com cortes cresce (~2,6× nas peças cortadas). Ao refazer, se não couber na vaga, ele vai para uma página nova com folga de 50% em vez de realocar a página inteira (medir no protótipo).

### 4.6 O intervalo até o furo aparecer **(R 4)**
- **Sem buraco de shader provisório** (é a classe de bug que tirou a primeira versão).
- O atraso é **escondido pela própria física do feixe** (§7.2, fiel ao *Blame!*): o tiro é uma linha fina e instantânea; a **detonação** (o clarão, a poeira, a onda) corre pela linha do mais perto ao mais longe a ~1500 m/s e **o furo aparece com ela**. Orçamento: o furo perto em ≤ 300 ms (p95) — a detonação perto acontece entre 50 e 300 ms.
- Durante esse tempo a colisão ainda é a antiga (por 0,3 s ninguém atravessa a parede ainda inteira — certo); um ser atingido morre na hora, e o corpo só cai quando a malha nova chega (a poeira cobre).

### 4.7 Salvamentos **(R 12)**
- Os cortes ficam em `slot.cuts` (nome novo). O `slot.holes` da versão retirada é **ignorado** (e apagado ao salvar).
- Compartilhar a seed (código) **não** leva os cortes — anotar.

## 5. O jogo

### 5.1 O emissor
Uma ferramenta do inventário, na mão pela regra das mãos (da versão retirada: `git show 458d019:src/app/beam.js` — o modelo, o encaixe na mão, `beamReach`, a morte do que está no caminho, o alerta e os Safeguards ouvindo). Nos dois modos; no Livre não gasta.

### 5.2 A carga **(R 15, 17)**
- `t` = tempo segurando. Abaixo de 0,25 s: não atira. Acima: `u = (t − 0,25) / 2,25` (0..1, até 2,5 s), `k = 1 − (1 − u)²`.
- Tudo contínuo com `k`: alcance 30 → 400 m · raio 0,6 → 2,8 m · gasto 3 → **18%** · coice, tremor, alerta.
- **5 tiros cheios** = 90% da célula — sobram 10% para a lanterna acesa durante as 5 cargas (≈ 12 s ≈ 1%).
- Segurar além do cheio mantém a carga (sem gastar mais). Se a célula não tem o bastante, a carga para onde ela alcança (o aparelho avisa).
- **Como o jogador sabe**: as 5 bobinas acendem em sequência (emissivas — visíveis no escuro), o zumbido sobe de altura, a vibração do controle sobe; o aparelho mostra o gasto que o tiro terá.

### 5.3 Estados durante a carga — o que cancela (sem tiro, sem gasto) **(R 14)**
Abrir qualquer painel (inventário, conversa, mapa, menu, transporte), desmaio/captura, agarrar quina / pendurar / subir quina, montar ou subir escada, a mão trocar de ferramenta, a célula zerar, morrer, trocar de mundo. **Soltar o gatilho depois de um cancelamento não atira** (precisa soltar e apertar de novo). Carregar no ar é permitido.

### 5.4 Movimento (C2) **(R 16)** · Controle (C4) **(R 13)**
Ver §1.

## 6. Testes **(R 26)** — `check:beam`
| caso | o que confere |
|---|---|
| geometria fora | a área fora do furo preservada (peça por peça) — nada some indevidamente |
| furo | o raio de colisão atravessa; a parede do corte existe (raio de dentro para o lado bate a ~r) |
| protegidos | camadas, únicas e a torre da passagem inteiras |
| solto | nenhum fragmento sem contato na malha (viraram detrito) |
| luzes | nenhuma luz cuja fixação está num corte |
| grafo | um ser com destino do outro lado de uma ponte cortada não pisa no vão (outro caminho ou "sem caminho") |
| vagão/elevador | trilho cortado: a linha para antes; cabo cortado: o elevador para |
| salvar/recarregar | os cortes voltam; a recarga lê do cache (0 CSG) |
| carga | 0,2 s não atira; 1 s → k esperado; 2,5 s → cheio; 5 tiros cheios por célula |
| estados | cada cancelamento do §5.3 |
| desempenho | os números do §8 (no `npm run profile`, lugar `tiro`) |
+ `check:pad` (o mapeamento C4 pelo controle).

## 7. Os efeitos — feixe gravitacional

### 7.1 Princípios
- O emissor **dobra o espaço**: carregar puxa o mundo para a frente da arma; o tiro é uma linha; o colapso vem depois, correndo pela linha.
- Direção de arte ([[02-Direcao-de-Arte]]): branco e quente, distorção, poeira, metal em brasa; sem neon, nada mágico; toda luz tem fonte (a arma, o feixe, o metal quente).

### 7.2 Fidelidade ao *Blame!* **(R 24)**
No mangá, o que marca o emissor é a **linha fina** e a **detonação retardada** gigante, deixando um túnel reto até onde a vista alcança. Então: o tiro é um **traço fino e branco** (não um "laser" gordo), instantâneo; a **detonação** corre pela linha (≈ 1500 m/s), com clarão, onda de choque e o furo aparecendo junto (§4.6).

### 7.3 Carregando
- **Lente gravitacional** **(R 18)**: um ponto de atração 2–3 m à frente da arma, na mira (perto do centro da tela, não no canto onde fica a boca). Passe de distorção **depois do TAA** (não entra no histórico — sem fantasmas), com **máscara de profundidade**: nada a menos de 1,2 m do olho é distorcido (as mãos e a arma ficam limpas). Força máxima limitada + opção nas configurações ("distorções") para quem enjoa.
- **A poeira puxada** **(R 19)**: o shader da poeira (`createDust`, já recebe `uCam`) ganha um atrator (posição + força): as partículas perto escorrem para o ponto.
- **A arma**: as bobinas acendem, a mão treme, tremor leve da câmera, vibração subindo.
- **Som**: zumbido grave subindo, ar sendo sugado, estalos.

### 7.4 O disparo
- **O traço**: núcleo fino quase cegante + halo estreito, ~0,15 s; ao longo dele, a distorção em linha por um instante.
- **A luz do tiro sem roubar luminárias** **(R 20)**: uma **luz-linha** própria no shader das superfícies (2 uniforms: o segmento e a intensidade) — ilumina o corredor pelo caminho do feixe sem usar nenhuma das 16 vagas de luz.
- **A detonação** (correndo pela linha): um clarão curto em cada ponto; **a onda de choque como malha transitória** **(R 22)** — anéis de poeira translúcida que se expandem a partir da linha (não mexe na conta da névoa); sucção rápida antes (a poeira entra).
- **Coice**: câmera empurrada para trás/cima conforme `k`; na carga cheia, o corpo recua um passo.
- **Som com atraso**: o estalo na hora; o estrondo de cada trecho chega pela distância (340 m/s); rangidos depois.

### 7.5 Depois
- **Bordas em brasa** **(R 21)**: as faces criadas pelo corte (o grupo do cilindro no CSG) vão para um **material próprio `cut`** (um lote só dele): o shader lê os últimos 8 cortes (eixo, raio, instante — uniforms) e brilha laranja → vermelho → metal escuro em ~15 s conforme o tempo do corte mais perto. Nenhum atributo novo nos outros materiais. Enquanto quente, emissivo (é a própria fonte da luz).
- **Detritos** **(R 19, 5)**: os fragmentos soltos (§3.2) e lascas das bordas como partículas sólidas cinemáticas: no nascimento, **um** raio para baixo acha onde vão pousar (sem raio por quadro); caem com gravidade, quicam uma vez, ficam no chão e somem longe. Faíscas pingando das bordas quentes.
- **Poeira assentando** no túnel por alguns segundos.

## 8. Orçamento (medido com a máquina livre — sem outro Electron) **(R 3, 23)**

| medida | limite |
|---|---|
| furo visível perto (< 100 m), do disparo | p95 ≤ 300 ms |
| tiro inteiro (todos os chunks, LOD incluso) | p95 ≤ 1,5 s |
| tempo de worker por tiro cheio | p95 ≤ 800 ms |
| recarregar um chunk cortado (cache) | 0 CSG; ≤ o de um chunk normal + 10% |
| refazer um chunk com 50 cortes | ≤ 2 s (worker) |
| carregando (efeitos) | ≤ 1 ms CPU · ≤ 1,5 ms GPU por quadro |
| quadro do disparo | ≤ +8 ms na linha principal |
| depois dos efeitos | fps de volta ao de antes em ≤ 3 s |
| streaming enquanto se atira | nenhum chunk do caminho do jogador atrasado > 1 s |

Protocolo: 200 tiros em 8 biomas, `p50/p95/p99`, no `npm run profile` (lugar `tiro`) e num `tools/csg-bench.mjs` (worker isolado).

## Andamento

- **F1.1 — o núcleo do corte** (`src/gen/cut.js`, 2026-10-02): peça fechada → CSG (faces do corte à parte, para a brasa); peça aberta → subdivide perto do furo e tira só os de dentro; peças de várias caixas que se atravessam (a colmeia) deixavam triângulos dentro → limpeza pós-CSG (só de dentro). `tools/csg-spike.mjs` v2, máquina livre, 29 chunks reais, raios 0,6 e 2,8 m: **0 triângulos dentro, 0 peças com a área de fora alterada, 0 falhas**; 0,7 ms por peça (p95 4 ms, máx 57), ~20 ms por chunk (p95 ~105 ms). A biblioteca de corte gerada para os workers (`npm run vendor`).

- **F1.2 — o corte na geração** (2026-10-02): os cortes no Field (`setCuts`, `cutsInBox`, `cutAt` — no jogo e em cada worker, que recebe só os do chunk); `ChunkBuilder.add` recorta as peças (as faces do corte no material `cut`); **protegidas**: a laje das camadas (material), as estruturas únicas inteiras e a torre da passagem (`B.protect`); luminárias, luzes, gotas/vapor e tomadas não nascem num corte; `world.addCut` pede de novo os chunks cruzados (perto, LOD, macro), do mais perto ao mais longe, no máximo um worker cortando; a malha velha sai no mesmo quadro em que a nova entra. `beamReach` virou módulo puro (`gen/beamreach.js`) com a regra das placas da laje. `--cutshot=N` (tiro cheio de desenvolvimento). Captura na colmeia: túnel real — a parede com espessura, a parede interna do túnel, o rasgo no chão. `check` sem cortes: igual (31/31, 100 fps).

- **F1.3 — fragmentos soltos** (2026-10-02): no fim do chunk, o que ficou de cada peça cortada e as faces do corte (juntos — um sólido) são divididos em partes conexas; uma parte < 8 m³ que não encosta em nenhuma outra peça nem na borda do chunk sai da malha e vira detrito (`debris`, cai nos efeitos). Teste `tools/csg-fragments.mjs`: viga entre dois pilares, dois cortes → 1 detrito (o meio); nervura presa à parede → 0 (fica). Dois defeitos achados: (1) **as peças passam da caixa do chunk** (pontes, cabos) — os cortes eram procurados só na caixa e não chegavam a elas; agora o worker devolve os limites reais da geometria e o jogo decide por eles; (2) o pré-filtro é pela esfera da peça: um corte que passa ao lado não muda nada e não pode contar como "cortada" (deixava de servir de apoio).

- **F1.4 — cache, salvamento e quais chunks refazer** (2026-10-02): os cortes vão no salvamento (`slot.cuts`; o `slot.holes` da versão retirada é apagado); `world/cutCache.js` guarda no IndexedDB a saída de cada chunk cortado (chave: semente · camada · nível · chunk · ids dos cortes que o atingem) e um chunk com cortes é pedido primeiro ao cache. **Quais chunks um tiro refaz** — três defeitos achados medindo um tiro de 400 m na colmeia: (1) pela caixa do chunk faltavam peças que passam dela; (2) pelos "limites reais" calculados por esferas vinham 77 chunks (1 com corte de verdade) — a esfera de uma malha que ocupa o chunk é um cubo 1,7× maior; (3) chunks ainda na fila furavam o carregamento com prioridade de corte. Agora o worker devolve as **caixas das peças cortáveis** (uma peça longa vira várias caixas, ~24 m cada) e só se refaz o chunk carregado em que o tiro encosta numa delas; o que está na fila é só pedido de novo com o corte, na prioridade normal. Resultado: **4 chunks refeitos, todos com peças cortadas, 0 macros** (antes 77). E a chave do cache só muda para os chunks que o tiro toca.

- **F1.5 — o mundo sabe dos cortes** (2026-10-02): `Field.cutVer` (sobe a cada `setCuts`) e `Field.cutOnPath(pts)`; o grafo dos seres (`nav.neighbors`) esquece o memorizado quando `cutVer` muda e tira as arestas e os nós que um corte atravessa (o worker dos circuitos recebe os cortes); os corpos com caminho por um corte replanejam (`entities.onCut`); rondas de Safeguard e andarilhos de circuito cortado saem e o varrer refaz; terminais, inscrições, subestações e canteiros não existem num corte; uma linha de vagões com o trilho cortado para (`dark`); um elevador de fachada com o poço cortado fica sem energia (a torre do grande é protegida).

- **F1.6 — `npm run check:beam`** (`src/dev/beamtest.js`): furo (colisão passa, parede do corte a ~r), camada, única, torre, luzes, grafo, vagão, recarregar (cache), tempo (10 tiros, p95 do furo perto e do tiro inteiro contra o §8).
  Dois defeitos achados pelo teste: (1) **o cache falhava ao voltar** — a lista de cortes de um chunk (e a chave) era a precisa depois de chegar (pelas caixas das peças) e a grosseira num carregamento novo (sem as caixas ainda); as caixas não dependem dos cortes, então ficam guardadas (memória + IndexedDB, chave `caixas|…`) e a chave é a mesma sempre; (2) o teste do grafo só procurava pontes `connector` (o vizinho era `deck`).
  **Resultado (2026-10-02): 9/9.** Furo: colisão livre, parede do corte a 2,78 m (r 2,8); 0 de 5382 luzes em cortes; 2/2 chunks do cache ao voltar; ponte de 182 m sai do grafo; linha de vagões parada; pilar da torre intacto. **Tempo, 10 tiros cheios (400 m, r 2,8): furo perto p95 181 ms (≤ 300), tiro inteiro p95 695 ms (≤ 1500).** Regressões: `check` 31/31 (104 fps), `check:safeguards` 9/9, `check:moves` 6/6.

- **Porta da F1: aprovada** — o corte de verdade cabe no orçamento. Próximo: F2 (a jogabilidade: carga, controles C2/C4, cancelar, energia, mortes, alerta, som).

## 9. Histórico da decisão **(R 27)**
- 2026-09-30: discutido; escolhido o método "de shader" (cilindros + `discard` + colisão ignorando).
- 2026-10-01: implementado assim (potência em 5 níveis); bugs: a colisão furava em volta (vetor temporário reaproveitado), peças ocas pelo furo, o corpo sumindo perto do cilindro.
- 2026-10-02: retirado a pedido do usuário ("muito bugado"). Decidido: corte de verdade (CSG). Viabilidade inicial (`tools/csg-spike.mjs`): 0 exceções, nada dentro do furo — mas sem conferir a geometria de fora e com a máquina ocupada (ver a revisão). Potência pela carga e efeitos gravitacionais pedidos pelo usuário. Revisão crítica (27 falhas) → este plano v3.
