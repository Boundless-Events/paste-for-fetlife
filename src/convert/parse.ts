/**
 * Clipboard HTML -> canonical Doc.
 *
 * Handles the HTML that common sources put on the clipboard:
 *  - Lexical (Payload CMS rich text): semantic tags (<strong>, <em>, <h2>,
 *    <ul>, <blockquote>), nested lists inside an <li>.
 *  - Google Docs: formatting lives in inline styles (font-weight:700), the
 *    whole paste is wrapped in <b style="font-weight:normal">, nested lists
 *    sit directly inside the parent <ul>, links may go through google.com/url.
 *  - Microsoft Word: lists are <p class="MsoListParagraph"> with the bullet
 *    in a <span style="mso-list:Ignore">.
 *  - Web pages / email: arbitrary markup, including layout tables.
 *
 * Anything FetLife can't show (colors, fonts, underline, images, tables) is
 * simplified away.
 */
import type { Block, Doc, Inline, Marks } from './model';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'CENTER', 'DD', 'DETAILS',
  'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1',
  'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'HTML', 'LI', 'MAIN', 'NAV', 'OL',
  'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL',
]);

const SKIP_TAGS = new Set([
  'AUDIO', 'BUTTON', 'CANVAS', 'COLGROUP', 'HEAD', 'IFRAME', 'INPUT', 'LINK',
  'META', 'NOSCRIPT', 'OBJECT', 'SCRIPT', 'SELECT', 'STYLE', 'SVG', 'TEMPLATE',
  'TEXTAREA', 'TITLE', 'VIDEO', 'svg',
]);

/** Paragraphs made from loose inline content; parents merge these into their own text. */
const implicit = new WeakSet<Block>();
/** Word list paragraphs, with their list id and nesting level; merged into real lists afterwards. */
const wordListInfo = new WeakMap<Block, { id: string; level: number }>();

export function parseHtml(html: string): Doc {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return normalizeBlocks(parseChildren(dom.body, {}));
}

// ---------------------------------------------------------------------------
// Walking the DOM

function parseChildren(parent: Node, marks: Marks): Block[] {
  const blocks: Block[] = [];
  let inlines: Inline[] = [];

  const flush = () => {
    if (inlines.some((n) => n.type === 'text' && n.value.trim())) {
      const p: Block = { type: 'paragraph', children: inlines };
      implicit.add(p);
      blocks.push(p);
    }
    inlines = [];
  };

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlines.push({ type: 'text', value: (node as Text).data, ...marks });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const style = parseStyle(el);
    if (SKIP_TAGS.has(el.tagName) || style.get('display') === 'none' || isWordListBullet(style)) continue;

    if (el.tagName === 'BR') {
      inlines.push({ type: 'break' });
    } else if (el.tagName === 'IMG') {
      // Images can't be pasted into FetLife. Keep alt text only when the image is
      // the content of a link, so the link survives.
      const alt = el.getAttribute('alt')?.trim();
      if (marks.href && alt) inlines.push({ type: 'text', value: alt, ...marks });
    } else if (BLOCK_TAGS.has(el.tagName)) {
      flush();
      blocks.push(...parseBlockElement(el, marksOf(el, style, marks)));
    } else {
      // Inline element. It may still contain blocks (Google Docs wraps the whole
      // paste in a <b>), so parse it as blocks and merge loose text back in.
      for (const b of parseChildren(el, marksOf(el, style, marks))) {
        if (implicit.has(b)) inlines.push(...(b as { children: Inline[] }).children);
        else {
          flush();
          blocks.push(b);
        }
      }
    }
  }
  flush();
  return mergeWordLists(blocks);
}

/** Parse a block element's content as explicit blocks (not mergeable into a parent's text). */
function parseExplicit(el: Element, marks: Marks): Block[] {
  const blocks = parseChildren(el, marks);
  for (const b of blocks) implicit.delete(b);
  return blocks;
}

function parseBlockElement(el: HTMLElement, marks: Marks): Block[] {
  const tag = el.tagName;
  switch (tag) {
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      return [{ type: 'heading', level: Number(tag[1]) as 1, children: flattenInlines(parseChildren(el, marks)) }];
    case 'UL': case 'OL':
      return [parseList(el, marks)];
    case 'BLOCKQUOTE':
      return [{ type: 'quote', children: parseExplicit(el, marks) }];
    case 'PRE':
      return [{ type: 'codeblock', value: (el.textContent ?? '').replace(/\n$/, '') }];
    case 'HR':
      return [{ type: 'rule' }];
    case 'TABLE':
      return parseTable(el, marks);
    case 'P': {
      const info = wordListParagraphInfo(el);
      if (info) {
        const list: Block = { type: 'list', ordered: wordListIsOrdered(el), items: [parseExplicit(el, marks)] };
        wordListInfo.set(list, info);
        return [list];
      }
      return parseExplicit(el, marks);
    }
    default:
      return parseExplicit(el, marks);
  }
}

function parseList(el: HTMLElement, marks: Marks): Block {
  const ordered = el.tagName === 'OL';
  const start = ordered ? parseInt(el.getAttribute('start') ?? '1', 10) || 1 : undefined;
  const items: Block[][] = [];
  for (const child of Array.from(el.children)) {
    const style = parseStyle(child);
    if (SKIP_TAGS.has(child.tagName) || style.get('display') === 'none') continue;
    const content =
      child.tagName === 'UL' || child.tagName === 'OL'
        ? [parseList(child as HTMLElement, marks)] // Google Docs: nested list directly inside the parent list
        : parseExplicit(child, marksOf(child, style, marks));
    const onlyAList = content.length === 1 && content[0].type === 'list';
    if (onlyAList && items.length) items[items.length - 1].push(content[0]); // Lexical: <li><ul>…</ul></li>
    else items.push(content);
  }
  return { type: 'list', ordered, ...(start && start !== 1 ? { start } : {}), items };
}

/**
 * Data tables (only text in the cells) become one line per row, cells joined
 * with " | ". Layout tables (cells containing paragraphs, lists, …; common in
 * emails and newsletters) are read cell by cell as ordinary content.
 */
function parseTable(table: HTMLElement, marks: Marks): Block[] {
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  const cells = rows.flatMap((tr) => Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH'));
  const isLayout = cells.some((c) => c.querySelector('p,div,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,table,pre'));
  if (isLayout) return cells.flatMap((c) => parseExplicit(c, marks));

  const children: Inline[] = [];
  for (const tr of rows) {
    const texts = Array.from(tr.children)
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((c) => flattenInlines(parseChildren(c, marks)))
      .filter((inl) => inl.some((n) => n.type === 'text' && n.value.trim()));
    if (!texts.length) continue;
    if (children.length) children.push({ type: 'break' });
    texts.forEach((inl, i) => {
      if (i) children.push({ type: 'text', value: ' | ' });
      children.push(...inl);
    });
  }
  return children.length ? [{ type: 'paragraph', children }] : [];
}

/** Collapse blocks into a single line of inline content (for headings and table cells). */
function flattenInlines(blocks: Block[]): Inline[] {
  const out: Inline[] = [];
  const add = (inl: Inline[]) => {
    if (out.length) out.push({ type: 'text', value: ' ' });
    out.push(...inl.map((n): Inline => (n.type === 'break' ? { type: 'text', value: ' ' } : n)));
  };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === 'paragraph' || b.type === 'heading') add(b.children);
      else if (b.type === 'quote') walk(b.children);
      else if (b.type === 'list') b.items.forEach(walk);
      else if (b.type === 'codeblock') add([{ type: 'text', value: b.value, code: true }]);
    }
  };
  walk(blocks);
  return out;
}

// ---------------------------------------------------------------------------
// Formatting

function marksOf(el: Element, style: Map<string, string>, base: Marks): Marks {
  const m: Marks = { ...base };
  switch (el.tagName) {
    case 'B': case 'STRONG': m.bold = true; break;
    case 'I': case 'EM': case 'CITE': case 'DFN': case 'VAR': m.italic = true; break;
    case 'S': case 'STRIKE': case 'DEL': m.strike = true; break;
    case 'CODE': case 'KBD': case 'SAMP': case 'TT': m.code = true; break;
    case 'A': {
      const href = cleanHref(el.getAttribute('href'));
      if (href) m.href = href;
      break;
    }
  }
  const weight = style.get('font-weight');
  if (weight) {
    const n = parseInt(weight, 10);
    if (weight === 'bold' || weight === 'bolder' || n >= 600) m.bold = true;
    else if (weight === 'normal' || weight === 'lighter' || n < 600) m.bold = false;
  }
  const fontStyle = style.get('font-style');
  if (fontStyle === 'italic' || fontStyle === 'oblique') m.italic = true;
  else if (fontStyle === 'normal') m.italic = false;
  const decoration = `${style.get('text-decoration') ?? ''} ${style.get('text-decoration-line') ?? ''}`;
  if (decoration.includes('line-through')) m.strike = true;
  return m;
}

function cleanHref(raw: string | null): string | undefined {
  let href = raw?.trim();
  if (!href) return undefined;
  // Google redirect wrapper: https://www.google.com/url?q=<real>&sa=…
  try {
    const u = new URL(href);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('q')) {
      href = u.searchParams.get('q')!;
    }
  } catch {
    return undefined; // relative or malformed: we can't know where it points
  }
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

/** Parse a style attribute ourselves so non-standard properties (mso-list) survive. */
function parseStyle(el: Element): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) map.set(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim().toLowerCase().replace(/\s*!important$/, ''));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Microsoft Word lists

function isWordListBullet(style: Map<string, string>): boolean {
  return style.get('mso-list') === 'ignore';
}

/** Word writes list membership as style="mso-list:l1 level2 lfo2": list id l1, nesting level 2. */
function wordListParagraphInfo(el: Element): { id: string; level: number } | undefined {
  const list = parseStyle(el).get('mso-list');
  if (!list && !/MsoListParagraph/i.test(el.className)) return undefined;
  return { id: list?.match(/\bl\d+\b/)?.[0] ?? '', level: Number(list?.match(/level(\d+)/)?.[1] ?? 1) };
}

function wordListIsOrdered(el: Element): boolean {
  const bullet = Array.from(el.querySelectorAll('span')).find((s) => isWordListBullet(parseStyle(s)));
  return /^\s*(\d+|[a-z]|[ivxlc]+)[.)]/i.test(bullet?.textContent ?? '');
}

function mergeWordLists(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let stack: { level: number; list: Extract<Block, { type: 'list' }> }[] = [];
  let currentId: string | undefined;
  for (const b of blocks) {
    const info = wordListInfo.get(b);
    if (!info || b.type !== 'list') {
      stack = [];
      currentId = undefined;
      out.push(b);
      continue;
    }
    if (info.id !== currentId) stack = []; // a different Word list starts here
    currentId = info.id;
    const { level } = info;
    const item = b.items[0];
    while (stack.length && stack[stack.length - 1].level > level) stack.pop();
    const top = stack[stack.length - 1];
    if (top && top.level === level) {
      top.list.items.push(item);
    } else {
      const list: Extract<Block, { type: 'list' }> = { type: 'list', ordered: b.ordered, items: [item] };
      if (top) top.list.items[top.list.items.length - 1].push(list);
      else out.push(list);
      stack.push({ level, list });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalization: whitespace like a browser renders it, drop empty blocks

function normalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'paragraph':
      case 'heading': {
        const children = normalizeInlines(b.children);
        if (children.some((n) => n.type === 'text')) out.push({ ...b, children });
        break;
      }
      case 'list': {
        const items = b.items.map(normalizeBlocks).filter((item) => item.length);
        if (items.length) out.push({ ...b, items });
        break;
      }
      case 'quote': {
        const children = normalizeBlocks(b.children);
        if (children.length) out.push({ type: 'quote', children });
        break;
      }
      case 'codeblock':
        if (b.value.trim()) out.push(b);
        break;
      case 'rule':
        if (out.length && out[out.length - 1].type !== 'rule') out.push(b);
        break;
    }
  }
  while (out.length && out[out.length - 1].type === 'rule') out.pop();
  return out;
}

function normalizeInlines(list: Inline[]): Inline[] {
  const out: Inline[] = [];
  const trimEnd = () => {
    for (let last = out[out.length - 1]; last?.type === 'text'; last = out[out.length - 1]) {
      last.value = last.value.replace(/ +$/, '');
      if (last.value) return;
      out.pop();
    }
  };
  let atLineStart = true;
  for (const n of list) {
    if (n.type === 'break') {
      trimEnd();
      if (out.length) out.push(n);
      atLineStart = true;
      continue;
    }
    let value = n.value.replace(/[​﻿]/g, '');
    if (!n.code) value = value.replace(/\s+/g, ' ');
    const prev = out[out.length - 1];
    if (atLineStart || (prev?.type === 'text' && prev.value.endsWith(' '))) value = value.replace(/^ +/, '');
    if (!value) continue;
    atLineStart = false;
    if (prev?.type === 'text' && sameMarks(prev, n)) prev.value += value;
    else out.push({ ...n, value });
  }
  trimEnd();
  while (out.length && out[out.length - 1].type === 'break') {
    out.pop();
    trimEnd();
  }
  // No more than one blank line inside a paragraph.
  return out.filter((n, i) => !(n.type === 'break' && out[i - 1]?.type === 'break' && out[i - 2]?.type === 'break'));
}

function sameMarks(a: Marks, b: Marks): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike && !!a.code === !!b.code && a.href === b.href;
}
