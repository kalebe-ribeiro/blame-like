---
status: feita
prioridade: alta
tags: [gameplay, movimento, corpo]
---

# Quinas e mãos

> Pedido do usuário (2026-09-30), a partir de uma foto: uma mureta baixa, mas alta demais para pular. "Adicione a possibilidade de agarrar nas quinas para escalar — não uma parede inteira, mas uma altura relativamente baixa que não dê para pular. Para todas as quinas: os quadrados gigantes, o chão de uma ponte suspensa, e outros casos realistas para um corpo humano. E isso já é a deixa para adicionar mãos — nas animações e ao segurar itens."

## Como funciona (`controls/walker.js`)

Uma **quina** é: uma parede (ou uma face que pende para baixo — a lateral de uma laje, de um disco mais estreito embaixo) à frente, a até 0,85 m; um **topo plano** logo acima (procurado em 3 pontos atrás da face: um rebordo, um cano baixo junto da borda, também serve para a mão); o topo **continua** por 0,6 m (corrimãos e quinas finas não contam); **espaço para ficar de pé** em cima (1,8 m livres) e nada no caminho do corpo passando por cima.

| situação | o que acontece |
|---|---|
| pular de frente para uma quina de até **1,3 m** | passa por cima direto (vault, ~0,6 s) |
| pular de frente para uma quina de **1,3 a 2,25 m** | agarra; segurando frente, sobe (~1 s) |
| no ar, subindo devagar ou caindo (até 14 m/s), com a borda passando pelas mãos | agarra — de frente sempre; **atrás e dos lados** só se embaixo não houver chão por 5 m (caiu da ponte: segura o piso dela; descer de propósito uma mureta não vira agarrão) |
| pendurado | frente/pulo **sobe** · trás (ou descer) **solta** · lados **andam pela borda** (0,9 m/s) |
| carregando uma carga | só o vault |

Ao agarrar, o corpo se vira de frente para a parede. Os seres (Safeguards, moradores…) não agarram quinas — andam pelo grafo.

## As mãos (`app/hands.js`)

Luvas de tecido grosso, feitas por código: palma, quatro dedos de duas falanges, polegar; cada junta dobra.

- **Segurando**: a direita segura o aparelho por baixo, de palma para cima; a esquerda fecha em volta do tubo da lanterna.
- **Agarrando**: as duas mãos ficam **na quina, no mundo** (a palma em cima, os dedos para dentro do topo), com os antebraços descendo para o corpo; os olhos ficam rente à borda. O aparelho e a lanterna saem das mãos (a lanterna apaga) — não dá para se pendurar segurando nada; depois de subir, voltam (a lanterna acesa, se estava).
- **Subindo**: as mãos continuam na quina enquanto o corpo sobe (empurram) e, passando por cima, descem para fora da vista.

Sons: dois tapas de luva ao agarrar; o tecido raspando na borda ao subir, e o pé apoiando em cima.

## Verificação

`npm run check:climb` (`dev/climbtest.js`): sobe quinas de verdade achadas em volta de vários destinos (vault na colmeia, no estrato e na teia; agarrar no silo), pega a borda de uma plataforma da teia caindo de costas para ela, e o piso de uma ponte suspensa caindo do lado dela. Flags: `--hang=N [--climbup] [--vault]`, `--ledgestats=N` (por que as paredes em volta não são quinas), `--ambient=N` (luz ambiente ×N, só para capturas).

O levantamento (`--ledgestats`) mostrou que a maioria das paredes **não** é quina por serem altas demais (mais de 2,25 m: "topo") — o que é o certo; quinas que dá para subir são raras, como devem ser.
