"use strict";

/* ============================================================
   APP (DOM, storage, audio). Not covered by unit tests.
   ============================================================ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
/* Collapsible list: closed by default, remembers what the user opened across re-renders. force opens it (search results). */
const FOLD_OPEN = new Set();
function fold(title, key, force) {
  const d = document.createElement('details'), sm = document.createElement('summary'), body = document.createElement('div');
  d.className = 'fold'; d.dataset.k = key; sm.textContent = title; d.append(sm, body);
  if (force) { d.open = true; d.dataset.force = '1'; } else d.open = FOLD_OPEN.has(key);
  d.body = body; return d;
}
document.addEventListener('toggle', e => { const d = e.target, k = d.dataset && d.dataset.k; if (k && !d.dataset.force) { if (d.open) FOLD_OPEN.add(k); else FOLD_OPEN.delete(k); } }, true);
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', ms || 3500); }

