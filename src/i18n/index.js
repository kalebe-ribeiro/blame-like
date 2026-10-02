// ─────────────────────────────────────────────────────────────────────────────
//  Idiomas. Todo texto que aparece na tela sai daqui: t('chave', {params}).
//  Inglês é o padrão; português é opção (configurações). Um arquivo por
//  idioma (en.js, pt.js) com as mesmas chaves; o que faltar num idioma cai
//  no inglês.
//
//  No HTML: data-i18n="chave" (texto) ou data-i18n-html="chave" (com marcação)
//  — applyDom() preenche, e é chamado de novo quando o idioma muda.
// ─────────────────────────────────────────────────────────────────────────────
import en from './en.js';
import pt from './pt.js';

const DICTS = { en, pt };
export const LANGS = [
  ['en', 'English'],
  ['pt', 'Português'],
];

let lang = 'en';
const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(l) {
  const next = DICTS[l] ? l : 'en';
  if (next === lang) return;
  lang = next;
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  applyDom();
  for (const fn of listeners) fn(lang);
}

/** Avisa quando o idioma mudar (painéis que montam texto em JS). */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Texto da chave, com {parâmetros} substituídos. */
export function t(key, params) {
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (typeof s === 'function') return s(params ?? {});
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}

/**
 * Preenche os elementos marcados com data-i18n / data-i18n-html.
 * @param {ParentNode} [root]
 */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
}

const locale = () => (lang === 'pt' ? 'pt-BR' : 'en-US');

/** Número com separadores do idioma. */
export function fmtNum(n, digits = 0) {
  return n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Distância: "640 m" ou "2.4 km" / "2,4 km". */
export function fmtDist(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${fmtNum(m / 1000, m < 100000 ? 1 : 0)} km`;
}
