# Paste for FetLife

A Chrome extension that cleans up formatting when you paste into FetLife's rich-text editors: event descriptions, writings, group discussions and your profile's About section.

Copy an event write-up from Google Docs, Word, a website or your CMS, press **Ctrl+V** (**⌘V** on Mac) in FetLife, and it arrives the way FetLife's own toolbar would format it:

- Headings land on FetLife's sizes (H2–H4). A Google Docs Heading 1/2/3 outline becomes H2/H3/H4.
- Bold, italic, strikethrough, links, bullet and numbered lists (nested), quotes and dividers are kept.
- Colors, fonts, font sizes, highlights and underline are removed, so text stays readable on FetLife's dark theme.
- Blank spacer lines, images and tables (which event descriptions can't hold) are simplified away.
- Google's redirect links are unwrapped, and Word's bullet lists come through as real lists.

A small **Formatted for FetLife · Undo** notice appears after each paste. **Undo** swaps in FetLife's normal paste instead.

It only acts in FetLife's rich-text editors. Plain-text pastes, pasted pictures, single-line fields and plain text boxes (status updates, comments, messages) are left alone.

Not affiliated with or endorsed by FetLife.

## Install

**From the Chrome Web Store:** _link coming once the listing is approved_. Works in Chrome, Edge, Brave and other Chromium browsers.

**From source** (for testing a change):

1. `npm install && npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension/` folder.

## Privacy

The extension runs only on fetlife.com, collects nothing, and sends nothing anywhere. Clipboard contents are processed inside your browser at the moment you paste. See [PRIVACY.md](PRIVACY.md).

## Development

```sh
npm install
npm test          # converter, paste handler and real-clipboard samples
npm run build     # extension/content.js and the test page
npm run zip       # paste-for-fetlife.zip for the Chrome Web Store
```

- `src/convert/parse.ts`: clipboard HTML → a small, source-agnostic document (handles Lexical/Payload, Google Docs, Word, web pages, emails).
- `src/convert/html.ts`: that document → the HTML FetLife's editor (Lexxy) understands.
- `src/content.ts`: the paste handler. It hands the cleaned HTML to FetLife's own editor, so FetLife's undo, autosave and submit behave normally.
- `playground/index.html`: a test page with the same open-source editor FetLife uses. Serve the repo (`python3 -m http.server`) and open `/playground/`. It also has a box for saving a raw clipboard sample.
- `test/fixtures/`: clipboard HTML from each source, with expected output. If a paste comes out wrong, save it from the test page, add it here, and run `npm run fixtures:update`.

## License

MIT
