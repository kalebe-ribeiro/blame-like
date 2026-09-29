---
status: feita (fase 2)
prioridade: alta
tags: [gameplay, base]
---

# Terminais com conteúdo

> **Feita na fase 2** (`lang/records.js`, `app/reading.js`, `ui/reader.js`): registros em tokens (manutenção, falhas, energia, contagens, burocracia da Netsfera, fragmentos raros da história); tela no centro com E; palavras recém-entendidas se resolvem na frente dos olhos; destino de transporte "Terminal". Ainda faltam os ENDEREÇOS como pistas (fase 3).

> Escolhida (2026-09-29). Base de quase todo o resto: é daqui que saem tradução, pistas, mapas.
> Inspiração: os terminais da Netsfera em *Blame!* ([[14-Universo-Blame]]).

## O que um terminal mostra
Tudo **na língua antiga**, legível na medida da [[Traducao-como-progresso|tradução]]:
- **registros de manutenção** do setor (válvulas, falhas, reparos adiados há milhares de ciclos);
- **cronogramas de obra** dos Construtores (onde fica o próximo canteiro, o que está sendo erguido);
- **horários** de transportadores, elevadores e [[Subir-nas-maquinas|máquinas colossais]];
- **endereços** de lugares reais (ver [[Enderecamento-da-Cidade]]) — é daqui que nascem as [[Pistas|pistas]];
- **esquemas parciais do setor** que entram no [[Mapa-de-descobertas|mapa]];
- raramente, **registros longos**: fragmentos de quem construiu tudo e se perdeu (a história contada em migalhas).

## Estados de um terminal
| estado | o que dá |
|---|---|
| **morto** (setor sem energia) | nada — ou **um fragmento**, com o [[Ferramentas|leitor portátil]] (escolhido) |
| **com energia** (setor [[Religar-setores|religado]]) | tudo o que ele guarda |
| **ativo** (raro, [[Estruturas-unicas]]) | acesso a mais do que o setor — "a rede" |

## Regras
- Conteúdo é **função pura** de `(seed, id do terminal)` + fatos do `Field` (o endereço citado **existe**).
- Um registro lido fica no [[Diario-como-arquivo|diário]] e **se re-traduz sozinho** quando a tradução avança: reler um registro antigo meses depois e entender o que ele dizia é o prêmio.
- Nenhum personagem, nenhum diálogo. Só a burocracia de uma máquina que continua registrando para ninguém.

## Interação — decidido (2026-09-29)
Olhar para o terminal de perto + tecla: **a tela abre no centro**, para ler com calma (rolagem, fechar na mesma tecla). É a exceção à regra de [[Interface-diegetica|interface mínima]]: ler textos longos precisa de conforto.
