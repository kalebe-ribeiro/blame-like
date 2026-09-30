---
status: feita (fase 1)
prioridade: alta
tags: [gameplay, morte, animacao]
---

# Queda e despertar (morte no modo Peregrinação)

> **Feita na fase 1** (`app/wake.js`): impacto > 38 m/s ou 6 s no vazio → a sequência inteira; largado a 1,5–6 km num lugar com chão **e com luz** (setor não apagado — no escuro total não se veria o chão passando); ~25 s no total. `--wake=N` dispara para testar.

> Decidido (2026-09-29). **A animação da queda longa deve ser preparada já** (quando o código for liberado), mesmo antes de existirem Safeguards.

## A regra
Quando você "morre" — hoje, numa **queda longa**; no futuro, também pelos **Safeguards** — **você acorda num lugar aleatório**. A história: quem te achou pensou que você estava morto e **descartou o corpo** num lugar qualquer. Mas você está vivo.

## A animação (queda longa)
1. **Impacto**: o corpo bate no chão e fica lá. A câmera desaba até a altura do chão, com um leve giro, e para. Som de impacto e o zumbido que já existe.
2. **Apagando**: as **bordas da tela escurecem** aos poucos (vinheta crescendo) e a imagem **vai borrando** com um efeito dramático — o foco se perdendo; som abafando, respiração/batimento.
3. **Escuro**: alguns segundos quase no preto.
4. **Abrindo**: a tela **abre aos poucos** (como pálpebras, em piscadas lentas), ainda borrada.
5. **Sendo arrastado**: o chão passa devagar sob você; puxões ritmados, raspar no concreto. **O que arrasta está atrás de você** — a câmera olha para os próprios pés/para trás; dá para mexer um pouco a cabeça, **nunca o bastante para ver quem arrasta**.
6. **Apaga de novo**: a visão fecha.
7. **Despertar**: você acorda deitado num lugar aleatório, e se levanta devagar.

## Onde você acorda
- **Hoje**: um lugar aleatório **com chão**, achado pelo `Field` (como o transporte acha destinos), longe de onde caiu.
- **Futuro** — por sorteio, quem te arrastou define o lugar:
  - **Safeguards** → um **cemitério de corpos**, vítimas dos Safeguards (você foi descartado junto);
  - **NPCs** → uma **colônia de NPCs** (alguém te recolheu).
  (Ver [[NPCs-e-Safeguards]]. Os corpos são do repertório de *Blame!* — não são as "formas orgânicas" proibidas.)

> **Fase 5 (2026-09-30)**: o sorteio está pronto e **desligado** (`WAKE_LOTTERY` em `app/wake.js`): Safeguards 55% → o **cemitério de vítimas** mais perto (estrutura única `graveyard`), carga a 5% e sem o que carregava; NPCs 20% → a **vila** (`village`, hoje abandonada); o resto, ninguém visto. `--wakeas=safeguard|npc` força nas sessões de teste. O `player:wake` leva `taker`.

## Quando dispara
- **Queda longa**: a partir de uma velocidade/altura de impacto que hoje seria fatal (quedas curtas continuam como agora: impacto, tremor, zumbido).
- **Queda sem fim** (o vazio): depois de alguns segundos caindo, a tela escurece ainda no ar e a sequência começa do passo 3.
- **Futuro**: morte por Safeguards.
- **Só no modo Peregrinação.** No Livre continua como hoje (queda para sempre, realocação opcional).

## Custo — decidido (2026-09-29)
- **Arrastado pelos Safeguards → você perde tudo** (acorda no cemitério, sem nada).
- O arrastar dura **6–10 s**.

### Detalhes — decididos (2026-09-29)
| quem arrastou | o que acontece |
|---|---|
| **Safeguards** | perde a **energia** e **o que carregava**; **mantém as ferramentas** (sensor, leitor), a **tradução**, o **diário** e as **pistas** |
| **NPCs** | eles **ficam com algo** seu, ou **pedem uma missão** em troca (entrega, ajuda…) — ver [[Cargas]] |
| **ninguém** (hoje, antes de existirem Safeguards e NPCs) | **nenhum custo** além do deslocamento |
