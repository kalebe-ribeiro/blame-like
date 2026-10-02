// Tipos globais para a checagem (`npm run typecheck`) — o jogo não lê este arquivo.

// A interface é só HTML: o que querySelector devolve é sempre um elemento HTML aqui.
interface Element {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
  click(): void;
}
interface EventTarget {
  dataset?: DOMStringMap;
  closest?(selectors: string): Element | null;
}

interface Window {
  /** a ponte com o processo principal do Electron (preload.js) */
  cybercosmic: any;
}
