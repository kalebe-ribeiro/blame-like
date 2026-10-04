---
status: feita — plano v3; C1–C4 confirmadas; F1–F4 feitas (2026-10-03, todos os checks verdes); o que sobrou está em Pendencias
prioridade: — (feita)
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
| C4 | **Controle**: RT (7) atira; **segurando RT, o LT (6) cancela** a carga (correr está desligado enquanto carrega, então o LT fica livre); a lanterna do modo Livre vai do 7 para o **botão 10** (o único livre — é o **L3** no controle padrão; o plano dizia R3 por engano, o R3 é o 11, do inventário). Teclado: **Q ou clique esquerdo** atira; **clique direito ou Shift** cancela | **(R 13)** — o controle só tem o 10 livre; o 13 é o sensor |

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

- **F2 — o jogo** (2026-10-02, `src/app/beam.js`): o emissor no inventário desde o começo (nos dois modos; no Livre não gasta); segurar carrega (`chargeK`: abaixo de 0,25 s um estalo seco, `k = 1 − (1 − u)²` até 2,5 s), soltar atira (`shotOf(k)`: 30→400 m, r 0,6→2,8 m, 3→18%); a célula limita a carga (o aparelho mostra o gasto, e "limite da célula"); 0,8 s entre tiros. As 5 bobinas acendem em sequência; a mão treme; zumbido subindo (`audio.beamCharge`) e vibração subindo; o tiro (`audio.beamShot`), coice, um traço fino e branco de 0,15 s (o resto é a F3). O que o feixe atravessa morre; o alerta do setor sobe e os Safeguards perto ouvem (`player:beam`). **C2**: carregando, `controls.charging` — 60% do passo (`input.slow`), sem correr nem pular. **C4**: `fire` = Q / clique esquerdo / RT (segurado — `controls.padFire`); cancela com correr (Shift / LT — `controls.padCancel`) ou o clique direito; a lanterna do Livre foi para o botão 10 (L3). **§5.3**: cancela (sem tiro, sem gasto) com painel aberto, desmaio/captura, quina, escada, a mão sem o emissor, a célula abaixo de um tiro, trocar de mundo; depois de cancelar só um aperto novo carrega.
  `check:beam` ganhou a parte F2 (carga, andar, estados, controle — este com um controle falso). Achados no caminho (do teste): o começo da Peregrinação é um despertar (bloqueia tudo — o teste teleporta e espera); seis tiros chamam Safeguards que vêm pegar o jogador (o teste os desliga na F2); correndo, cai-se da passarela (o teste volta ao ponto de partida).
  **Rodando F1 e F2 juntas, três defeitos reais:** (1) **o corte esperava o streaming** — logo depois de chegar num lugar, todos os workers gerando chunks pesados: o furo perto esperava um deles. Agora **os cortes têm um worker só deles**; (2) **o cache, outra vez**: um chunk gerado pela primeira vez já com cortes (sem as caixas das peças) ia para o cache sob a chave grosseira — agora também sob a precisa; (3) **uma peça de 21.500 triângulos** (a rampa de uma escadaria infinita — uma caixa de centenas de metros subdividida a cada 4 m) custava 183 ms de CSG: a rampa e os parapeitos agora são trechos de até 48 m, cada um uma peça (a mesma superfície). E `cutPiece` separa peças grandes em partes soltas e só passa pelo CSG as que o corte alcança (`csg-spike`: 0 dentro, 0 áreas alteradas).
  **Resultado: `check:beam` 13/13** — furo perto p95 **145 ms**, tiro inteiro p95 **538 ms** (a treliça: 474 → 126 ms). `check` 31/31 (100 fps), `check:pad` 31 + 30. (Um `check:pad` falhou uma vez no começo — foco inicial — e passou nas três seguintes; o último commit também passa: intermitente, sem causa achada.) Captura: as bobinas acesas carregando.

- **F3 — os efeitos** (2026-10-02, `src/app/beamfx.js`, `src/render/lens.js`): **carregando** — a lente gravitacional (passe de tela depois do TAA, antes do bloom; um ponto de atração 2,6 m à frente na mira; nada a menos de 1,2 m do olho é distorcido; opção "distorção do espaço do emissor" nas configurações), a poeira escorrendo para o ponto (`uAttract` no shader da poeira), a câmera e a mão tremendo. **O disparo** — o traço (núcleo + halo, um cone fino na boca, 0,15 s), a dobra em linha na lente, a luz do tiro nas superfícies (`uShotA/B`: uma luz-linha que corre com a detonação — nenhuma vaga de luz), coice e um passo para trás na carga cheia. **A detonação** a 1500 m/s pela linha: clarões, anéis de poeira se abrindo (InstancedMesh), poeira levantada que assenta — tudo na GPU (cada partícula sabe onde e quando nasceu; nascem nos quadros seguintes, alguns pontos por quadro); o estrondo de cada trecho chega pela distância (340 m/s), rangidos depois (`audio.beamBoom`, `beamCreak`). **Depois** — as faces do corte em brasa (o material `cut` com `USE_HEAT`: os últimos 8 cortes; laranja → vermelho → aço em ~10 s, em manchas, a partir de quando a detonação passa ali; cores puras porque o filme dessatura para 38%), faíscas pingando de pontos de borda reais (raios do eixo para fora quando o chunk refeito entra — `cut:swap`), lascas e os detritos do worker caindo (um raio para baixo no nascimento — um `CollisionWorld` só dos efeitos —, quicam uma vez, somem longe).
  **Medido** (`npm run profile -- --profshot`, o caso `tiro`, 6 lugares): carregando ≤ 0,08 ms CPU, GPU ≤ +0,84 ms (limites 1 e 1,5); disparo +3,0 a +4,4 ms (limite 8) — o primeiro da sessão +11 ms (código frio); pior quadro depois 15–55 ms; fps de volta em ≤ 1,1 s (limite 3). Três correções pelo caminho: (1) **o primeiro tiro travava 1,7 s compilando shaders** (a brasa no lote, os detritos, as partículas, a lente) — agora `compileAsync` de antemão, 3 s depois de cada mundo montado, e um disparo mudo longe da vista; (2) **o quadro do tiro** — a detonação e os sons numa fila (nascem nos quadros seguintes) e a reação do mundo ao corte (seres, rondas, objetos) no quadro seguinte (`world._reactToCuts`); (3) nas capturas: o primeiro clarão (a 2 m, ~19 m de tamanho) cegava a tela, o anel a 2 m envolvia a câmera, o halo do traço parecia uma cunha, a brasa era um tapete uniforme (e bege pelo filme) — corrigidos e conferidos de novo.
  `--fxshots=lugar` (com `--capture` e `--delay` longo): capturas no instante certo, carregando e +0,03/0,12/0,5/2/6 s depois do disparo (IPC `dev:capture`). `check:beam` 13/13 (furo perto p95 118 ms), `check` 31/31 (111 fps), `check:pad` 31 + 30.

- **F4 — acabamento** (2026-10-02): **salvar** — os cortes passam pelo salvamento (JSON) e o mundo volta com eles, do cache, sem CSG (`check:beam` caso `salvar`: 22 cortes, 5 chunks, 5 do cache, 0 refeitos); `player.beamPower` (a primeira arma) apagado ao carregar. **Teto de 64 cortes por chunk** (`jamAt` em `app/beam.js`, pelo teste segmento × caixa): o feixe engasga na entrada do chunk saturado ("ESTRUTURA SATURADA" no aparelho). **LOD**: o material `cut` dos chunks de longe também compilado de antemão. **O worker** — `tools/csg-bench.mjs` (50 cortes por chunk, §8: ≤ 2 s): no começo 2–7,7 s nos piores chunks; o custo do CSG cresce com o quadrado dos cilindros numa subtração (e cada subtração parte de um resultado maior). Duas mudanças: (1) **cortes disjuntos num pincel só** (`groupCuts` — sólidos separados não confundem o dentro/fora; os que se cruzam vão para outro grupo); (2) **a memória das peças** no worker (`pieceMemo`, os últimos 48 chunks: o resultado de cada peça e os cortes que ele já tem — um tiro novo só subtrai o cilindro novo; a chave é a forma da peça). Tiro a tiro: o 50º corte ≤ 0,7 s, o pior da sequência 0,75 s — **dentro**; os 50 de uma vez com o worker frio: até ~6,5 s (pendência). **Um defeito antigo achado pelo bench**: uma peça mais fina que o cilindro (nervura de 7 cm) atravessada não gera faces de corte — e o código a dava como intacta; agora decide pelas arestas (`anyInside`). No `csg-spike`, 346 peças cortadas contra 308 (38 finas eram ignoradas); 0 dentro, 0 áreas alteradas. O tempo de worker por tiro passou a ser medido no próprio worker (`workMs`, sem a fila): p95 456 ms (≤ 800). `check:beam` **15/15**. **A porta da F4** (2026-10-03): `check` 31/31 · `check:pilgrimage` 31/31 · `check:pad` 31 + 30 · `check:beings` 5/5 · `check:safeguards` 9/9 · `check:climb` 8/8 · `check:npcs` 10/10 · `check:moves` 6/6 · `check:beam` 15/15. No caminho: (1) **o jogo rodava na GPU integrada** (Intel Iris Xe, 20–29 fps) — o Windows escolhia por conta própria; agora `main.js` pede a dedicada (`force_high_performance_gpu`): 64 fps no `check:beings` onde dava 20–29; a falha do `parede` (Safeguards saindo da parede em 2,6 s) era só a lentidão; (2) **o teste da tela cheia** comparava só a largura — numa tela de 1536 lógicos (1920 a 125%) a janela já ocupa a largura toda: agora compara largura, altura e posição.

- **Pendências fechadas** (2026-10-03): (1) **o caso frio de 50 cortes** — a memória das peças vai para o IndexedDB (`world/pieceStore.js`, só chunks de perto e macro: nos de longe ler e gravar custava mais que recortar): um tiro numa sessão nova também só subtrai o cilindro novo (`check:beam` caso `memoria`: 6 tiros, worker de corte trocado por um novo, o 7º tirou as 7 peças do chunk perto do disco); (2) **o primeiro tiro** — um corte a seco no aquecimento (`world.dryCut`: o caminho do `addCut` com um corte que não atinge nada): +11 → +7,3 ms (≤ 8); a lente também é aquecida (dois quadros ligada em força zero — o `profile` mostrou o programa dela compilando no primeiro uso); (3) **o túnel de longe** — os chunks de longe usam os mesmos uniforms da brasa; `--fxfar` (recua 600 m e olha de volta): 3 de 3 e 2 de 2 chunks de longe refeitos com peças cortadas — mas sem imagem (paredes e névoa entre a câmera e o túnel); (4) **a lente no escuro** — carregando, as bobinas acesas são uma luz fraca e quente logo à frente da boca (a luz-linha do tiro, em pequeno): a distorção tem o que dobrar (captura no depósito: as juntas se curvando em volta da mira); (5) **`check:pad`** — o foco inicial agora insiste por até ~3 s. `check:beam` 16/16 (worker por tiro p95 470 ms), `check:pad` 31 + 30, `profile --profshot` (4 lugares) dentro do §8.

- **O chão debaixo de quem atira** (2026-10-03, pedido do usuário: "ao atirar, o chão imediatamente abaixo de mim não se destrua — a única exceção é se eu tiver de fato atirando pra baixo de mim"). A causa de cair: as contas de "dentro do corte" (recorte de peças abertas, a limpeza depois do CSG, luzes, o grafo) tratavam o corte como uma **cápsula** — pontas redondas de raio inteiro —, e a ponta perto da arma (0,6 m à frente do olho, raio 2,8 m) alcançava o chão sob os pés; o CSG usava um cilindro de pontas retas. Agora: (1) **todas as contas usam o cilindro de pontas retas** (`gen/cut.js` `cutDist`/`inCut`, `Field.cutAt`); (2) **uma coluna protegida** debaixo dos pés de quem atira a pé (`app/beam.js` `keepUnder`, `KEEP`: raio 0,9 m, 6 m para baixo — o corte guarda `keep: [x, y0, z, raio, y1]`, o pincel do CSG perde a coluna, as contas a respeitam); **exceção**: o eixo do tiro entra no chão logo abaixo (a menos de 0,6 m dos pés, abaixo deles) — mirando quase reto para baixo, o chão se abre. `check:beam` caso `chao`: 0°, 29° e 46° para baixo — o chão fica (1,70 m abaixo dos olhos); 86° — some e o corpo cai.

- **Coice e empurrão pela carga** (2026-10-03, pedido do usuário): `app/beam.js` `recoil` — **coice**: a mira sobe em ~30 ms e assenta em 45% em ~0,35 s, com um desvio de lado ao acaso (amplitude 0,018 + 0,12·k rad), e a arma recua na mão (0,4 + 0,6·k); **empurrão**: o corpo é jogado para trás do tiro a 1 + 9·k² m/s, num impulso à parte do passo (`walker.shove` — as paredes param, o atrito consome: no chão ~4/s, no ar ~0,6/s); atirar para baixo empurra para cima (até 7 m/s); voando, entra na velocidade de voo. `check:beam` caso `coice`: carga 0,2 — mira +2,0° (assenta +1,1°), empurrado 0,35 m; carga 1 — mira +6,5° (assenta +3,6°), empurrado 2,62 m.

- **Sobrecarga, cores e o braço** (2026-10-03, pedido do usuário: "mais níveis de potência que variam a cor, até uma cor limite bem extravagante (que faça sentido com o tema gravidade); na potência máxima o knockback tem que aumentar não proporcionalmente, mas muito mais" — e a nota: "muitas vezes o Killy literalmente destrói o braço ao atirar"). A potência continua sendo o tempo segurando (sem níveis escolhidos): até 2,5 s a carga; de 2,5 a 3 s fica no cheio (os 5 tiros cheios por célula não mudam); **de 3 a 6,5 s a sobrecarga** `o` (0..1 — `overK`): alcance até 800 m, raio até 4,4 m, gasto até 35% (`shotOf(k, o)`). **As cores** (`beamfx.js beamColors`, pela potência p = k + o): a luz perto de uma massa enorme desvia para o azul — branco quente → branco frio → azul → violeta → **no limite, o traço vira preto (luz engolida, um horizonte de eventos) com halo violeta**; o traço, o clarão, os anéis, a luz do tiro (`uShotB.w`) e as bobinas mudam juntos; na sobrecarga **a cor do mundo volta** por um instante (o filme sobe a saturação e decai em ~1,5 s) — uma exceção consciente ao "sem neon", a pedido. **O empurrão** na sobrecarga cresce muito mais: 1 + 9k² + 30o² m/s (~40 m/s no limite); bater numa parede forte dá um baque (`walker.onSlam`). **O braço** (`hurtArm`, `ARM`): depois de um tiro em sobrecarga não responde de 3 a 40 s (cresce com o²), a luva escurece queimada e a mira treme; **a partir de o = 0,95, destruído**: o emissor e a mão somem e se regeneram em 90 s; o aparelho mostra a contagem. Medido: carregar até o limite custa 0,09 ms de CPU e +0,04 ms de GPU; o primeiro tiro da sessão em sobrecarga máxima +9,0 ms (acima de 8 — uma vez por sessão; os outros +3,1). `check:beam` **19/19** — `sobrecarga`: 6,8 s → o 1,00, gasto 35%, raio 4,4 m, 800 m, braço destruído (90 s) e o gatilho bloqueado; 4,75 s → o 0,5, braço 12 s sem resposta; `coice` com a sobrecarga máxima: mira +17,1°, empurrado 10,3 m (o cheio: 2,6 m). Os testes seguram pelo tempo de carga do jogo, não pelo relógio. Capturas (`--fxhold=S`): a luz do tiro e as bobinas passando de branco quente a lavanda e violeta; a brasa tinha manchas finas que, com a cor de volta, viraram "estampa de onça" — agora uma variação larga e suave.

- **Sobrecarga revista** (2026-10-03, pedido do usuário: "a arma não é pra se perder na potência máxima — se for pra ter um drawback, vai ser numa futura barra de vida" · "tá pouco extravagante: a transição do antigo nível máximo pro atual tá muito simplista; o efeito no nível máximo tá fraco — nem os efeitos visuais nem o tiro; o raio tá pequeno e o knockback também"). **O braço saiu** (nada de bloquear nem destruir): o custo vai para a [[Barra-de-vida]] (planejada). **Estágios que se anunciam** (`STAGES`, `stageOf`): 1 azul (o > 0) · 2 violeta (1/3) · 3 a singularidade se formando (2/3) · 4 o LIMITE (6,5 s, "SINGULARIDADE" no aparelho); cada passagem: um baque grave e um tinido mais alto a cada estágio (`audio.beamStage`), vibração, **uma onda que corre pela tela** (a lente — `uRipple`), um tranco de poeira, e a cor vira de uma vez (`beamColors` segura a cor do estágio e vira na passagem). **Carregando**: no estágio 3 aparece **a singularidade na mira** — uma esfera preta (a luz não sai) com o anel de acreção violeta (a poeira caindo esquenta e brilha) —, que cresce e no limite pulsa; as bordas da tela fecham (a luz sendo puxada); as bobinas pulsam; a lente e o tremor crescem por estágio. **O tiro do limite**: raio **7,7 m** (0,6 + 2,2k + 2,4o + 2,5o³), **1000 m**; o traço preto reto e grosso com o halo violeta largo; uma onda gravitacional atravessando a tela inteira; a visão fecha e abre (~0,45 s); tremor forte (~0,85 s); o empurrão **~95 m/s** (1 + 9k² + 25o² + 60o⁴) e o corpo sai do chão (voa para trás num arco); a mira sobe ~24°. `check:beam` **19/19** — `sobrecarga`: o 1,00, 35%, raio 7,7 m, 1000 m, estágios 1,2,3,4 anunciados, atira de novo; `coice`: a sobrecarga máxima empurrou **73 m** (o cheio: 2,6 m). Capturas: a singularidade no limite (esfera preta, anel lavanda — o filme dessatura o violeta), as bordas fechando; o traço preto era um cone que, de lado (depois do empurrão), virava uma "prancha" — agora um cilindro reto.

- **Além do limite — o braço é perdido** (2026-10-03, pedido do usuário: "seguindo a mesma lógica, adiciona mais alguns níveis ainda mais fortes; aí sim, nesses níveis, o braço usado pra atirar é perdido; deixa registrado no cofre uma futura mecânica que permite recuperar o braço… deixa em aberto"). Segurando além do limite (a sobrecarga vai de 1 a 2 — `overK`, `CHARGE.beyond` 11 s): **5 ESPAGUETIFICAÇÃO (8 s) · 6 HORIZONTE (9,5 s) · 7 COLAPSO (11 s)**, cada um anunciado como os outros. O furo até **18,7 m** de raio e **2000 m** (`shotOf`), gasto até 50%, o empurrão até ~175 m/s (+ 80·(o−1)²) e um pouco mais de subida. **As cores**: carmim (a maré que estica), azul-branco (o horizonte), branco cegante (o colapso) — o anel da singularidade toma a cor do estágio, a singularidade cresce até ~0,9 m e pulsa mais rápido; **a poeira se estica em riscos** rumo a ela (espaguetificação — o rastro da poeira, `uVel`/`uStreak`); no horizonte e no colapso **as cores do mundo viram do avesso** (o filme ganhou `uInvert`: pulsando carregando; no disparo um clarão invertido — 60% no horizonte, 100% no colapso). A inversão e a onda obedecem à opção "distorção e inversão de cor do emissor" (quem é sensível a luz piscando). **O braço**: disparar num estágio ≥ 5 (`ARM_LOSS_STAGE`) **desfaz o braço que segura o emissor** (`loseArm`): pedaços e faíscas caindo da mão (`fx.armBurst`), o aparelho avisa ("BRAÇO DIREITO PERDIDO"), o emissor volta ao inventário e **o outro braço o pega**; `player.arms` salvo no slot; um braço perdido não segura nada (`inventory.equip`; o painel mostra "(braço perdido)"); **sem os dois**, o corpo não agarra quinas nem sobe escadas (`walker.canGrab`/`canClimb`). Peregrinação: não volta (ainda) — [[Recuperar-o-braco]] (em aberto: estruturas, loot, NPCs, regeneração); Livre: volta em 30 s. `check:beam` caso `alem`: 11,3 s → o 2,00, 50%, raio 18,7 m, 2000 m, estágios 1–7, o braço direito perdido, o esquerdo pegou o emissor, sem braços nada de quinas e escadas. Capturas (`--fxhold`): 8,2 s o anel branco-violeta grande e a onda dobrando o chão; 9,7 s o disco carmim com o buraco preto e o mundo invertido (cinza) no tiro; 11,3 s o disco azul-branco cegante e a inversão total (branco, o violeta do chão vira verde).

- **Pendências fechadas, 2ª rodada** (2026-10-03): (1) **o código de mundo não leva os cortes** — avisado na mensagem de "código copiado" (e em `app/share.js`, [[Seeds-compartilhaveis]]); (2) **o quadro do disparo nos estágios 5–7** (+11,5 ms) — medido por etapa (`lastShot.ms` no `profile`): os pedaços do braço buscavam o chão um a um, cada um varrendo a colisão do mundo inteira → `ensureCol` (uma varredura de 40 m serve várias buscas) e os pedaços numa fila (2 por quadro); as camadas de longe e a macro refeitas no quadro seguinte (`world._lateRecut` — a de perto agora), o resto do mundo no outro; o som, a vibração e a atenção no quadro seguinte (`afterFire`) → **+2,9 a +6,7 ms** (≤ 8); e depois do colapso o fps demorava >4 s para voltar — clarões, anéis e poeira de 45–110 m (camadas translúcidas enormes) → tetos (14 m, 40 m, 10 m): **volta em ≤ 2,1 s**; (3) **o carregamento enquanto se atira** — `check:beam` caso `streaming` (voando a 70 m/s, sobrecarga a cada 2 s de lado): o pior chunk do caminho 62 ms atirando × 28 ms sem (≤ +1000) — amostra pequena (4 chunks novos por corrida); (4) **a memória de vídeo** — caso `lotes` (10 tiros de colapso): +3 páginas (~19 MB) numa rodada; noutra, −29 (o descarregamento compensa); (5) **o túnel de longe em imagem** — de trás e de cima as paredes e os tetos da Cidade o escondem; **de dentro do túnel** (`--fxfar=dentro`), os furos de cada parede em anéis concêntricos até o fundo, a borda de perto em brasa.

## 9. Histórico da decisão **(R 27)**
- 2026-09-30: discutido; escolhido o método "de shader" (cilindros + `discard` + colisão ignorando).
- 2026-10-01: implementado assim (potência em 5 níveis); bugs: a colisão furava em volta (vetor temporário reaproveitado), peças ocas pelo furo, o corpo sumindo perto do cilindro.
- 2026-10-02: retirado a pedido do usuário ("muito bugado"). Decidido: corte de verdade (CSG). Viabilidade inicial (`tools/csg-spike.mjs`): 0 exceções, nada dentro do furo — mas sem conferir a geometria de fora e com a máquina ocupada (ver a revisão). Potência pela carga e efeitos gravitacionais pedidos pelo usuário. Revisão crítica (27 falhas) → este plano v3.
