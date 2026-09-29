---
status: feita
prioridade: alta
tags: [gameplay, direcao]
---

# Pistas — rastros que nascem do mundo

> **Feita na fase 3** (`lang/leads.js`, `app/leads.js`, `gen/sites.js`): ~40% dos terminais têm uma linha ROTA (setor · nível · distância). Terminal com energia dá tudo, o leitor portátil 1–2 partes; cada parte só vale com a palavra entendida, e a área de incerteza encolhe (mapa e aba PISTAS). Ler o terminal citado fecha a pista. Cadeias: terminais → a única mais próxima; das únicas, uma correnteza por seed (nunca voltam, nunca acabam). Alvos hoje: terminais e estruturas únicas; canteiros e trincheiras na fase 4. **Em aberto → escolhido por padrão:** nada na tela ao chegar; o sensor marca o lugar (◆). Ver [[13-Decisoes]].

> Escolhida (2026-09-29) — antes chamada "peregrinação"; o nome ficou só para o [[Modos-de-jogo|modo]]. Condição: **tem de fazer sentido no contexto — nunca sorteada ao abrir o mundo.**
> Inspiração: Killy atravessando a Cidade atrás de um rastro ([[14-Universo-Blame]]).

## Proposta: seguir endereços
A Cidade tem um **sistema de endereçamento** na língua antiga — **irregular, sem grade** (ver [[Enderecamento-da-Cidade]]) — pintado nas paredes e citado nos registros ([[Enderecamento-da-Cidade]]). Uma pista é **um endereço que você achou e decide seguir**:

1. **Um fragmento aparece**: um [[Terminais-com-conteudo|terminal]] cita "SUBESTAÇÃO 7 · NÍVEL −3 · SETOR ▯▯▯" — você entende só o que a [[Traducao-como-progresso|tradução]] deixa.
2. **Vira uma pista** no [[Diario-como-arquivo|diário]]: com o que já foi entendido (o nível, talvez parte do setor).
3. **Completar a pista**: outros terminais, inscrições nas paredes, mais tradução — cada fragmento estreita a região (o [[Mapa-de-descobertas|mapa]] mostra a área de incerteza encolhendo).
4. **Chegar perto**: lendo os códigos de setor pintados nas paredes você sabe se está no lugar certo; o [[Ferramentas|sensor]] capta o sinal do alvo quando ele tem energia.
5. **Chegar**: o lugar existe de verdade (o endereço sai do `Field`). Lá há outro terminal — e muitas vezes **a próxima pista**.

## Por que funciona
- Os objetivos **emergem**: você nunca recebe uma missão; você **acha um rastro** e decide segui-lo.
- **Várias pistas abertas** ao mesmo tempo; o jogador escolhe.
- Cadeias longas levam às [[Estruturas-unicas]] — os "objetivos a concluir" do jogo, sem precisar de um fim.
- Sem seta na tela por padrão: você se orienta pela Cidade (códigos nas paredes, níveis, sensor).

## Tipos de pista (exemplos)
- uma **subestação** para [[Religar-setores|religar]];
- um **terminal ativo**;
- o **canteiro** citado num cronograma de obra;
- a **trincheira** e o horário de uma máquina colossal;
- uma [[Estruturas-unicas|estrutura única]] (o fim de uma cadeia).

## Em aberto
- Mostrar alguma indicação quando a pista está completa, ou nunca?
