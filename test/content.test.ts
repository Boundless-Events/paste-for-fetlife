/**
 * The paste handler, against a stand-in for FetLife's rich-text editor:
 * <lexxy-editor><div contenteditable="true"></div></lexxy-editor>.
 * The stand-in records the pastes it receives, like Lexxy would handle them.
 */

// jsdom has no DataTransfer and its ClipboardEvent ignores clipboardData.
class FakeDataTransfer {
  #data = new Map<string, string>();
  files: File[] = [];
  get types() {
    return [...this.#data.keys(), ...(this.files.length ? ['Files'] : [])];
  }
  setData(type: string, value: string) {
    this.#data.set(type, value);
  }
  getData(type: string) {
    return this.#data.get(type) ?? '';
  }
}
class FakeClipboardEvent extends Event {
  clipboardData: FakeDataTransfer | null;
  constructor(type: string, init: EventInit & { clipboardData?: FakeDataTransfer } = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData ?? null;
  }
}
Object.assign(globalThis, { DataTransfer: FakeDataTransfer, ClipboardEvent: FakeClipboardEvent });

interface Received {
  html: string;
  plain: string;
  types: string[];
}
let received: Received[];
let keydowns: KeyboardEvent[];

function userPaste(target: Element, data: Record<string, string>, files: File[] = []): Event {
  const dt = new FakeDataTransfer();
  for (const [k, v] of Object.entries(data)) dt.setData(k, v);
  dt.files = files;
  const e = new FakeClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
  target.dispatchEvent(e);
  return e;
}

const notice = () => document.getElementById('paste-for-fetlife-notice');
const el = (id: string) => document.getElementById(id)!;

beforeAll(async () => {
  await import('../src/content');
});

beforeEach(() => {
  document.body.innerHTML = `
    <lexxy-editor id="event" tables="false"><div id="ev" contenteditable="true"></div></lexxy-editor>
    <lexxy-editor id="writing"><div id="wr" contenteditable="true"></div></lexxy-editor>
    <textarea id="status"></textarea>`;
  notice()?.remove();
  received = [];
  keydowns = [];
  // Stand-in for Lexxy: record every paste that reaches the editor (bubble phase, after our capture handler).
  for (const id of ['ev', 'wr']) {
    el(id).addEventListener('paste', (e) => {
      const dt = (e as FakeClipboardEvent).clipboardData!;
      received.push({ html: dt.getData('text/html'), plain: dt.getData('text/plain'), types: dt.types });
    });
    el(id).addEventListener('keydown', (e) => keydowns.push(e as KeyboardEvent));
  }
});

test('cleans a formatted paste before FetLife\'s editor sees it', () => {
  const e = userPaste(el('ev'), {
    'text/html': '<h1>Munch</h1><p><span style="color:#000;font-weight:700">Bold</span> and <u>underlined</u></p>',
    'text/plain': 'Munch\nBold and underlined',
    'application/x-lexical-editor': '{"nodes":[]}',
  });
  expect(e.defaultPrevented).toBe(true);
  expect(received).toHaveLength(1); // the original never reached the editor; only our cleaned one did
  expect(received[0].html).toBe('<h2>Munch</h2><p><strong>Bold</strong> and underlined</p>');
  expect(received[0].plain).toBe('Munch\nBold and underlined');
  expect(received[0].types).not.toContain('application/x-lexical-editor');
  expect(notice()).not.toBeNull();
});

test('Undo uses the editor\'s own undo, then FetLife\'s normal paste of the original', () => {
  const original = { 'text/html': '<h1>Munch</h1>', 'text/plain': 'Munch', 'application/x-lexical-editor': '{"nodes":[]}' };
  userPaste(el('ev'), original);
  (notice()!.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
  expect(keydowns).toHaveLength(1);
  expect(keydowns[0].key).toBe('z');
  expect(received).toHaveLength(2);
  expect(received[1]).toEqual({ html: '<h1>Munch</h1>', plain: 'Munch', types: ['text/html', 'text/plain', 'application/x-lexical-editor'] });
  expect(notice()).toBeNull();
});

test.each([
  ['Win32', { ctrlKey: true, metaKey: false }],
  ['Linux x86_64', { ctrlKey: true, metaKey: false }],
  ['MacIntel', { ctrlKey: false, metaKey: true }],
])('Undo sends the right shortcut on %s', (platform, keys) => {
  const spy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  userPaste(el('ev'), { 'text/html': '<h1>x</h1>', 'text/plain': 'x' });
  (notice()!.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
  expect({ ctrlKey: keydowns[0].ctrlKey, metaKey: keydowns[0].metaKey }).toEqual(keys);
  spy.mockRestore();
});

test('plain-text pastes are left to FetLife', () => {
  const e = userPaste(el('ev'), { 'text/plain': 'just text' });
  expect(e.defaultPrevented).toBe(false);
  expect(received).toEqual([{ html: '', plain: 'just text', types: ['text/plain'] }]);
  expect(notice()).toBeNull();
});

test('a pasted picture is left to FetLife', () => {
  const file = new File(['x'], 'pic.png', { type: 'image/png' });
  const e = userPaste(el('wr'), { 'text/html': '<img src="blob:x">' }, [file]);
  expect(e.defaultPrevented).toBe(false);
});

test('tables go untouched into editors that support tables (writings)', () => {
  const e = userPaste(el('wr'), { 'text/html': '<table><tr><td>a</td></tr></table>', 'text/plain': 'a' });
  expect(e.defaultPrevented).toBe(false);
});

test('tables are simplified in editors without tables (events)', () => {
  userPaste(el('ev'), { 'text/html': '<table><tr><td>a</td><td>b</td></tr></table>', 'text/plain': 'a b' });
  expect(received[0].html).toBe('<p>a | b</p>');
});

test('plain text boxes (status updates, comments, messages) are left alone', () => {
  const e = userPaste(el('status'), { 'text/html': '<b>x</b>', 'text/plain': 'x' });
  expect(e.defaultPrevented).toBe(false);
  expect(notice()).toBeNull();
});
