# 00 — ÍNDICE

> Cofre do **CYBERCOSMIC**: todo o contexto do projeto num lugar só — o que ele é,
> as regras de direção de arte, como o código funciona, o que já foi feito e o que
> ainda pode ser feito. Serve para você e para uma IA começar uma sessão sem
> redescobrir tudo.

**Aferido em:** 2026-09-29, commit `c0b9214` (fase 3 inteira; branch `claude/dreamy-tesla-8pvapl`).
**Raiz do projeto:** `C:\Users\kaleb\Downloads\vibecoding\blame` (este cofre é a subpasta `cybercosmic-obsidian/`).
**Repositório:** https://github.com/kalebe-ribeiro/blame-like (público).

**Regra de ouro:** se uma nota contradiz o código, **o código vence** — conserte a nota.

---

## O que ler, conforme a tarefa

| a tarefa é… | leia |
|---|---|
| situar-se em 30 s | [[01-Visao-Geral]] |
| qualquer coisa visual (criar ou mudar algo no mundo) | [[02-Direcao-de-Arte]] — **sempre** |
| entender como o mundo infinito é gerado | [[03-Arquitetura]] → [[04-Mundo-e-Geracao]] |
| mexer em algo que se move ou acontece (trens, apagões, máquinas…) | [[05-Sistemas-Vivos]] |
| desempenho, shaders, pós-processamento | [[06-Render-e-Desempenho]] |
| som | [[07-Audio]] |
| interface, controles, salvamento, transporte | [[08-Interface-e-Travessia]] |
| "em que arquivo fica X?" | [[09-Mapa-de-Arquivos]] |
| testar / capturar imagem / medir | [[10-Comandos-e-Verificacao]] |
| antes de commitar | [[11-Invariantes-e-Armadilhas]] |
| "por que isto está assim?" | [[12-Historico]] |
| "o que o usuário já decidiu?" | [[13-Decisoes]] — **sempre, antes de propor algo** |
| qualquer decisão de conteúdo, lore, inimigos, NPCs | [[14-Universo-Blame]] — *Blame!* é a referência direta |
| **o que fazer a seguir** | [[15-Plano-de-Implementacao]] (fases 0 → 7, até os NPCs) → [[Ideias/00-Ideias]] |
| mudanças decididas e ainda não feitas (a fila, na ordem) | [[Ideias/Pendencias]] |

> **Estado (2026-10-03): fases 0 a 7 feitas (o plano inteiro) e a arma de Killy fechada (F1–F4).** As escolhas por padrão das fases 3–7 foram respondidas pelo usuário ([[13-Decisoes]]). **O que vem, na ordem: [[Ideias/Pendencias]]** — a barra de vida, o dano do emissor e o movimento dos inimigos, depois recuperar o braço; o objetivo final é o gene de terminal; o rework gráfico por último. Registrar todo o contexto novo neste cofre.

## Mapa do cofre

- `00–12` — o projeto como ele **é** hoje.
- `13` — as decisões do usuário; `14` — o universo de *Blame!* como referência; `15` — o plano de implementação (vivo).
- `Ideias/` — o que ele **pode vir a ser**:
  - [[Ideias/00-Ideias]] — índice com status e prioridade de cada ideia;
  - `Ideias/Gameplay/` — dar ao jogo motivos e meios, sem perder a contemplação;
  - `Ideias/Mundo/` — mais coisas no mundo;
  - `Ideias/Tecnico/` — desempenho, distribuição, ferramentas, arquitetura para o futuro;
  - `Ideias/Futuro/` — as features grandes: barra de vida, recuperar o braço, o gene de terminal (objetivo final), o rework gráfico; e as feitas (arma de Killy, NPCs e Safeguards, quinas);
  - [[Ideias/Pendencias]] — decidido, mas ainda não feito no código;
  - [[Ideias/Descartadas]] — o que foi removido ou recusado, e por quê (não repetir).
