---
status: em andamento
prioridade: alta
tags: [mundo, orientacao, base]
---

# Endereçamento da Cidade

> **Fase 2** (`world/inscriptions.js`, `sectorCode`/`levelNumber` em `lang/records.js`): códigos por setor em formatos variados (letra+número, só número, letra+decimal), níveis contados a partir de camadas diferentes por região (12 km), inscrições gastas/renumeradas em galerias, túneis do maciço e placas de estação. As pistas que usam esses endereços são da fase 3.

(Absorve [[Marcas-de-escala]].) Base das [[Pistas]].

> **Decidido (2026-09-29): aleatório, nada definido, "nada certinho".** Nada de grade de setores de tamanho fixo. O usuário já tinha pedido isso quando os biomas foram gerados.

A Cidade foi numerada por quem a construiu — mas ao longo de eras, por gente diferente, sem plano. Então:
- **Setores de formas e tamanhos irregulares**: regiões orgânicas (por ruído / células irregulares), de poucas centenas de metros a vários quilômetros; às vezes um setor dentro do outro.
- **Códigos que não seguem padrão**: comprimentos e formatos variados; setores renumerados (código antigo riscado, novo pintado por cima); setores **sem código**; o mesmo código em dois lugares distantes (erro de quem pintou).
- **Níveis** contados de formas diferentes em regiões diferentes (uma região conta a partir de uma camada, outra de outra).
- **Onde aparece**: pintado em estêncil gasto nas paredes, colunas, bocas de galeria, portas de subestação — em alguns lugares muito, em outros nada. E nos registros dos terminais.

O que continua determinístico: tudo sai do `Field` (a mesma seed dá os mesmos códigos), e os endereços citados nos terminais **levam a lugares que existem**. A bagunça é aparente, não é aleatoriedade a cada jogo.

Os números são legíveis desde o início ([[Traducao-como-progresso]]); as palavras ("SUBESTAÇÃO", "NÍVEL") não.
