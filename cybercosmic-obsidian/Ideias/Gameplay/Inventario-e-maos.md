---
status: feita
prioridade: alta
tags: [gameplay, corpo, interface]
---

# Inventário e mãos equipáveis

> Pedido do usuário (2026-10-01): "adicione inventário, contendo todos os itens e ferramentas que o jogador tiver, incluindo carga. As mãos vêm por padrão vazias, podendo ser equipadas com ferramentas. No caso das duas vazias, sempre comece equipando pela mão direita. Se as duas estiverem ocupadas, substitua o item na mão direita."

## Regras (`app/inventory.js`)

- **Ferramentas**: a **lanterna** (sempre) e o **aparelho** (Peregrinação: a célula, o leitor portátil de terminais e a tela onde o sensor fala). O **módulo sensor** aparece na lista quando achado (é parte do aparelho). As **cargas** aparecem com o que são, a distância da entrega e a recompensa prometida.
- **Mãos** (`player.hands = { right, left }`): começam vazias. Equipar: as duas vazias → direita; só a direita ocupada → esquerda; as duas ocupadas → troca a da direita. Guardar: a mão fica vazia.
- **Usar o que não está na mão a equipa** pela mesma regra: a lanterna (F / L), o sensor (G), a tomada (E), o leitor portátil (E num terminal morto). *(escolha por padrão — o pedido não dizia; a confirmar)*
- Fora da mão, nada aparece nem funciona: a lanterna guardada apaga; o aparelho guardado não mostra a tela.
- Cada objeto pode ir em qualquer mão (o aparelho e a lanterna têm as duas versões: direita e esquerda — `app/hands.js`, `app/carried.js`).

## O painel

Tecla **I** / **R3** no controle. W/S (↑ ↓) escolhem, E (Enter/Espaço) confirma, Esc ou I fecham; pelo controle, como os outros painéis (A confirma, B fecha). Testado em `npm run check:pad` (`pad:inventario-*`).
