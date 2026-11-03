// Builds the extension's content script, plus the test page's copy of FetLife's editor (Lexxy).
// Keeps the manifest version in sync with package.json.
import { build, context } from 'esbuild';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifestPath = 'extension/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

const extension = {
  entryPoints: ['src/content.ts'],
  outfile: 'extension/content.js',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  legalComments: 'none',
  logLevel: 'info',
};
const playground = {
  entryPoints: ['playground/lexxy-entry.js'],
  outfile: 'playground/lexxy.js',
  bundle: true,
  format: 'esm',
  target: 'chrome110',
  logLevel: 'warning',
};
copyFileSync('node_modules/@37signals/lexxy/dist/stylesheets/lexxy.css', 'playground/lexxy.css');
for (const f of ['lexxy-editor.css', 'lexxy-content.css', 'lexxy-variables.css']) {
  copyFileSync(`node_modules/@37signals/lexxy/dist/stylesheets/${f}`, `playground/${f}`);
}

if (process.argv.includes('--watch')) {
  await (await context(extension)).watch();
  await (await context(playground)).watch();
} else {
  await Promise.all([build(extension), build(playground)]);
}
