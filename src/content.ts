/**
 * Runs on fetlife.com. When you paste formatted text into one of FetLife's
 * rich-text editors (event descriptions, writings, group discussions, your
 * About section), it cleans the formatting up first, then lets FetLife's
 * editor paste the cleaned version, so FetLife's own undo, autosave and
 * submit all keep working. A small "Formatted for FetLife · Undo" notice
 * offers FetLife's normal paste instead.
 *
 * Left alone: plain text pastes, pasted image files, plain text boxes
 * (status updates, comments, messages), and single-line fields.
 */
import { htmlToFetlife } from './convert';

/** Marks paste events this script dispatches itself, so it doesn't handle them twice. */
const OURS = new WeakSet<Event>();

const INSTALLED = '__pasteForFetlifeInstalled';
const w = window as unknown as Record<string, unknown>;
if (!w[INSTALLED]) {
  w[INSTALLED] = true;
  document.addEventListener('paste', onPaste, true);
}

function onPaste(e: ClipboardEvent): void {
  if (OURS.has(e) || e.defaultPrevented) return;
  const target = e.target instanceof Element ? e.target : null;
  const editor = target?.closest('lexxy-editor');
  const content = target?.closest('[contenteditable="true"]');
  if (!editor || !content || target!.closest('[data-paste-for-fetlife="off"]')) return;

  const data = e.clipboardData;
  const html = data?.getData('text/html');
  if (!data || !html) return; // plain text: FetLife handles it
  if (data.files.length && !hasText(html)) return; // a pasted picture: FetLife decides
  if (editor.getAttribute('tables') !== 'false' && /<table[\s>]/i.test(html)) return; // this editor keeps real tables

  let cleaned: string;
  try {
    cleaned = htmlToFetlife(html);
  } catch (err) {
    console.warn('[Paste for FetLife] could not clean this paste; using FetLife\'s normal paste', err);
    return;
  }
  if (!cleaned) return;

  const original = snapshot(data);
  e.preventDefault();
  e.stopImmediatePropagation();
  dispatchPaste(content, { 'text/html': cleaned, 'text/plain': data.getData('text/plain') });
  showNotice(() => {
    undo(content);
    dispatchPaste(content, original);
  });
}

function hasText(html: string): boolean {
  return !!new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim();
}

function snapshot(data: DataTransfer): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const type of data.types) if (type !== 'Files') copy[type] = data.getData(type);
  return copy;
}

/** Paste through FetLife's own editor, exactly as if the clipboard held this data. */
function dispatchPaste(content: Element, items: Record<string, string>): void {
  const dt = new DataTransfer();
  for (const [type, value] of Object.entries(items)) dt.setData(type, value);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  OURS.add(ev);
  (content as HTMLElement).focus();
  content.dispatchEvent(ev);
}

/** The editor's own undo (Cmd+Z / Ctrl+Z), which removes our paste as one step. */
function undo(content: Element): void {
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  (content as HTMLElement).focus();
  content.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: apple, ctrlKey: !apple, bubbles: true, cancelable: true }),
  );
}

// ---------------------------------------------------------------------------
// The notice. Lives in a shadow root so FetLife's CSS can't restyle it.

let dismissTimer: number | undefined;

function showNotice(onUndo: () => void): void {
  document.getElementById('paste-for-fetlife-notice')?.remove();
  window.clearTimeout(dismissTimer);

  const host = document.createElement('div');
  host.id = 'paste-for-fetlife-notice';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .box { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
        display: flex; gap: 14px; align-items: center; padding: 10px 14px 10px 16px; border-radius: 10px;
        background: #f2f2f2; color: #1d1d1f; font: 14px/1.3 system-ui, -apple-system, sans-serif;
        box-shadow: 0 6px 24px rgba(0,0,0,.45); max-width: calc(100vw - 32px); }
      button { all: unset; cursor: pointer; font-weight: 600; color: #b3261e; padding: 4px 6px; border-radius: 6px; }
      button:hover, button:focus-visible { background: rgba(0,0,0,.08); }
    </style>
    <div class="box" role="status">
      <span>Formatted for FetLife</span>
      <button type="button" title="Use FetLife's normal paste instead">Undo</button>
    </div>`;
  const button = root.querySelector('button')!;
  button.addEventListener('mousedown', (ev) => ev.preventDefault()); // keep the editor focused
  button.addEventListener('click', () => {
    host.remove();
    onUndo();
  });
  document.documentElement.appendChild(host);
  dismissTimer = window.setTimeout(() => host.remove(), 8000);
}
