# 02 — Direção de arte (regras firmes)

> Cada item abaixo foi **pedido ou corrigido explicitamente** pelo usuário.
> Tudo o que for criado no mundo passa por esta lista.
> **Referência direta para qualquer decisão: *Blame!*** (Tsutomu Nihei) — ver [[14-Universo-Blame]].

## Proibido

- **Neon** e cores chamativas.
- **Estética de glitch** — na imagem, no som ou na interface.
- **Qualquer característica alienígena** — inclusive os "glifos alienígenas" e a "interface alienígena". A língua desconhecida é **humana e antiga**: a de uma civilização que se perdeu diante da construção infinda que a própria ganância pôs em marcha (como em *Blame!*). (Decidido e feito em 2026-09-29, na fase 0.)
- **Formas orgânicas / criaturas** fora do repertório de *Blame!*: carcaças com costelas, neurônios/axônios, espinhas, tentáculos, halos de "carne". **Tudo na Cidade deve parecer construído.** (Removidos em 2026-09-28.)
- **Portais** decorativos (o do spawn foi removido: não fazia sentido na temática).
- **Neve**.
- **Luz "mágica"**: nada de luzes sem fonte que flutuam ou seguem o corpo (os fogos-fátuos foram removidos em 2026-09-29). **Toda luz nasce de um objeto** — uma luminária com carcaça, lente e suporte (poste, haste, braço), uma tela, um braseiro, uma abertura no teto. O halo na poeira sem objeto no meio parecia uma luz flutuando (corrigido em 2026-09-29).
- **"Reset" ao cair**: no modo Livre, cair no vazio é para sempre (a realocação é opcional). No modo Peregrinação, uma queda longa termina no desmaio e no despertar em outro lugar ([[Ideias/Gameplay/Queda-e-despertar]]) — não é um reset: o mundo continua, você só foi levado.
- **Nada "certinho"**: nada de grades óbvias, divisões regulares, coisas alinhadas demais. Regiões, setores, endereços: **aleatórios e orgânicos** (pedido quando os biomas foram gerados, reforçado em 2026-09-29).

## Entidades — hoje não, no futuro sim (e só as de *Blame!*)

- **Hoje**: nenhuma entidade aparece (foram removidas a pedido quando eram genéricas).
- **Futuro planejado**: NPCs raros — humanos, transumanos e os demais tipos de seres de *Blame!* — e **inimigos Safeguard**. Tudo o que for arquitetado agora deve deixar espaço para isso. Ver [[Ideias/Futuro/NPCs-e-Safeguards]].

## Obrigatório

- **Paleta**: concreto e aço; luz de vapor de sódio âmbar, fluorescente esverdeada cansada, branco frio, raramente vermelho de alerta; clarões de solda distantes.
- **Iluminação escura**, que funcione **com névoa de 0% a 200%**. Testar sempre com 0 / 30 / 100%.
- **Névoa** de poeira cinza/ocre; o brilho em volta das luzes vem da poeira.
- **Imagem**: filme velho (dessaturação, grão, vinheta).
- **Escala**: o mundo deve ser grande demais — o usuário gosta que seja "praticamente impossível explorar tudo".
- **Nada liso até o horizonte**: superfícies enormes precisam de detalhe visível de longe (ver o relevo das camadas em [[04-Mundo-e-Geracao]]; o mesmo problema pode existir em outras superfícies — [[Ideias/Mundo/Relevo-em-outras-superficies]]).

## Tom e idioma

- Contemplação. Silêncio, escala, abandono. A Cidade funciona sozinha: máquinas cumprem rotinas sem operador.
- **Idioma padrão do jogo: inglês** (decidido 2026-09-29). O que está na língua antiga aparece nessa língua e vai sendo **traduzido** conforme o progresso ([[Ideias/Gameplay/Traducao-como-progresso]]).
- Textos da interface em `src/i18n/` (en.js padrão, pt.js opção). Tom: registro seco de instrumento e burocracia de máquina — nunca "tradução corrompida".

## Como validar

Capturas antes de declarar pronto:
```bash
npx electron . --capture=shot.png --pos=x,y,z,yaw,pitch --seed=abc --fog=0 --delay=20 --show
```
Ver [[10-Comandos-e-Verificacao]].
