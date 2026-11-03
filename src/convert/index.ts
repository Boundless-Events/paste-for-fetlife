import { FETLIFE, renderHtml, type HtmlOptions } from './html';
import { parseHtml } from './parse';

export { FETLIFE, parseHtml, renderHtml };
export type { HtmlOptions };

/** Clipboard HTML -> clean HTML for FetLife's rich-text editor. Empty string when there's nothing to paste. */
export function htmlToFetlife(html: string, options: HtmlOptions = FETLIFE): string {
  return renderHtml(parseHtml(html), options);
}
