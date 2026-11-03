/**
 * Canonical Doc -> clean HTML for FetLife's rich-text editor (Lexxy).
 *
 * Only emits what FetLife's editor toolbar offers: paragraphs, line breaks,
 * H2–H4 headings, bold, italic, strikethrough, links, bullet and numbered
 * lists (nested), quotes and dividers. No colors, fonts, underline, images
 * or tables, so the result looks the same as something typed into FetLife.
 */
import type { Block, Doc, Inline } from './model';

export interface HtmlOptions {
  /** FetLife's heading menu offers H2, H3 and H4. */
  minHeading: number;
  maxHeading: number;
}

export const FETLIFE: HtmlOptions = { minHeading: 2, maxHeading: 4 };

type Text = Extract<Inline, { type: 'text' }>;

export function renderHtml(doc: Doc, options: HtmlOptions = FETLIFE): string {
  // Shift headings so the document's top level lands on FetLife's top level
  // (a Google Docs H1/H2/H3 outline becomes H2/H3/H4), then clamp.
  const levels = headingLevels(doc);
  const shift = levels.length ? Math.max(0, options.minHeading - Math.min(...levels)) : 0;
  const ctx = { shift, options };
  return doc.map((b) => block(b, ctx)).join('');
}

interface Ctx {
  shift: number;
  options: HtmlOptions;
}

function block(b: Block, ctx: Ctx): string {
  switch (b.type) {
    case 'paragraph':
      return `<p>${inlines(b.children)}</p>`;
    case 'heading': {
      const level = Math.min(ctx.options.maxHeading, Math.max(ctx.options.minHeading, b.level + ctx.shift));
      // Headings are already bold; dropping bold avoids a double-bold look.
      return `<h${level}>${inlines(b.children.map((n) => (n.type === 'text' ? { ...n, bold: false } : n)))}</h${level}>`;
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const start = b.ordered && b.start && b.start !== 1 ? ` start="${b.start}"` : '';
      return `<${tag}${start}>${b.items.map((item) => `<li>${listItem(item, ctx)}</li>`).join('')}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${flatten(b.children)}</blockquote>`;
    case 'rule':
      return '<hr>';
    case 'codeblock':
      return `<p>${b.value.split('\n').map(escape).join('<br>')}</p>`;
  }
}

/** A list item holds one line of text (multiple paragraphs joined by line breaks) plus any nested lists. */
function listItem(item: Block[], ctx: Ctx): string {
  const text = flatten(item.filter((b) => b.type !== 'list'));
  const nested = item.filter((b) => b.type === 'list').map((b) => block(b, ctx)).join('');
  return text + nested;
}

/** Blocks as inline content separated by line breaks (for quotes and list items). */
function flatten(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') parts.push(inlines(b.children));
    else if (b.type === 'heading') parts.push(`<strong>${inlines(b.children.map((n) => (n.type === 'text' ? { ...n, bold: false } : n)))}</strong>`);
    else if (b.type === 'quote') parts.push(flatten(b.children));
    else if (b.type === 'list') parts.push(...b.items.map((item) => `• ${flatten(item)}`));
    else if (b.type === 'codeblock') parts.push(b.value.split('\n').map(escape).join('<br>'));
  }
  return parts.join('<br>');
}

function inlines(nodes: Inline[]): string {
  let out = '';
  for (let i = 0; i < nodes.length; ) {
    const n = nodes[i];
    if (n.type === 'text' && n.href) {
      const href = n.href;
      let inner = '';
      while (i < nodes.length && nodes[i].type === 'text' && (nodes[i] as Text).href === href) inner += marked(nodes[i++] as Text);
      out += `<a href="${escape(href)}">${inner}</a>`;
    } else {
      out += n.type === 'break' ? '<br>' : marked(n);
      i++;
    }
  }
  return out;
}

function marked(t: Text): string {
  let s = escape(t.value);
  if (t.strike) s = `<s>${s}</s>`;
  if (t.italic) s = `<em>${s}</em>`;
  if (t.bold) s = `<strong>${s}</strong>`;
  return s;
}

function headingLevels(blocks: Block[]): number[] {
  return blocks.flatMap((b) =>
    b.type === 'heading' ? [b.level] : b.type === 'quote' ? headingLevels(b.children) : b.type === 'list' ? b.items.flatMap(headingLevels) : [],
  );
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
