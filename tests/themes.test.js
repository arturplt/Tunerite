// Run with: node tests/themes.test.js
// Every theme in css/themes.css must set the same --tn-* variables, and those must be exactly the ones the Tuner tab's CSS and SVG use.
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = read('css/themes.css'), used = new Set();
for (const f of ['css/app.css', 'css/tuner.css', 'css/piano.css', 'index.html', 'js/tuner-dial.js']) for (const m of read(f).matchAll(/var\((--tn-[a-z0-9]+)/g)) used.add(m[1]);
const themes = {}; for (const m of css.matchAll(/\[data-theme="([a-z0-9]+)"\]\{([^}]*)\}/g)) themes[m[1]] = new Set([...m[2].matchAll(/(--tn-[a-z0-9]+):/g)].map(x => x[1]));
const ids = [...read('js/themes.js').matchAll(/id: '([a-z0-9]+)'/g)].map(m => m[1]);
let fail = 0; const test = (n, fn) => { try { fn(); console.log('ok   ' + n); } catch (e) { fail++; console.log('FAIL ' + n + '\n     ' + e.message); } };
test('every theme in the list has a rule (classic is the CSS fallback)', () => { for (const id of ids) if (id !== 'classic') assert.ok(themes[id], id + ' has no rule in themes.css'); assert.ok(!themes.classic, 'classic must not override anything'); });
test('every theme sets every variable the Tuner uses', () => { for (const [id, set] of Object.entries(themes)) for (const v of used) assert.ok(set.has(v), id + ' is missing ' + v); });
test('no theme sets a variable nothing uses', () => { for (const [id, set] of Object.entries(themes)) for (const v of set) assert.ok(used.has(v), id + ' sets unused ' + v); });
process.exit(fail ? 1 : 0);
