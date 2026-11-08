/* Dinner Planner — single-page app, no build step.
 * Data lives in a shared storage (Google Apps Script, see backend/Code.gs),
 * so everyone with the link can view and edit without a login.
 * Without a configured URL (config.js) it runs in local mode using
 * localStorage, seeded from data/db.json. */
'use strict';

// ---------------------------------------------------------------- constants
const DAYS = [
  { k: 'mon', n: 'Monday' }, { k: 'tue', n: 'Tuesday' }, { k: 'wed', n: 'Wednesday' },
  { k: 'thu', n: 'Thursday' }, { k: 'fri', n: 'Friday' },
];
// Default headcount per weekday (always editable per day).
const DEFAULT_PEOPLE = {
  mon: { adults: 2, kidsBig: 0, kidsSmall: 1 },
  tue: { adults: 2, kidsBig: 0, kidsSmall: 1 },
  wed: { adults: 2, kidsBig: 1, kidsSmall: 1 },
  thu: { adults: 2, kidsBig: 1, kidsSmall: 1 },
  fri: { adults: 2, kidsBig: 0, kidsSmall: 0 },
};
const DB_PATH = 'data/db.json';
const LOCAL_DB_KEY = 'dinnerplanner.localdb';

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekKey(offset) { return isoDate(addDays(mondayOf(new Date()), 7 * offset)); }
function isoWeekNo(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
const fmtShort = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function weekRange(key) {
  const m = parseIso(key);
  return `${fmtShort(m)} – ${fmtShort(addDays(m, 4))}`;
}
function dayDate(key, i) { return addDays(parseIso(key), i); }

function stars(n) {
  n = n || 0;
  return `<span class="stars" title="${n} of 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}
function peopleText(p) {
  const parts = [`${p.adults} adult${p.adults === 1 ? '' : 's'}`];
  if (p.kidsBig) parts.push(`${p.kidsBig} big kid${p.kidsBig === 1 ? '' : 's'}`);
  if (p.kidsSmall) parts.push(`${p.kidsSmall} small kid${p.kidsSmall === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- data model
function emptyDb() {
  return { version: 1, tags: ['Tom likes', 'Make ahead'], recipes: [], weeks: {} };
}
function normalizeDb(db) {
  db = db && typeof db === 'object' ? db : emptyDb();
  db.version ??= 1;
  db.tags = Array.isArray(db.tags) ? db.tags : [];
  db.recipes = Array.isArray(db.recipes) ? db.recipes : [];
  db.weeks = db.weeks && typeof db.weeks === 'object' ? db.weeks : {};
  return db;
}
function defaultDay(k) {
  return { enabled: true, recipeId: null, people: { ...DEFAULT_PEOPLE[k] }, snacks: '', filter: { tags: [], minRating: 0 } };
}
// Read-only view of a day (does not create anything).
function getDay(db, wk, k) {
  const d = db.weeks[wk]?.days?.[k];
  return d ? { ...defaultDay(k), ...d, people: { ...DEFAULT_PEOPLE[k], ...(d.people || {}) }, filter: { tags: [], minRating: 0, ...(d.filter || {}) } } : defaultDay(k);
}
// Mutable day inside a mutation (creates the week/day if missing).
function ensureDay(db, wk, k) {
  db.weeks[wk] ??= { days: {} };
  db.weeks[wk].days ??= {};
  db.weeks[wk].days[k] = getDay(db, wk, k);
  return db.weeks[wk].days[k];
}
const recipeById = (db, id) => db.recipes.find(r => r.id === id);
function weekRecipeIds(db, wk, exceptDay) {
  return DAYS.filter(d => d.k !== exceptDay).map(d => getDay(db, wk, d.k)).filter(d => d.enabled && d.recipeId).map(d => d.recipeId);
}
// Recipes in the neighbouring weeks: next week must not repeat this week and vice versa.
function neighbourIds(db, wk) {
  const m = parseIso(wk);
  return new Set([...weekRecipeIds(db, isoDate(addDays(m, -7))), ...weekRecipeIds(db, isoDate(addDays(m, 7)))]);
}
function candidates(db, wk, k, extraExclude = []) {
  const day = getDay(db, wk, k);
  const ex = new Set([...neighbourIds(db, wk), ...weekRecipeIds(db, wk, k), ...extraExclude]);
  return db.recipes.filter(r =>
    r.active !== false &&
    (r.rating || 0) >= (day.filter.minRating || 0) &&
    day.filter.tags.every(t => (r.tags || []).includes(t)) &&
    !ex.has(r.id));
}
const pickRandom = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
function lastPlanned(db, id) {
  let last = null;
  for (const [wk, w] of Object.entries(db.weeks)) {
    DAYS.forEach((d, i) => {
      const day = w.days?.[d.k];
      if (day && day.enabled !== false && day.recipeId === id) {
        const dt = isoDate(dayDate(wk, i));
        if (!last || dt > last) last = dt;
      }
    });
  }
  return last;
}

// ---------------------------------------------------------------- storage
// Shared mode: Google Apps Script web app (backend/Code.gs), URL in config.js.
// Anyone with the page can read and edit — no login. Local mode otherwise.
const API_URL = (window.DINNER_API_URL || '').trim();

const Store = {
  rev: 0,
  mode: API_URL ? 'shared' : 'local',
  canEdit: true,
  async load() {
    if (this.mode === 'local') {
      const saved = lsGet(LOCAL_DB_KEY, null);
      if (saved) return normalizeDb(saved);
      try { const r = await fetch(DB_PATH, { cache: 'no-store' }); if (r.ok) return normalizeDb(await r.json()); } catch { /* none */ }
      return emptyDb();
    }
    let j;
    try {
      const r = await fetch(`${API_URL}${API_URL.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      j = await r.json();
    } catch { throw new Error('Could not reach the shared storage. Check your internet connection and reload.'); }
    if (!j.ok) throw new Error(`Loading failed: ${j.error || 'unknown error'}`);
    this.rev = j.db.rev || 0;
    return normalizeDb(j.db);
  },
  // Returns 'ok' | 'conflict'; throws on other errors.
  async write(db, message) {
    if (this.mode === 'local') { lsSet(LOCAL_DB_KEY, db); return 'ok'; }
    let j;
    try {
      // text/plain avoids a CORS preflight, which Apps Script does not answer.
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ baseRev: this.rev, message, db }) });
      j = await r.json();
    } catch { throw new Error('Could not reach the shared storage — your change is not saved yet. Retrying…'); }
    if (j.ok) { this.rev = j.rev; db.rev = j.rev; return 'ok'; }
    if (j.conflict) return 'conflict';
    throw new Error(`Saving failed: ${j.error || 'unknown error'}`);
  },
};

// Every change is a function applied to the db. It is applied immediately
// (optimistic) and, on a save conflict, replayed on top of the newest remote data.
const pending = [];
let saving = false, saveTimer = null;
function mutate(fn, msg = 'Update dinner plan') {
  if (!Store.canEdit) { toast('Editing is not possible right now.'); return; }
  fn(state.db);
  pending.push({ fn, msg });
  render();
  setStatus('Unsaved changes…', 'saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}
async function flush() {
  if (saving || !pending.length) return;
  saving = true;
  setStatus('Saving…', 'saving');
  try {
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      const n = pending.length;
      const msg = n === 1 ? pending[0].msg : `${pending[0].msg} (+${n - 1} more)`;
      const res = await Store.write(state.db, msg);
      if (res === 'ok') { pending.splice(0, n); continue; }
      // Someone else saved in between: take theirs, replay ours.
      const remote = await Store.load();
      pending.forEach(p => p.fn(remote));
      state.db = remote;
      render();
    }
    if (pending.length) throw new Error('Could not save after several retries — please reload.');
    setStatus(Store.mode === 'local' ? 'Saved in this browser' : 'Saved ✓');
  } catch (e) {
    setStatus('Not saved', 'error');
    toast(e.message, 6000);
  } finally {
    saving = false;
    if (pending.length) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500); }
  }
}
async function reload(quiet) {
  if (pending.length || saving) return;
  try {
    state.db = await Store.load();
    state.loadError = null;
    if (!quiet) setStatus('Up to date');
  } catch (e) { state.loadError = e.message; setStatus('Load failed', 'error'); }
  render();
}

// ---------------------------------------------------------------- ui state
const state = {
  db: emptyDb(),
  tab: lsGet('dinnerplanner.tab', 'overview'),
  planWeek: 'next',             // 'current' | 'next'
  openMs: null,                 // id of open multi-select dropdown
  rq: '', rTags: [], rSort: 'title', rInactive: false,
  loadError: null,
};

function setStatus(text, cls = '') { const el = $('#status'); el.textContent = text; el.className = 'status ' + cls; }
let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// Multi-select dropdown with checkboxes. `id` keeps it open across re-renders.
function multiSelect(id, label, options, selected, action, extra = '') {
  const sum = selected.length ? selected.join(', ') : label;
  return `<details class="ms" data-ms="${esc(id)}" ${state.openMs === id ? 'open' : ''}>
    <summary title="${esc(sum)}">${esc(sum)}</summary>
    <div class="ms-pop">
      ${options.length ? options.map(o => `<label><input type="checkbox" data-action="${action}" data-value="${esc(o)}" ${extra} ${selected.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('') : '<div class="muted small" style="padding:4px 6px">No tags yet</div>'}
    </div></details>`;
}

// Searchable recipe dropdown for the manual choice. Filtering happens in the
// DOM (no re-render), so the search field keeps focus while typing.
function recipeCombo(id, dayKey, recipes, selectedId, usedIds) {
  const items = recipes.map(x => `<button type="button" class="combo-item ${x.id === selectedId ? 'sel' : ''}"
      data-action="manual-pick" data-day="${dayKey}" data-id="${x.id}" data-q="${esc(x.title.toLowerCase())}">
      <span class="ct">${esc(x.title)}</span>
      ${usedIds.has(x.id) && x.id !== selectedId ? '<span class="warn small">used</span>' : ''}
      ${x.rating ? `<span class="stars small">${'★'.repeat(x.rating)}</span>` : ''}
    </button>`).join('');
  return `<details class="ms combo" data-ms="${esc(id)}" ${state.openMs === id ? 'open' : ''} style="margin-top:6px">
    <summary>Choose manually…</summary>
    <div class="ms-pop">
      <input type="search" class="combo-q" placeholder="Search ${recipes.length} recipes…" autocomplete="off">
      <div class="combo-list">${items || '<div class="muted small" style="padding:6px">No active recipes</div>'}</div>
      <div class="combo-empty muted small hidden" style="padding:6px">No recipe matches.</div>
    </div></details>`;
}
function filterCombo(input) {
  const pop = input.closest('.ms-pop');
  const q = input.value.trim().toLowerCase();
  let shown = 0;
  pop.querySelectorAll('.combo-item').forEach(b => {
    const hit = !q || b.dataset.q.includes(q);
    b.classList.toggle('hidden', !hit);
    if (hit) shown++;
  });
  pop.querySelector('.combo-empty').classList.toggle('hidden', shown > 0 || !pop.querySelector('.combo-item'));
}

// ---------------------------------------------------------------- render
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#banner').innerHTML = state.loadError
    ? `<div class="bar">⚠ ${esc(state.loadError)}</div>`
    : Store.mode === 'local'
      ? `<div class="bar">Local mode — data is stored only in this browser. Set the shared storage URL in <code>config.js</code> (see README).</div>`
      : '';
  document.body.classList.toggle('readonly', !Store.canEdit);
  const app = $('#app');
  app.innerHTML = ({ overview: renderOverview, plan: renderPlan, recipes: renderRecipes, settings: renderSettings }[state.tab] || renderOverview)();
}

function renderWeekCard(wk, label) {
  const today = isoDate(new Date());
  const days = DAYS.map((d, i) => {
    const day = getDay(state.db, wk, d.k);
    const date = dayDate(wk, i);
    const r = day.recipeId && recipeById(state.db, day.recipeId);
    let meal;
    if (!day.enabled) meal = '<div class="meal none">No dinner planned</div>';
    else if (r) meal = `<div class="meal"><button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button></div>`;
    else meal = '<div class="meal none">Not chosen yet</div>';
    return `<div class="day ${isoDate(date) === today ? 'today' : ''}">
      <div class="dname">${d.n} · ${fmtShort(date)}</div>
      ${meal}
      ${day.enabled ? `<div class="small muted">👥 ${peopleText(day.people)}</div>` : ''}
      ${day.enabled && day.snacks ? `<div class="snacks">🥨 ${esc(day.snacks)}</div>` : ''}
    </div>`;
  }).join('');
  return `<section class="card">
    <div class="week-head"><span class="lbl">${label}</span><span class="muted">Week ${isoWeekNo(parseIso(wk))} · ${weekRange(wk)}</span>
      <span class="spacer"></span>
      ${Store.canEdit ? `<button class="btn sm" data-action="goto-plan" data-week="${label === 'This week' ? 'current' : 'next'}">Edit</button>` : ''}</div>
    ${days}
  </section>`;
}
function renderOverview() {
  return `<div class="weeks">${renderWeekCard(weekKey(0), 'This week')}${renderWeekCard(weekKey(1), 'Next week')}</div>`;
}

function renderPlan() {
  const wk = weekKey(state.planWeek === 'next' ? 1 : 0);
  const db = state.db;
  const active = db.recipes.filter(r => r.active !== false).sort((a, b) => a.title.localeCompare(b.title));
  const neigh = neighbourIds(db, wk);
  const cards = DAYS.map((d, i) => {
    const day = getDay(db, wk, d.k);
    const r = day.recipeId && recipeById(db, day.recipeId);
    const nCand = candidates(db, wk, d.k).length;
    const sameWeek = weekRecipeIds(db, wk, d.k);
    let warn = '';
    if (r && neigh.has(r.id)) warn = `<div class="warn">⚠ Also planned in the ${state.planWeek === 'next' ? 'current' : 'next'} week</div>`;
    else if (r && sameWeek.includes(r.id)) warn = `<div class="warn">⚠ Already planned on another day this week</div>`;
    if (r && r.active === false) warn += `<div class="warn">⚠ Recipe is inactive</div>`;
    const p = day.people;
    const step = (field, label) => `<span>${label}</span><span class="stepper">
      <button data-action="people" data-day="${d.k}" data-field="${field}" data-delta="-1" ${p[field] <= 0 ? 'disabled' : ''}>−</button>
      <span>${p[field]}</span>
      <button data-action="people" data-day="${d.k}" data-field="${field}" data-delta="1">+</button></span>`;
    return `<section class="card pday ${day.enabled ? '' : 'off'}">
      <div class="row"><h3>${d.n}</h3><span class="muted small">${fmtShort(dayDate(wk, i))}</span><span class="spacer"></span>
        <label class="small row" style="gap:4px"><input type="checkbox" data-action="toggle-day" data-day="${d.k}" ${day.enabled ? 'checked' : ''}> Dinner</label></div>
      ${day.enabled ? `
      <div class="sec">
        <span class="lab">Narrow the choice</span>
        <div class="row">
          ${multiSelect(`f-${wk}-${d.k}`, 'Any tag', db.tags, day.filter.tags, 'filter-tag', `data-day="${d.k}"`)}
          <select data-action="min-rating" data-day="${d.k}" title="Minimum rating">
            ${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${day.filter.minRating === n ? 'selected' : ''}>${n ? '★'.repeat(n) + '+' : 'Any rating'}</option>`).join('')}
          </select>
        </div>
        <div class="small muted" style="margin-top:4px">${nCand} matching recipe${nCand === 1 ? '' : 's'} available</div>
      </div>
      <div class="sec pick">
        <span class="lab">Dinner</span>
        ${r ? `<button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button> ${stars(r.rating)}` : '<span class="muted">Not chosen yet</span>'}
        ${warn}
        <div class="row" style="margin-top:6px">
          <button class="btn sm" data-action="reroll" data-day="${d.k}" title="Pick another random recipe for this day">🎲 Shuffle</button>
          ${r ? `<button class="btn sm" data-action="clear-day" data-day="${d.k}">Clear</button>` : ''}
        </div>
        ${recipeCombo(`m-${wk}-${d.k}`, d.k, active, day.recipeId, new Set([...neigh, ...sameWeek]))}
      </div>
      <div class="sec">
        <span class="lab">People</span>
        <div class="people">${step('adults', 'Adults')}${step('kidsBig', 'Big kids')}${step('kidsSmall', 'Small kids')}</div>
      </div>
      <div class="sec">
        <span class="lab">Snacks (optional)</span>
        <textarea rows="2" data-action="snacks" data-day="${d.k}" placeholder="e.g. apple slices, crackers">${esc(day.snacks)}</textarea>
      </div>` : '<div class="sec muted small">No dinner needed on this day.</div>'}
    </section>`;
  }).join('');
  return `<div class="master">
      <span class="seg">
        <button data-action="plan-week" data-week="current" class="${state.planWeek === 'current' ? 'active' : ''}">This week · ${weekRange(weekKey(0))}</button>
        <button data-action="plan-week" data-week="next" class="${state.planWeek === 'next' ? 'active' : ''}">Next week · ${weekRange(weekKey(1))}</button>
      </span>
      <span class="spacer"></span>
      <button class="btn primary" data-action="go">Go — suggest dinners</button>
    </div>
    ${db.recipes.length ? '' : '<p class="card">No recipes yet. Add some in the <b>Recipes</b> tab first.</p>'}
    <div class="plan-grid">${cards}</div>
    <p class="small muted">Suggestions never repeat a recipe within the week or from the ${state.planWeek === 'next' ? 'current' : 'next'} week. Choosing manually can override this.</p>`;
}

function renderRecipes() {
  const db = state.db;
  let list = db.recipes.filter(r => state.rInactive || r.active !== false);
  const q = state.rq.trim().toLowerCase();
  if (q) list = list.filter(r => (r.title + ' ' + (r.description || '')).toLowerCase().includes(q));
  if (state.rTags.length) list = list.filter(r => state.rTags.every(t => (r.tags || []).includes(t)));
  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    added: (a, b) => (b.created || '').localeCompare(a.created || ''),
    edited: (a, b) => (b.updated || '').localeCompare(a.updated || ''),
    tags: (a, b) => (a.tags || []).join().localeCompare((b.tags || []).join()) || a.title.localeCompare(b.title),
  };
  list.sort(sorters[state.rSort] || sorters.title);
  const total = db.recipes.length, inactive = db.recipes.filter(r => r.active === false).length;
  const rows = list.map(r => `<div class="card rrow ${r.active === false ? 'inactive' : ''}">
      <div class="main">
        <button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button>
        ${r.active === false ? '<span class="chip gray">inactive</span>' : ''}
        ${r.link ? ` <a href="${esc(r.link)}" target="_blank" rel="noopener" class="small">link ↗</a>` : ''}
        <div class="desc">${esc(r.description || '')}</div>
        <div>${(r.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>
      ${stars(r.rating)}
      ${Store.canEdit ? `<button class="btn sm" data-action="edit-recipe" data-id="${r.id}">Edit</button>` : ''}
    </div>`).join('');
  return `<div class="row" style="margin-bottom:12px">
      <input type="search" id="rq" placeholder="Search recipes" value="${esc(state.rq)}">
      ${multiSelect('rtags', 'Filter by tag', db.tags, state.rTags, 'rtag')}
      <select data-action="rsort">
        ${[['title', 'Sort: Title A–Z'], ['rating', 'Sort: Rating'], ['tags', 'Sort: Tags'], ['added', 'Sort: Newest'], ['edited', 'Sort: Recently edited']]
          .map(([v, l]) => `<option value="${v}" ${state.rSort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="small row" style="gap:4px"><input type="checkbox" data-action="rinactive" ${state.rInactive ? 'checked' : ''}> Show inactive (${inactive})</label>
      <span class="spacer"></span>
      ${Store.canEdit ? '<button class="btn primary" data-action="new-recipe">+ Add recipe</button>' : ''}
    </div>
    <p class="small muted">${list.length} of ${total} recipes</p>
    <div class="rlist">${rows || '<p class="muted">No recipes match.</p>'}</div>`;
}

function renderSettings() {
  const db = state.db;
  const tagRows = db.tags.map((t, i) => `<div class="tag-row">
      <span class="chip">${esc(t)}</span>
      <span class="muted small">${db.recipes.filter(r => (r.tags || []).includes(t)).length} recipes</span>
      <span class="spacer"></span>
      ${Store.canEdit ? `<button class="btn sm" data-action="rename-tag" data-i="${i}">Rename</button>
      <button class="btn sm danger" data-action="delete-tag" data-i="${i}">Delete</button>` : ''}
    </div>`).join('');
  return `<div class="weeks">
    <section class="card">
      <h2>Tags</h2>
      ${tagRows || '<p class="muted">No tags.</p>'}
      ${Store.canEdit ? `<div class="row" style="margin-top:10px"><input type="text" id="newtag" placeholder="New tag"><button class="btn" data-action="add-tag">Add tag</button></div>` : ''}
    </section>
  </div>`;
}

// ---------------------------------------------------------------- modals
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }

function showRecipe(id) {
  const r = recipeById(state.db, id);
  if (!r) return toast('Recipe not found (maybe deleted).');
  const last = lastPlanned(state.db, id);
  openModal(`<div class="form">
    <div class="row"><h2 style="margin:0">${esc(r.title)}</h2>${r.active === false ? '<span class="chip gray">inactive</span>' : ''}</div>
    <div>${stars(r.rating)} ${(r.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    ${r.link ? `<div><a href="${esc(r.link)}" target="_blank" rel="noopener">Open recipe ↗</a><div class="small muted" style="word-break:break-all">${esc(r.link)}</div></div>` : ''}
    ${r.description ? `<div class="desc-full">${esc(r.description)}</div>` : '<div class="muted">No description.</div>'}
    <div class="small muted">${last ? `Last planned: ${parseIso(last).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not planned yet'}</div>
    <div class="row"><span class="spacer"></span>
      ${Store.canEdit ? `<button class="btn" data-action="edit-recipe" data-id="${r.id}">Edit</button>` : ''}
      <button class="btn" data-action="close">Close</button></div>
  </div>`);
}

let draft = null; // recipe being edited
function editRecipe(id) {
  const r = id ? recipeById(state.db, id) : null;
  draft = r ? clone(r) : { id: null, title: '', link: '', description: '', tags: [], rating: 0, active: true };
  renderEditor();
}
function renderEditor() {
  const d = draft;
  const allTags = [...new Set([...state.db.tags, ...d.tags])];
  openModal(`<form class="form" id="rform">
    <h2 style="margin:0">${d.id ? 'Edit recipe' : 'New recipe'}</h2>
    <label class="f">Title *<input type="text" name="title" value="${esc(d.title)}" required></label>
    <label class="f">Link<input type="url" name="link" value="${esc(d.link)}" placeholder="https://…"></label>
    <label class="f">Description<textarea name="description" rows="4">${esc(d.description)}</textarea></label>
    <div><div class="small muted" style="margin-bottom:4px">Rating</div>
      <span class="star-in">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-action="d-star" data-n="${n}" class="${n <= d.rating ? 'on' : ''}">★</button>`).join('')}</span>
      ${d.rating ? '<button type="button" class="btn sm" data-action="d-star" data-n="0">clear</button>' : ''}</div>
    <div><div class="small muted" style="margin-bottom:4px">Tags</div>
      <div class="tagboxes">${allTags.map(t => `<label><input type="checkbox" data-action="d-tag" data-value="${esc(t)}" ${d.tags.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('') || '<span class="muted small">No tags yet</span>'}</div>
      <div class="row" style="margin-top:6px"><input type="text" id="d-newtag" placeholder="New tag"><button type="button" class="btn sm" data-action="d-addtag">Add</button></div></div>
    <label class="small row" style="gap:6px"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> Active (inactive recipes are never suggested)</label>
    <div class="row"><span class="spacer"></span>
      <button type="button" class="btn" data-action="close">Cancel</button>
      <button type="submit" class="btn primary">Save</button></div>
  </form>`);
  $('#rform').addEventListener('submit', e => { e.preventDefault(); saveDraft(); });
  $('#rform [name=title]').focus();
}
function syncDraftFields() {
  const f = $('#rform'); if (!f) return;
  draft.title = f.title.value; draft.link = f.link.value; draft.description = f.description.value; draft.active = f.active.checked;
}
function saveDraft() {
  syncDraftFields();
  const d = { ...draft, title: draft.title.trim(), link: draft.link.trim(), description: draft.description.trim() };
  if (!d.title) return toast('Please enter a title.');
  const now = new Date().toISOString();
  const isNew = !d.id;
  if (isNew) { d.id = uid(); d.created = now; }
  d.updated = now;
  const newTags = d.tags.filter(t => !state.db.tags.includes(t));
  mutate(db => {
    newTags.forEach(t => { if (!db.tags.includes(t)) db.tags.push(t); });
    const i = db.recipes.findIndex(r => r.id === d.id);
    if (i >= 0) db.recipes[i] = { ...db.recipes[i], ...d }; else db.recipes.push(d);
  }, `${isNew ? 'Add' : 'Edit'} recipe: ${d.title}`);
  closeModal();
}

// ---------------------------------------------------------------- planner actions
function planWk() { return weekKey(state.planWeek === 'next' ? 1 : 0); }
function goSuggest() {
  const wk = planWk();
  const db = state.db;
  const assigned = DAYS.filter(d => getDay(db, wk, d.k).enabled && getDay(db, wk, d.k).recipeId).length;
  if (assigned && !confirm(`Replace the ${assigned} dinner(s) already chosen for this week with new suggestions?`)) return;
  const missing = [];
  mutate(db => {
    // Clear first, so the days of this week don't block each other.
    DAYS.forEach(d => { if (getDay(db, wk, d.k).enabled) ensureDay(db, wk, d.k).recipeId = null; });
    // Fill the most restrictive days first, so filtered days still find a match.
    const order = DAYS.filter(d => getDay(db, wk, d.k).enabled).sort((a, b) => candidates(db, wk, a.k).length - candidates(db, wk, b.k).length);
    order.forEach(d => {
      const r = pickRandom(candidates(db, wk, d.k));
      ensureDay(db, wk, d.k).recipeId = r ? r.id : null;
      if (!r) missing.push(d.n);
    });
  }, `Suggest dinners for week of ${wk}`);
  if (missing.length) toast(`No matching recipe for ${missing.join(', ')} — loosen the filter or add recipes.`, 6000);
}
function reroll(k) {
  const wk = planWk();
  const cur = getDay(state.db, wk, k).recipeId;
  let r = pickRandom(candidates(state.db, wk, k, cur ? [cur] : []));
  if (!r && cur) return toast('No other matching recipe available for this day.');
  if (!r) return toast('No matching recipe — loosen the filter or add recipes.');
  mutate(db => { ensureDay(db, wk, k).recipeId = r.id; }, `Shuffle ${k} (${wk}): ${r.title}`);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; state.openMs = null; lsSet('dinnerplanner.tab', state.tab); render(); return; }
  if (e.target.id === 'modal') { closeModal(); return; }
  // close multi-selects when clicking outside of them
  const ms = e.target.closest('details.ms');
  document.querySelectorAll('details.ms[open]').forEach(d => { if (d !== ms) d.open = false; });

  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT') || el.tagName === 'TEXTAREA') return;
  const a = el.dataset.action, k = el.dataset.day, wk = planWk();
  switch (a) {
    case 'show-recipe': showRecipe(el.dataset.id); break;
    case 'edit-recipe': editRecipe(el.dataset.id); break;
    case 'new-recipe': editRecipe(null); break;
    case 'close': closeModal(); break;
    case 'goto-plan': state.tab = 'plan'; state.planWeek = el.dataset.week; render(); break;
    case 'plan-week': state.planWeek = el.dataset.week; state.openMs = null; render(); break;
    case 'go': goSuggest(); break;
    case 'reroll': reroll(k); break;
    case 'manual-pick': {
      const id = el.dataset.id;
      state.openMs = null;
      mutate(db => { ensureDay(db, wk, k).recipeId = id; }, `Choose ${k} (${wk})`);
      break;
    }
    case 'clear-day': mutate(db => { ensureDay(db, wk, k).recipeId = null; }, `Clear ${k} (${wk})`); break;
    case 'people': {
      const f = el.dataset.field, delta = Number(el.dataset.delta);
      mutate(db => { const p = ensureDay(db, wk, k).people; p[f] = Math.max(0, (p[f] || 0) + delta); }, `People ${k} (${wk})`);
      break;
    }
    case 'd-star': syncDraftFields(); draft.rating = Number(el.dataset.n); renderEditor(); break;
    case 'd-addtag': {
      syncDraftFields();
      const t = $('#d-newtag').value.trim();
      if (t && !draft.tags.includes(t)) draft.tags.push(t);
      renderEditor(); break;
    }
    case 'add-tag': {
      const t = $('#newtag').value.trim();
      if (!t) return;
      if (state.db.tags.includes(t)) return toast('That tag already exists.');
      mutate(db => { if (!db.tags.includes(t)) db.tags.push(t); }, `Add tag: ${t}`);
      break;
    }
    case 'rename-tag': {
      const old = state.db.tags[Number(el.dataset.i)];
      const nu = (prompt('Rename tag', old) || '').trim();
      if (!nu || nu === old) return;
      if (state.db.tags.includes(nu)) return toast('That tag already exists.');
      mutate(db => renameTag(db, old, nu), `Rename tag: ${old} → ${nu}`);
      break;
    }
    case 'delete-tag': {
      const t = state.db.tags[Number(el.dataset.i)];
      if (!confirm(`Delete tag "${t}"? It is removed from all recipes and filters.`)) return;
      mutate(db => renameTag(db, t, null), `Delete tag: ${t}`);
      break;
    }
  }
});

// Rename (nu = string) or delete (nu = null) a tag everywhere.
function renameTag(db, old, nu) {
  const fix = arr => { const out = arr.map(t => t === old ? nu : t).filter(Boolean); return [...new Set(out)]; };
  db.tags = fix(db.tags);
  db.recipes.forEach(r => { r.tags = fix(r.tags || []); });
  Object.values(db.weeks).forEach(w => Object.values(w.days || {}).forEach(d => { if (d.filter?.tags) d.filter.tags = fix(d.filter.tags); }));
}

document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.action, k = el.dataset.day, wk = planWk();
  if (!a) return;
  const keepOpen = () => { const ms = el.closest('details.ms'); state.openMs = ms ? ms.dataset.ms : null; };
  switch (a) {
    case 'toggle-day': mutate(db => { ensureDay(db, wk, k).enabled = el.checked; }, `${el.checked ? 'Enable' : 'Disable'} ${k} (${wk})`); break;
    case 'filter-tag': keepOpen(); mutate(db => {
      const f = ensureDay(db, wk, k).filter; const v = el.dataset.value;
      f.tags = el.checked ? [...new Set([...f.tags, v])] : f.tags.filter(t => t !== v);
    }, `Filter ${k} (${wk})`); break;
    case 'min-rating': mutate(db => { ensureDay(db, wk, k).filter.minRating = Number(el.value); }, `Filter ${k} (${wk})`); break;
    case 'snacks': { const v = el.value; mutate(db => { ensureDay(db, wk, k).snacks = v; }, `Snacks ${k} (${wk})`); break; }
    case 'rtag': keepOpen(); state.rTags = el.checked ? [...state.rTags, el.dataset.value] : state.rTags.filter(t => t !== el.dataset.value); render(); break;
    case 'rsort': state.rSort = el.value; render(); break;
    case 'rinactive': state.rInactive = el.checked; render(); break;
    case 'd-tag': syncDraftFields(); draft.tags = el.checked ? [...draft.tags, el.dataset.value] : draft.tags.filter(t => t !== el.dataset.value); break;
  }
});
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('combo-q')) return;
  const visible = [...e.target.closest('.ms-pop').querySelectorAll('.combo-item:not(.hidden)')];
  if (e.key === 'Enter') { e.preventDefault(); visible[0]?.click(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); visible[0]?.focus(); }
});
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('combo-item') || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const visible = [...e.target.closest('.combo-list').querySelectorAll('.combo-item:not(.hidden)')];
  const i = visible.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1);
  if (i < 0) e.target.closest('.ms-pop').querySelector('.combo-q').focus(); else visible[i]?.focus();
});
document.addEventListener('input', e => {
  if (e.target.classList.contains('combo-q')) { filterCombo(e.target); return; }
  if (e.target.id === 'rq') {
    state.rq = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const q = $('#rq'); q.focus(); q.setSelectionRange(pos, pos);
  }
});
document.addEventListener('toggle', e => {
  if (!e.target.matches?.('details.ms')) return;
  state.openMs = e.target.open ? e.target.dataset.ms : (state.openMs === e.target.dataset.ms ? null : state.openMs);
  if (e.target.open) e.target.querySelector('.combo-q')?.focus();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
// Pick up changes made by others when coming back to the tab.
// Skipped while the user is typing or has a dropdown open — a re-render would wipe it.
window.addEventListener('focus', () => {
  const busy = !$('#modal').classList.contains('hidden') || document.querySelector('details.ms[open]')
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!busy) reload(true);
});
window.addEventListener('beforeunload', e => { if (pending.length || saving) { e.preventDefault(); e.returnValue = ''; } });

reload();
