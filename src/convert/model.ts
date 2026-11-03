/**
 * The canonical document: what we turn any clipboard HTML into before
 * rendering it for FetLife. Deliberately small: only the things FetLife
 * can plausibly show. Everything else is simplified away by the parser.
 */

export interface Marks {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Absolute http(s)/mailto URL when this text is part of a link. */
  href?: string;
}

export type Inline =
  | ({ type: 'text'; value: string } & Marks)
  | { type: 'break' };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'list'; ordered: boolean; start?: number; items: Block[][] }
  | { type: 'quote'; children: Block[] }
  | { type: 'rule' }
  | { type: 'codeblock'; value: string };

export type Doc = Block[];
