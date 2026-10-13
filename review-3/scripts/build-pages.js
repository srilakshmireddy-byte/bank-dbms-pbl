'use strict';
/**
 * Builds the GitHub Pages demo: a copy of public/ that runs without the Node server or MySQL.
 * The copy turns on the in-page backend (public/js/demo.js) with window.__DEMO__ and makes every
 * root-absolute asset path relative, because Pages serves the site from /<repository-name>/.
 * public/ itself is not modified, so the real app is unaffected.
 *
 *   node scripts/build-pages.js        ->  writes pages-dist/
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'pages-dist');

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b);
    else fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copy(SRC, OUT);

// index.html: relative asset paths, the demo flag, and a banner saying what this is
const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/(href|src)="\//g, '$1="./');
html = html.replace('<script src="./js/theme.js"></script>', '<script>window.__DEMO__ = true;</script>\n  <script src="./js/theme.js"></script>');
html = html.replace('<body>', '<body>\n  <div role="note" style="background:#1A1A1D;color:#FAF7F0;font:14px/1.5 Jost,system-ui,sans-serif;padding:8px 16px;text-align:center">Live demo with the sample data. Pick a demo login on the sign-in page. Everything resets when you reload the page.</div>');
if (!html.includes('__DEMO__')) throw new Error('index.html was not patched: check the script tag for theme.js');
fs.writeFileSync(indexPath, html);

// styles.css: fonts are referenced from the stylesheet, so they need a path relative to css/
const cssPath = path.join(OUT, 'css', 'styles.css');
fs.writeFileSync(cssPath, fs.readFileSync(cssPath, 'utf8').replace(/url\("\/fonts\//g, 'url("../fonts/'));

// favicon etc. are plain copies. A .nojekyll file stops GitHub from processing the folder.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`Built the Pages demo in ${OUT}`);
