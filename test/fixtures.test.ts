/**
 * Golden-file tests: every test/fixtures/<name>.html (clipboard HTML from a
 * real source) must convert to exactly test/fixtures/<name>.expected.html.
 * Output gets a line break after each block so the golden files are readable.
 *
 * After an intentional change: `npm run fixtures:update`, then review the diff.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToFetlife } from '../src/convert';

const dir = join(__dirname, 'fixtures');
const update = !!process.env.UPDATE_FIXTURES;
const readable = (html: string) => html.replace(/(<\/(?:p|h\d|ul|ol|blockquote)>|<hr>)/g, '$1\n');

for (const file of readdirSync(dir).filter((f) => f.endsWith('.html') && !f.endsWith('.expected.html'))) {
  test(file, () => {
    const actual = readable(htmlToFetlife(readFileSync(join(dir, file), 'utf8')));
    const expectedPath = join(dir, file.replace(/\.html$/, '.expected.html'));
    if (update || !existsSync(expectedPath)) writeFileSync(expectedPath, actual);
    expect(actual).toBe(readFileSync(expectedPath, 'utf8'));
  });
}
