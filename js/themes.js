"use strict";
/* ---- Themes: the look of the Tuner tab (colours only; layout is the same in every theme). ----
   The colours live in css/themes.css, one rule per id. "classic" has none: it is the look the CSS falls back to.
   The choice is a setting, so each profile keeps its own. */
const Themes = {
  list: [
    { id: 'classic',  name: 'Classic',  note: 'Cream dial, dark plate, amber LCD', sw: ['#2b2c31', '#f1e6c8', '#1a120a', '#c0321c'] },
    { id: 'utility',  name: 'Utility',  note: 'Black matte plastic, white print, amber LCD', sw: ['#2e2f33', '#1c1d1f', '#2a1d0a', '#e07a33'] },
    { id: 'solar',    name: 'Solar',    note: 'Sage case, cream dial, teal caps', sw: ['#8c9b7c', '#e8dfc4', '#232a17', '#b4623e'] },
    { id: 'tu12',     name: 'TU-12',    note: 'Olive case, orange dial, red LEDs', sw: ['#6f7566', '#e89b3d', '#2a0d0b', '#ff5a4a'] },
    { id: 'phosphor', name: 'Phosphor', note: 'Green on black, like a scope', sw: ['#1a211a', '#071007', '#071207', '#6dff7a'] }
  ],
  get(id) { return this.list.find(t => t.id === id) || this.list[0]; },
  /* sets <html data-theme> and the Tuner screen's own theme switch (its name and the ticked row) */
  apply(id) {
    const t = this.get(id); document.documentElement.dataset.theme = t.id;
    const nm = document.getElementById('tnThemeName'); if (nm) nm.textContent = t.name.toUpperCase();
    document.querySelectorAll('#tnThemePop .tnopt').forEach(b => { const on = b.dataset.id === t.id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  },
  /* the next theme in the list (d = -1 for the previous one) */
  step(id, d = 1) { const i = this.list.indexOf(this.get(id)); return this.list[(i + d + this.list.length) % this.list.length].id; }
};
