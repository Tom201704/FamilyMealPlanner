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
  fri: { adults: 2, kidsBig: 0, kidsSmall: 1 },
};
const MAX_STARS = 3;
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
// A day is over once its date is before today. Past days are shown but locked.
function isPast(wk, k) { return isoDate(dayDate(wk, DAYS.findIndex(d => d.k === k))) < isoDate(new Date()); }

// Playful emoji guessed from the recipe title (falls back to a plate).
const FOOD_EMOJI = [
  [/pizza/i, '🍕'], [/burger/i, '🍔'], [/taco|burrito|wrap|fajita|quesadilla/i, '🌮'], [/ramen|noodle|nudel|pho|udon|pad thai/i, '🍜'],
  [/spaghetti|pasta|lasagn|penne|tagliatelle|gnocchi|ravioli|tortellini|carbonara|bolognese|macaroni|magronen/i, '🍝'],
  [/curry|dal|dhal|masala|tikka/i, '🍛'], [/sushi|maki/i, '🍣'], [/fish|lachs|salmon|fisch|cod|tuna|thon|shrimp|crevette|prawn/i, '🐟'],
  [/chicken|poulet|huhn|hähnchen|wings/i, '🍗'], [/steak|beef|rind|veal|kalb|escalope|schnitzel|meat|fleisch|pork|schwein/i, '🥩'],
  [/soup|suppe|minestrone|soupe|broth/i, '🍲'], [/salad|salat/i, '🥗'], [/rice|reis|risotto|paella|biryani/i, '🍚'],
  [/egg|eier|shakshuka|omelet|frittata/i, '🍳'], [/crêpe|crepe|pancake|waffle|pfannkuchen/i, '🥞'], [/toast|sandwich|bread|brot/i, '🥪'],
  [/quiche|tart|wähe|pie|kuchen/i, '🥧'], [/fondue|raclette|cheese|käse/i, '🧀'], [/potato|kartoffel|rösti|gratin|mash|fries/i, '🥔'],
  [/sausage|wurst|bratwurst/i, '🌭'], [/vegetable|gemüse|veggie|ratatouille/i, '🥦'], [/couscous|bulgur|bowl/i, '🥣'],
];
const SNACK_EMOJI = [
  [/cookie|keks|guetzli|biscuit|biskuit/i, '🍪'], [/muffin|cupcake/i, '🧁'], [/cake|kuchen|torte|brownie/i, '🍰'],
  [/donut|doughnut|berliner/i, '🍩'], [/chocolate|schoko|choco/i, '🍫'], [/ice ?cream|glace|\beis\b/i, '🍦'],
  [/candy|bonbon|gumm|sweets|süss|lolli|marshmallow/i, '🍬'], [/pudding|creme|crème|flan/i, '🍮'], [/popcorn/i, '🍿'],
  [/pretzel|brezel|salzstange/i, '🥨'], [/chip|crisp/i, '🍟'], [/cracker|reiswaffel|rice cake|zwieback/i, '🍘'],
  [/smoothie|shake/i, '🥤'], [/yog|joghurt|quark/i, '🥛'],
  [/banana|banane/i, '🍌'], [/apple|apfel|äpfel/i, '🍎'], [/grape|traube/i, '🍇'], [/berr|beere/i, '🍓'],
  [/nut|nuss|nüss/i, '🥜'], [/cheese|käse/i, '🧀'],
  [/fruit|frucht|früchte|obst/i, '🍉'], [/carrot|karotte|rüebli|cucumber|gurke|veg|gemüse/i, '🥕'],
];
// Groceries: English and German. Order matters (pineapple before apple, ice cream before cream …).
const GROCERY_EMOJI = [
  [/toilet|klopapier|wc-?papier/i, '🧻'], [/diaper|windel/i, '👶'], [/soap|seife|shampoo|dusch|lotion/i, '🧴'],
  [/detergent|waschmittel|spülmittel|tabs|schwamm|sponge/i, '🧽'], [/tissue|taschentuch|kleenex/i, '🤧'], [/battery|batterie/i, '🔋'],
  [/juice|saft/i, '🧃'], [/coffee|kaffee/i, '☕'], [/\btea\b|\btee\b/i, '🍵'], [/beer|bier/i, '🍺'], [/wine|wein/i, '🍷'],
  [/ice ?cream|glace|\beis\b/i, '🍦'], [/watermelon|melon/i, '🍉'], [/water|wasser|mineral/i, '💧'],
  [/buttermilk|milk|milch|lait/i, '🥛'], [/butter|beurre/i, '🧈'], [/eggplant|aubergine/i, '🍆'], [/\begg|\beier|œuf/i, '🥚'],
  [/cheese|käse|fromage|mozzarella|parmesan|gruy|emmentaler|feta|raclette/i, '🧀'], [/yog|joghurt|quark/i, '🥛'],
  [/cream|rahm|sahne/i, '🥛'], [/cereal|müesli|muesli|cornflakes|granola|oat|hafer/i, '🥣'],
  [/bread|brot|bröt|pain|baguette|zopf|toast|gipfeli|croissant/i, '🍞'], [/pineapple|\bananas/i, '🍍'],
  [/apple|apfel|äpfel|pomme/i, '🍎'], [/banana|banane/i, '🍌'], [/orange|clementine|mandarin/i, '🍊'],
  [/lemon|zitrone|citron|lime/i, '🍋'], [/grape|traube/i, '🍇'], [/strawberr|erdbeer|fraise/i, '🍓'],
  [/blueberr|heidelbeer|berr|beere/i, '🫐'], [/pear|birne/i, '🍐'], [/peach|pfirsich|nectarin|apricot|aprikose/i, '🍑'],
  [/cherr|kirsch/i, '🍒'], [/kiwi/i, '🥝'], [/mango/i, '🥭'], [/avocado/i, '🥑'], [/tomat/i, '🍅'],
  [/potato|kartoffel/i, '🥔'], [/carrot|karotte|rüebli|möhre/i, '🥕'], [/onion|zwiebel|oignon|leek|lauch/i, '🧅'],
  [/garlic|knoblauch/i, '🧄'], [/salad|salat|lettuce|spinach|spinat/i, '🥬'], [/broccoli|brokkoli|cauliflower|blumenkohl/i, '🥦'],
  [/cucumber|gurke|zucchin/i, '🥒'], [/chili/i, '🌶️'], [/pepper|paprika|peperoni/i, '🫑'], [/corn|mais/i, '🌽'],
  [/mushroom|pilz|champignon/i, '🍄'], [/ginger|ingwer/i, '🫚'], [/herb|basil|kräuter|petersil|parsley/i, '🌿'],
  [/chicken|poulet|huhn|hähnchen/i, '🍗'], [/bacon|speck/i, '🥓'], [/\bham\b|schinken/i, '🍖'],
  [/sausage|wurst|würst|cervelat/i, '🌭'], [/beef|rind|steak|hack|mince|meat|fleisch|pork|schwein|veal|kalb/i, '🥩'],
  [/fish|fisch|lachs|salmon|thon|tuna|cod/i, '🐟'], [/shrimp|crevette|garnele|prawn/i, '🦐'], [/tofu/i, '🧊'],
  [/rice|reis|risotto/i, '🍚'], [/pasta|spaghetti|nudel|penne|teigwaren|fusilli|lasagn/i, '🍝'],
  [/flour|mehl/i, '🌾'], [/sugar|zucker/i, '🍬'], [/salt|salz/i, '🧂'], [/\boil\b|\böl\b|olive/i, '🫒'],
  [/honey|honig/i, '🍯'], [/jam|konfitüre|marmelade|nutella/i, '🍓'], [/chocolate|schoko/i, '🍫'],
  [/cookie|keks|guetzli|biscuit/i, '🍪'], [/cake|kuchen/i, '🍰'], [/chip|crisp/i, '🍟'], [/nut|nuss|nüss|mandel|almond/i, '🥜'],
  [/sauce|ketchup|mayo|senf|mustard/i, '🥫'], [/can\b|dose|bohnen|beans|lentil|linsen|kichererbs|chickpea/i, '🥫'],
  [/frozen|tiefkühl|pizza/i, '🍕'], [/flower|blume/i, '💐'],
];
function emojiFrom(tables, text, fallback) { for (const t of tables) for (const [re, e] of t) if (re.test(text || '')) return e; return fallback; }
function foodEmoji(title) { return emojiFrom([FOOD_EMOJI], title, '🍽️'); }
function snackEmoji(title) { return emojiFrom([SNACK_EMOJI, GROCERY_EMOJI], title, '🍪'); }
function groceryEmoji(name) { return emojiFrom([GROCERY_EMOJI, FOOD_EMOJI, SNACK_EMOJI], name, '🛒'); }
const isSnack = r => r?.kind === 'snack';
const TYPE_DINNER = 'type:dinner', TYPE_SNACK = 'type:snack';
function emojiOf(r) { return isSnack(r) ? snackEmoji(r.title) : foodEmoji(r.title); }
function hueOf(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

function stars(n) {
  n = n || 0;
  return `<span class="stars" title="${n} of ${MAX_STARS}">${'★'.repeat(n)}<span class="off">${'★'.repeat(MAX_STARS - n)}</span></span>`;
}
function peopleText(p) {
  const parts = [`${p.adults} adult${p.adults === 1 ? '' : 's'}`];
  if (p.kidsBig) parts.push(`${p.kidsBig} big kid${p.kidsBig === 1 ? '' : 's'}`);
  if (p.kidsSmall) parts.push(`${p.kidsSmall} small kid${p.kidsSmall === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
const PEOPLE_FIELDS = ['adults', 'kidsBig', 'kidsSmall'];
const peopleChanged = (k, p) => PEOPLE_FIELDS.some(f => (p[f] || 0) !== DEFAULT_PEOPLE[k][f]);
// `past`: no highlight — the usual headcount may have changed since.
function peopleLine(k, p, past = false) {
  const chg = !past && peopleChanged(k, p);
  return `<div class="dmeta ${chg ? 'chg' : ''}" ${chg ? `title="Usually: ${peopleText(DEFAULT_PEOPLE[k])}"` : ''}>👥 ${peopleText(p)}${chg ? ' <span class="chg-tag">changed</span>' : ''}</div>`;
}
// Snacks of a day: picked snack items (clickable) plus the free text.
function snackLine(db, day) {
  const items = (day.snackIds || []).map(id => recipeById(db, id)).filter(Boolean)
    .map(s => `<button class="title-link" data-action="show-recipe" data-id="${s.id}">${esc(s.title)}</button>`);
  if (day.snacks?.trim()) items.push(esc(day.snacks.trim()));
  return items.length ? `<div class="snacks">🍪 ${items.join(', ')}</div>` : '';
}

// ---------------------------------------------------------------- data model
function emptyDb() {
  return { version: 1, ratingScale: MAX_STARS, defaultsVersion: 2, tags: ["Tom doesn't like", 'Make ahead'], recipes: [], weeks: {}, groceries: [], groceryRecent: [] };
}
function normalizeDb(db) {
  db = db && typeof db === 'object' ? db : emptyDb();
  db.version ??= 1;
  db.tags = Array.isArray(db.tags) ? db.tags : [];
  db.recipes = Array.isArray(db.recipes) ? db.recipes : [];
  db.weeks = db.weeks && typeof db.weeks === 'object' ? db.weeks : {};
  db.settings = { preferRated: true, ...(db.settings || {}) };
  db.groceries = Array.isArray(db.groceries) ? db.groceries : [];
  db.groceryRecent = Array.isArray(db.groceryRecent) ? db.groceryRecent : [];
  // Last link used per grocery name (lower case), so "Recently bought" can re-add it with its link.
  db.groceryLinks = db.groceryLinks && typeof db.groceryLinks === 'object' ? db.groceryLinks : {};
  // Friday default gained the small kid. Upcoming Fridays that still carry the
  // old default (2 adults, no kids) get it too; past Fridays stay as they were.
  if ((db.defaultsVersion || 1) < 2) {
    const today = isoDate(new Date());
    Object.entries(db.weeks).forEach(([wk, w]) => {
      const p = w.days?.fri?.people;
      if (p && isoDate(dayDate(wk, 4)) >= today && p.adults === 2 && !p.kidsBig && !p.kidsSmall) p.kidsSmall = 1;
    });
    db.defaultsVersion = 2;
  }
  // One-time conversion from the old 1–5 scale: ×3/5, rounded (1–2→1, 3–4→2, 5→3).
  // Deterministic and flagged, so every client converts identically and only once.
  if (db.ratingScale !== MAX_STARS) {
    const conv = n => n ? Math.max(1, Math.round(n * MAX_STARS / 5)) : 0;
    db.recipes.forEach(r => { r.rating = conv(r.rating); });
    Object.values(db.weeks).forEach(w => Object.values(w.days || {}).forEach(d => { if (d.filter?.minRating) d.filter.minRating = conv(d.filter.minRating); }));
    db.ratingScale = MAX_STARS;
  }
  db.recipes.forEach(r => { r.rating = Math.min(MAX_STARS, r.rating || 0); });
  return db;
}
function defaultDay(k) {
  return { enabled: true, recipeId: null, custom: '', people: { ...DEFAULT_PEOPLE[k] }, snacks: '', snackIds: [], filter: { tags: [], excludeTags: [], minRating: 0 } };
}
// Read-only view of a day (does not create anything).
function getDay(db, wk, k) {
  const d = db.weeks[wk]?.days?.[k];
  return d ? { ...defaultDay(k), ...d, people: { ...DEFAULT_PEOPLE[k], ...(d.people || {}) }, filter: { tags: [], excludeTags: [], minRating: 0, ...(d.filter || {}) } } : defaultDay(k);
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
// A recipe is not repeated within NO_REPEAT_WEEKS weeks before or after the planned week.
const NO_REPEAT_WEEKS = 2;
// Map: recipe id → the nearby weeks (Monday ISO keys) it is planned in.
function neighbourWeeks(db, wk) {
  const m = parseIso(wk), out = new Map();
  for (let i = -NO_REPEAT_WEEKS; i <= NO_REPEAT_WEEKS; i++) {
    if (!i) continue;
    const w = isoDate(addDays(m, 7 * i));
    weekRecipeIds(db, w).forEach(id => out.set(id, [...(out.get(id) || []), w]));
  }
  return out;
}
function neighbourIds(db, wk) { return new Set(neighbourWeeks(db, wk).keys()); }
function candidates(db, wk, k, extraExclude = []) {
  const day = getDay(db, wk, k);
  const ex = new Set([...neighbourIds(db, wk), ...weekRecipeIds(db, wk, k), ...extraExclude]);
  return db.recipes.filter(r =>
    r.active !== false && !isSnack(r) &&
    (r.rating || 0) >= (day.filter.minRating || 0) &&
    day.filter.tags.every(t => (r.tags || []).includes(t)) &&
    !day.filter.excludeTags.some(t => (r.tags || []).includes(t)) &&
    !ex.has(r.id));
}
// Random pick. With "Prefer higher-rated", the chance is proportional to the
// stars: 3★ is picked 3× as often as 1★. Unrated recipes count as 2★.
const ratingWeight = r => r.rating || 2;
function pickRandom(arr, weighted = state.db.settings.preferRated) {
  if (!arr.length) return null;
  if (!weighted) return arr[Math.floor(Math.random() * arr.length)];
  let x = Math.random() * arr.reduce((s, r) => s + ratingWeight(r), 0);
  for (const r of arr) { x -= ratingWeight(r); if (x < 0) return r; }
  return arr[arr.length - 1];
}
function lastPlanned(db, id) {
  let last = null;
  for (const [wk, w] of Object.entries(db.weeks)) {
    DAYS.forEach((d, i) => {
      const day = w.days?.[d.k];
      if (day && day.enabled !== false && (day.recipeId === id || (day.snackIds || []).includes(id))) {
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
  rq: '', rTags: [], rExTags: [], rSort: 'title', rInactive: true,
  loadError: null,
};

function setStatus(text, cls = '') { const el = $('#status'); el.textContent = text; el.className = 'status ' + cls; }
let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// Multi-select dropdown with checkboxes. `id` keeps it open across re-renders.
// Options are tag names, or {value, label, sep} (sep: draw a divider after it).
function multiSelect(id, label, options, selected, action, extra = '', prefix = '', cls = '') {
  options = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const lab = v => { const o = options.find(x => x.value === v); return o ? o.short || o.label : v; };
  const sum = selected.length ? prefix + selected.map(lab).join(', ') : label;
  return `<details class="ms ${cls} ${selected.length ? 'has' : ''}" data-ms="${esc(id)}" ${state.openMs === id ? 'open' : ''}>
    <summary title="${esc(sum)}">${esc(sum)}</summary>
    <div class="ms-pop">
      ${options.length ? options.map(o => `<label><input type="checkbox" data-action="${action}" data-value="${esc(o.value)}" ${extra} ${selected.includes(o.value) ? 'checked' : ''}> ${esc(o.label)}</label>${o.sep ? '<div class="ms-sep"></div>' : ''}`).join('') : '<div class="muted small" style="padding:4px 6px">No tags yet</div>'}
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
// Snack picker: searchable checkbox list of snack items (optional, next to the free text).
function snackPicker(id, dayKey, snacks, selected) {
  const names = selected.map(i => recipeById(state.db, i)?.title).filter(Boolean);
  const items = snacks.map(s => `<label class="combo-item" data-q="${esc(s.title.toLowerCase())}">
      <input type="checkbox" data-action="snack-pick" data-day="${dayKey}" data-id="${s.id}" ${selected.includes(s.id) ? 'checked' : ''}>
      <span class="ct">${snackEmoji(s.title)} ${esc(s.title)}</span></label>`).join('');
  return `<details class="ms combo snackpick ${names.length ? 'has' : ''}" data-ms="${esc(id)}" ${state.openMs === id ? 'open' : ''}>
    <summary title="${esc(names.join(', '))}">${names.length ? '🍪 ' + esc(names.join(', ')) : 'Pick from snacks…'}</summary>
    <div class="ms-pop">
      <input type="search" class="combo-q" placeholder="Search ${snacks.length} snacks…" autocomplete="off">
      <div class="combo-list">${items}</div>
      <div class="combo-empty muted small hidden" style="padding:6px">No snack matches.</div>
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
  const n = state.db.groceries.length;
  const gc = $('#gcount'); if (gc) { gc.textContent = n || ''; gc.classList.toggle('hidden', !n); }
  app.innerHTML = ({ overview: renderOverview, plan: renderPlan, recipes: renderRecipes, groceries: renderGroceries, settings: renderSettings }[state.tab] || renderOverview)();
}

function renderWeekCard(wk, label) {
  const today = isoDate(new Date());
  const days = DAYS.map((d, i) => {
    const day = getDay(state.db, wk, d.k);
    const date = dayDate(wk, i);
    const r = day.recipeId && recipeById(state.db, day.recipeId);
    let meal, emoji;
    if (!day.enabled) { meal = '<div class="meal none">No dinner planned</div>'; emoji = '🌙'; }
    else if (r) { meal = `<div class="meal"><button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button></div>`; emoji = foodEmoji(r.title); }
    else if (day.custom) { meal = `<div class="meal custom">${esc(day.custom)}</div>`; emoji = '✏️'; }
    else { meal = '<div class="meal none">Not chosen yet</div>'; emoji = '🤔'; }
    const isToday = isoDate(date) === today;
    return `<div class="day d-${d.k} ${isToday ? 'today' : ''} ${isoDate(date) < today ? 'past' : ''}">
      <div class="dbadge"><span>${d.n.slice(0, 3)}</span><b>${date.getDate()}</b></div>
      <div class="dbody">
        ${isToday ? '<span class="today-pill">Today</span>' : ''}
        ${meal}
        ${day.enabled ? peopleLine(d.k, day.people, isoDate(date) < today) : ''}
        ${day.enabled ? snackLine(state.db, day) : ''}
      </div>
      <div class="demoji" aria-hidden="true">${emoji}</div>
    </div>`;
  }).join('');
  return `<section class="card week">
    <div class="week-head"><span class="lbl">${label === 'This week' ? '🗓️' : '🚀'} ${label}</span><span class="muted">Week ${isoWeekNo(parseIso(wk))} · ${weekRange(wk)}</span>
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
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const active = db.recipes.filter(r => r.active !== false && !isSnack(r)).sort(byTitle);
  const neighW = neighbourWeeks(db, wk), neigh = new Set(neighW.keys());
  const cards = DAYS.map((d, i) => {
    const day = getDay(db, wk, d.k);
    const r = day.recipeId && recipeById(db, day.recipeId);
    if (isPast(wk, d.k)) {
      const meal = !day.enabled ? '<span class="none">No dinner planned</span>'
        : r ? `<button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button> ${stars(r.rating)}`
        : day.custom ? `<span class="custom">✏️ ${esc(day.custom)}</span>` : '<span class="none">Nothing planned</span>';
      return `<section class="card pday past d-${d.k}">
        <div class="row phead"><h3>${d.n}</h3><span class="muted small">${fmtShort(dayDate(wk, i))}</span><span class="spacer"></span><span class="chip gray">over</span></div>
        <div class="sec">${meal}</div>
        ${day.enabled ? `<div class="sec small">${peopleLine(d.k, day.people, true)}${snackLine(db, day)}</div>` : ''}
      </section>`;
    }
    const nCand = candidates(db, wk, d.k).length;
    const sameWeek = weekRecipeIds(db, wk, d.k);
    let warn = '';
    if (r && neigh.has(r.id)) warn = `<div class="warn">⚠ Also planned in ${neighW.get(r.id).map(w => `week ${isoWeekNo(parseIso(w))} (${weekRange(w)})`).join(', ')}</div>`;
    else if (r && sameWeek.includes(r.id)) warn = `<div class="warn">⚠ Already planned on another day this week</div>`;
    if (r && r.active === false) warn += `<div class="warn">⚠ Recipe is inactive</div>`;
    if (isSnack(r)) warn += `<div class="warn">⚠ This is a snack, not a dinner recipe</div>`;
    const p = day.people, pChg = peopleChanged(d.k, p);
    const step = (field, label) => {
      const def = DEFAULT_PEOPLE[d.k][field], chg = p[field] !== def;
      return `<span class="${chg ? 'chg' : ''}">${label}${chg ? ` <span class="usual">usually ${def}</span>` : ''}</span><span class="stepper ${chg ? 'chg' : ''}">
      <button data-action="people" data-day="${d.k}" data-field="${field}" data-delta="-1" ${p[field] <= 0 ? 'disabled' : ''}>−</button>
      <span>${p[field]}</span>
      <button data-action="people" data-day="${d.k}" data-field="${field}" data-delta="1">+</button></span>`;
    };
    const snacks = db.recipes.filter(x => isSnack(x) && (x.active !== false || day.snackIds.includes(x.id))).sort(byTitle);
    return `<section class="card pday d-${d.k} ${day.enabled ? '' : 'off'}">
      <div class="row phead"><h3>${d.n}</h3><span class="muted small">${fmtShort(dayDate(wk, i))}</span><span class="spacer"></span>
        <label class="small row" style="gap:4px"><input type="checkbox" data-action="toggle-day" data-day="${d.k}" ${day.enabled ? 'checked' : ''}> Dinner</label></div>
      ${day.enabled ? `
      <div class="sec">
        <span class="lab">Narrow the choice</span>
        <div class="row">
          ${multiSelect(`f-${wk}-${d.k}`, 'Must have: any', db.tags, day.filter.tags, 'filter-tag', `data-day="${d.k}"`, 'Must have: ', 'inc')}
          ${multiSelect(`x-${wk}-${d.k}`, 'Exclude: none', db.tags, day.filter.excludeTags, 'filter-extag', `data-day="${d.k}"`, 'Exclude: ', 'exc')}
          <select data-action="min-rating" data-day="${d.k}" title="Minimum rating">
            ${[0, 1, 2, 3].map(n => `<option value="${n}" ${day.filter.minRating === n ? 'selected' : ''}>${n ? '★'.repeat(n) + '+' : 'Any rating'}</option>`).join('')}
          </select>
        </div>
        <div class="small muted" style="margin-top:4px">${nCand} matching recipe${nCand === 1 ? '' : 's'} available</div>
      </div>
      <div class="sec pick">
        <span class="lab">Dinner</span>
        ${r ? `<button class="title-link" data-action="show-recipe" data-id="${r.id}">${esc(r.title)}</button> ${stars(r.rating)}`
          : day.custom ? `<span class="custom">✏️ ${esc(day.custom)}</span>` : '<span class="muted">Not chosen yet</span>'}
        ${warn}
        <div class="row" style="margin-top:6px">
          <button class="btn sm" data-action="reroll" data-day="${d.k}" title="Pick another random recipe for this day">🎲 Shuffle</button>
          ${r || day.custom ? `<button class="btn sm" data-action="clear-day" data-day="${d.k}">Clear</button>` : ''}
        </div>
        ${recipeCombo(`m-${wk}-${d.k}`, d.k, active, day.recipeId, new Set([...neigh, ...sameWeek]))}
        <input type="text" class="full-in" data-action="custom" data-day="${d.k}" value="${esc(day.custom)}"
          placeholder="…or write your own" title="e.g. “Something with the chicken” — kept when you press Go">
      </div>
      <div class="sec">
        <span class="lab">People ${pChg ? `<button class="link-btn" data-action="people-reset" data-day="${d.k}" title="Back to: ${peopleText(DEFAULT_PEOPLE[d.k])}">↺ usual</button>` : ''}</span>
        <div class="people">${step('adults', 'Adults')}${step('kidsBig', 'Big kids')}${step('kidsSmall', 'Small kids')}</div>
      </div>
      <div class="sec">
        <span class="lab">Snacks (optional)</span>
        ${snacks.length ? snackPicker(`s-${wk}-${d.k}`, d.k, snacks, day.snackIds) : ''}
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
      <label class="small row" style="gap:4px" title="3★ recipes are picked 3× as often as 1★ — unrated count as 2★">
        <input type="checkbox" data-action="prefer-rated" ${db.settings.preferRated ? 'checked' : ''}> Prefer higher-rated</label>
      <button class="btn primary" data-action="go" ${DAYS.every(d => isPast(wk, d.k)) ? 'disabled title="All days of this week are over"' : ''}>✨ Suggest dinners</button>
    </div>
    ${db.recipes.length ? '' : '<p class="card">No recipes yet. Add some in the <b>Recipes</b> tab first.</p>'}
    <div class="plan-grid">${cards}</div>
    <p class="small muted">Go keeps days with a free-text dinner. Suggestions never repeat a recipe within the week or within ${NO_REPEAT_WEEKS} weeks before or after it. Choosing manually can override this.</p>`;
}

function renderRecipes() {
  const db = state.db;
  let list = db.recipes.filter(r => state.rInactive || r.active !== false);
  const q = state.rq.trim().toLowerCase();
  if (q) list = list.filter(r => (r.title + ' ' + (r.description || '')).toLowerCase().includes(q));
  // Type ('type:dinner' / 'type:snack') works like a tag in the Must have / Exclude dropdowns.
  const has = (r, t) => t === TYPE_DINNER ? !isSnack(r) : t === TYPE_SNACK ? isSnack(r) : (r.tags || []).includes(t);
  if (state.rTags.length) list = list.filter(r => state.rTags.every(t => has(r, t)));
  if (state.rExTags.length) list = list.filter(r => !state.rExTags.some(t => has(r, t)));
  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    added: (a, b) => (b.created || '').localeCompare(a.created || ''),
    edited: (a, b) => (b.updated || '').localeCompare(a.updated || ''),
    tags: (a, b) => (a.tags || []).join().localeCompare((b.tags || []).join()) || a.title.localeCompare(b.title),
  };
  list.sort(sorters[state.rSort] || sorters.title);
  const total = db.recipes.length, inactive = db.recipes.filter(r => r.active === false).length;
  const nSnack = db.recipes.filter(isSnack).length;
  // The whole tile opens the editor (the link inside still opens the recipe page).
  const rows = list.map(r => `<div class="card rrow ${isSnack(r) ? 'snack' : ''} ${r.active === false ? 'inactive' : ''}"
      ${Store.canEdit ? `data-action="edit-recipe" data-id="${r.id}" tabindex="0" role="button" title="Edit"` : ''}>
      <div class="avatar" style="--h:${hueOf(r.title)}" aria-hidden="true">${emojiOf(r)}</div>
      <div class="main">
        <span class="rtitle">${esc(r.title)}</span>
        ${isSnack(r) ? '<span class="chip snack">Snack</span>' : ''}
        ${r.active === false ? '<span class="chip gray">inactive</span>' : ''}
        ${r.link ? ` <a href="${esc(r.link)}" target="_blank" rel="noopener" class="small">link ↗</a>` : ''}
        <div class="desc">${esc(r.description || '')}</div>
        <div>${(r.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>
      ${stars(r.rating)}
    </div>`).join('');
  const opts = [{ value: TYPE_DINNER, label: `🍽️ Dinner (${total - nSnack})`, short: '🍽️ Dinner' }, { value: TYPE_SNACK, label: `🍪 Snack / Sweets (${nSnack})`, short: '🍪 Snack', sep: true }, ...db.tags];
  return `<div class="row" style="margin-bottom:10px">
      <span class="spacer"></span>
      ${Store.canEdit ? `<button class="btn" data-action="new-recipe" data-kind="snack">+ Add snack</button>
      <button class="btn primary" data-action="new-recipe" data-kind="dinner">+ Add recipe</button>` : ''}
    </div>
    <div class="row rfilters" style="margin-bottom:12px">
      <input type="search" id="rq" placeholder="Search recipes" value="${esc(state.rq)}">
      ${multiSelect('rtags', 'Must have: any', opts, state.rTags, 'rtag', '', 'Must have: ', 'inc')}
      ${multiSelect('rxtags', 'Exclude: none', opts, state.rExTags, 'rxtag', '', 'Exclude: ', 'exc')}
      <select data-action="rsort">
        ${[['title', 'Sort: Title A–Z'], ['rating', 'Sort: Rating'], ['tags', 'Sort: Tags'], ['added', 'Sort: Newest'], ['edited', 'Sort: Recently edited']]
          .map(([v, l]) => `<option value="${v}" ${state.rSort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="small row" style="gap:4px"><input type="checkbox" data-action="rinactive" ${state.rInactive ? 'checked' : ''}> Show inactive (${inactive})</label>
    </div>
    <p class="small muted">${list.length} of ${total} shown · tap a tile to edit it</p>
    <div class="rlist">${rows || '<p class="muted">No recipes match.</p>'}</div>`;
}

function renderGroceries() {
  const db = state.db;
  const onList = new Set(db.groceries.map(x => x.name.toLowerCase()));
  const recent = db.groceryRecent.filter(n => !onList.has(n.toLowerCase()));
  // A div, not a button: the shop link inside must stay clickable without ticking the item off.
  const tile = (name, link, action, data) => `<div class="gtile ${link ? 'haslink' : ''}" role="button" tabindex="0" data-action="${action}" ${data} style="--h:${hueOf(name)}">
      <span class="ge" aria-hidden="true">${groceryEmoji(name)}</span><span class="gn">${esc(name)}</span>
      ${link ? `<a class="glink" href="${esc(link)}" target="_blank" rel="noopener" title="${esc(link)}">🔗 ${esc(shopName(link))}</a>` : ''}</div>`;
  return `<div class="groc">
    <form class="card gadd" id="gform">
      <input type="text" id="gname" placeholder="Add something, e.g. Milk, Eggs, Bananas" autocomplete="off" enterkeyhint="done">
      <input type="text" id="glink" inputmode="url" placeholder="🔗 Link (optional), e.g. from Migros or Coop" autocomplete="off" enterkeyhint="done">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="ghead"><h2>🛒 To buy${db.groceries.length ? ` <span class="count">${db.groceries.length}</span>` : ''}</h2>
      <span class="muted small">Tap an item once it's in the cart.</span></div>
    ${db.groceries.length ? `<div class="gtiles">${db.groceries.map(x => tile(x.name, x.link, 'g-done', `data-id="${x.id}"`)).join('')}</div>`
      : '<div class="card gempty">🎉 Nothing left to buy.</div>'}
    ${recent.length ? `<div class="ghead"><h3>Recently bought</h3><span class="muted small">Tap to put it back on the list.</span>
        <span class="spacer"></span><button class="btn sm" data-action="g-clear-recent">Clear</button></div>
      <div class="gtiles recent">${recent.map(n => tile(n, db.groceryLinks[n.toLowerCase()], 'g-readd', `data-name="${esc(n)}"`)).join('')}</div>` : ''}
  </div>`;
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
    <div class="row" style="gap:14px"><div class="avatar big" style="--h:${hueOf(r.title)}" aria-hidden="true">${emojiOf(r)}</div>
      <h2 style="margin:0;flex:1;min-width:0">${esc(r.title)}</h2>${isSnack(r) ? '<span class="chip snack">Snack</span>' : ''}${r.active === false ? '<span class="chip gray">inactive</span>' : ''}</div>
    <div>${stars(r.rating)} ${(r.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    ${r.link ? `<div><a href="${esc(r.link)}" target="_blank" rel="noopener">Open recipe ↗</a><div class="small muted" style="word-break:break-all">${esc(r.link)}</div></div>` : ''}
    ${r.description ? `<div class="desc-full">${esc(r.description)}</div>` : '<div class="muted">No description.</div>'}
    <div class="small muted">${last ? `Last planned: ${parseIso(last).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not planned yet'}</div>
    <div class="row"><span class="spacer"></span>
      ${Store.canEdit ? `<button class="btn" data-action="edit-recipe" data-id="${r.id}">Edit</button>` : ''}
      <button class="btn" data-action="close">Close</button></div>
  </div>`);
}

let draft = null, draftOrig = ''; // recipe being edited
function editRecipe(id, kind) {
  const r = id ? recipeById(state.db, id) : null;
  draft = r ? clone(r) : { id: null, title: '', link: '', description: '', tags: [], rating: 0, active: true };
  draft.kind = r ? (r.kind || 'dinner') : (kind || 'dinner');
  draftOrig = JSON.stringify(draft);
  renderEditor();
  $('#rform [name=title]').focus();
}
function renderEditor() {
  const d = draft;
  const allTags = [...new Set([...state.db.tags, ...d.tags])];
  openModal(`<form class="form" id="rform">
    <h2 style="margin:0">${d.id ? 'Edit' : 'New'} ${d.kind === 'snack' ? 'snack' : 'recipe'}</h2>
    <div><span class="seg kind">
        <button type="button" data-action="d-kind" data-kind="dinner" class="${d.kind !== 'snack' ? 'active' : ''}">🍽️ Dinner recipe</button>
        <button type="button" data-action="d-kind" data-kind="snack" class="${d.kind === 'snack' ? 'active' : ''}">🍪 Snack / Sweets</button></span>
      <div class="small muted" style="margin-top:4px">${d.kind === 'snack' ? 'Snacks are never suggested for dinner — pick them in the snack field of a day.' : 'Dinner recipes are used for the suggestions.'}</div></div>
    <label class="f">Title *<input type="text" name="title" value="${esc(d.title)}" required></label>
    <label class="f">Link<input type="text" inputmode="url" name="link" value="${esc(d.link)}" placeholder="https://…" autocomplete="off"></label>
    <label class="f">Description<textarea name="description" rows="4">${esc(d.description)}</textarea></label>
    <div><div class="small muted" style="margin-bottom:4px">Rating</div>
      <span class="star-in">${[1, 2, 3].map(n => `<button type="button" data-action="d-star" data-n="${n}" class="${n <= d.rating ? 'on' : ''}">★</button>`).join('')}</span>
      ${d.rating ? '<button type="button" class="btn sm" data-action="d-star" data-n="0">clear</button>' : ''}</div>
    <div><div class="small muted" style="margin-bottom:4px">Tags</div>
      <div class="tagboxes">${allTags.map(t => `<label><input type="checkbox" data-action="d-tag" data-value="${esc(t)}" ${d.tags.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('') || '<span class="muted small">No tags yet</span>'}</div>
      <div class="row" style="margin-top:6px"><input type="text" id="d-newtag" placeholder="New tag"><button type="button" class="btn sm" data-action="d-addtag">Add</button></div></div>
    <label class="small row" style="gap:6px"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> Active (inactive recipes are never suggested)</label>
    <div class="row">
      ${d.id ? '<button type="button" class="btn danger" data-action="delete-recipe">🗑 Delete</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-action="close">Cancel</button>
      <button type="submit" class="btn primary">Save</button></div>
  </form>`);
  $('#rform').addEventListener('submit', e => { e.preventDefault(); saveDraft(); });
}
function syncDraftFields() {
  const f = $('#rform'); if (!f) return;
  draft.title = f.title.value; draft.link = f.link.value; draft.description = f.description.value; draft.active = f.active.checked;
}
function draftDirty() { syncDraftFields(); return JSON.stringify(draft) !== draftOrig; }
// Closing the editor without saving: only via Cancel, or Esc with confirmation.
function tryCloseModal() {
  if ($('#rform') && draftDirty() && !confirm('Discard your changes to this recipe?')) return;
  closeModal();
}
function saveDraft() {
  syncDraftFields();
  const link = draft.link.trim();
  const d = { ...draft, title: draft.title.trim(), link: normUrl(link), description: draft.description.trim() };
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

// Remove a recipe for good. Days that had it keep its name as free text,
// so the history in the overview still reads correctly.
function deleteRecipe(db, id, title) {
  db.recipes = db.recipes.filter(r => r.id !== id);
  Object.values(db.weeks).forEach(w => Object.values(w.days || {}).forEach(d => {
    if (d.recipeId === id) { d.recipeId = null; if (!d.custom) d.custom = title; }
    if ((d.snackIds || []).includes(id)) {
      d.snackIds = d.snackIds.filter(x => x !== id);
      d.snacks = d.snacks?.trim() ? `${d.snacks.trim()}, ${title}` : title;
    }
  }));
}

// ---------------------------------------------------------------- groceries
const looksLikeUrl = t => /^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)+\/\S*$/i.test(t.trim());
const normUrl = t => { t = (t || '').trim(); return t && !/^[a-z]+:\/\//i.test(t) ? 'https://' + t : t; };
// "https://www.migros.ch/de/product/…" → "Migros"
function shopName(url) {
  try { const h = new URL(url).hostname.replace(/^www\./, '').split('.'); const n = h.length > 1 ? h[h.length - 2] : h[0]; return n.charAt(0).toUpperCase() + n.slice(1); }
  catch { return 'Link'; }
}
// `link` (optional) belongs to a single item. A link pasted into the name field is used as the link too.
function addGrocery(text, link = '') {
  let names = text.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const pasted = names.filter(looksLikeUrl);
  if (pasted.length && !link) link = pasted[0];
  names = names.filter(n => !looksLikeUrl(n)).map(x => x.charAt(0).toUpperCase() + x.slice(1));
  link = normUrl(link);
  if (link && !names.length) names = [shopName(link) + ' item'];
  if (!names.length) { $('#gname')?.focus(); return; }
  if (link && names.length > 1) return toast('A link can only go with one item — add the others separately.');
  const have = new Map(state.db.groceries.map(x => [x.name.toLowerCase(), x]));
  const add = [], dup = [];
  let relink = null;
  names.forEach(n => {
    const l = n.toLowerCase(), old = have.get(l);
    if (old) { if (link && old.link !== link) relink = old; else dup.push(n); }
    else { add.push({ id: uid(), name: n, ...(link ? { link } : {}), added: new Date().toISOString() }); have.set(l, add[add.length - 1]); }
  });
  if (dup.length) toast(`Already on the list: ${dup.join(', ')}`);
  if (add.length || relink) mutate(db => {
    add.forEach(x => { if (!db.groceries.some(y => y.name.toLowerCase() === x.name.toLowerCase())) db.groceries.push(x); });
    if (relink) { const it = db.groceries.find(y => y.id === relink.id); if (it) it.link = link; }
    if (link) db.groceryLinks[names[0].toLowerCase()] = link;
  }, `Groceries: add ${names.join(', ')}`);
  if (relink) toast(`Link added to ${relink.name}`);
  const i = $('#gname'); if (i) { i.value = ''; i.focus(); }
  const g = $('#glink'); if (g) g.value = '';
}
function groceryDone(id) {
  const item = state.db.groceries.find(x => x.id === id);
  if (!item) return;
  mutate(db => {
    db.groceries = db.groceries.filter(x => x.id !== id);
    db.groceryRecent = [item.name, ...db.groceryRecent.filter(n => n.toLowerCase() !== item.name.toLowerCase())].slice(0, 30);
  }, `Groceries: bought ${item.name}`);
}

// ---------------------------------------------------------------- planner actions
function planWk() { return weekKey(state.planWeek === 'next' ? 1 : 0); }
function goSuggest() {
  const wk = planWk();
  const db = state.db;
  // Days with a free-text dinner are a deliberate choice: Go leaves them alone.
  const open = d => !isPast(wk, d.k) && getDay(db, wk, d.k).enabled && !getDay(db, wk, d.k).custom;
  if (DAYS.every(d => isPast(wk, d.k))) return toast('All days of this week are over.');
  const assigned = DAYS.filter(d => open(d) && getDay(db, wk, d.k).recipeId).length;
  if (assigned && !confirm(`Replace the ${assigned} dinner(s) already chosen for this week with new suggestions?`)) return;
  const missing = [];
  mutate(db => {
    // Clear first, so the days of this week don't block each other.
    DAYS.forEach(d => { if (open(d)) ensureDay(db, wk, d.k).recipeId = null; });
    // Fill the most restrictive days first, so filtered days still find a match.
    const order = DAYS.filter(open).sort((a, b) => candidates(db, wk, a.k).length - candidates(db, wk, b.k).length);
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
  mutate(db => { const day = ensureDay(db, wk, k); day.recipeId = r.id; day.custom = ''; }, `Shuffle ${k} (${wk}): ${r.title}`);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; state.openMs = null; lsSet('dinnerplanner.tab', state.tab); render(); return; }
  if (e.target.id === 'modal') { if (downOnBackdrop && !$('#rform')) closeModal(); return; }
  // close multi-selects when clicking outside of them
  const ms = e.target.closest('details.ms');
  document.querySelectorAll('details.ms[open]').forEach(d => { if (d !== ms) d.open = false; });

  if (e.target.closest('a[href]')) return; // links (e.g. inside a recipe tile) just open
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT') || el.tagName === 'TEXTAREA') return;
  const a = el.dataset.action, k = el.dataset.day, wk = planWk();
  switch (a) {
    case 'show-recipe': showRecipe(el.dataset.id); break;
    case 'edit-recipe': editRecipe(el.dataset.id); break;
    case 'new-recipe': editRecipe(null, el.dataset.kind); break;
    case 'd-kind': syncDraftFields(); draft.kind = el.dataset.kind; renderEditor(); break;
    case 'delete-recipe': {
      const r = recipeById(state.db, draft?.id);
      if (!r) { closeModal(); break; }
      if (!confirm(`Delete "${r.title}" for good?\n\nDays that already have it planned keep the name as text. To just stop it being suggested, untick "Active" instead.`)) return;
      const id = r.id, title = r.title;
      closeModal();
      mutate(db => deleteRecipe(db, id, title), `Delete recipe: ${title}`);
      toast(`Deleted "${title}"`);
      break;
    }
    case 'people-reset': mutate(db => { ensureDay(db, wk, k).people = { ...DEFAULT_PEOPLE[k] }; }, `People ${k} (${wk}): back to usual`); break;
    case 'g-done': {
      el.classList.add('gone');
      const id = el.dataset.id;
      setTimeout(() => groceryDone(id), 220);
      break;
    }
    case 'g-readd': addGrocery(el.dataset.name, state.db.groceryLinks[el.dataset.name.toLowerCase()] || ''); break;
    case 'g-clear-recent': mutate(db => { db.groceryRecent = []; }, 'Groceries: clear recently bought'); break;
    case 'close': closeModal(); break;
    case 'goto-plan': state.tab = 'plan'; state.planWeek = el.dataset.week; render(); break;
    case 'plan-week': state.planWeek = el.dataset.week; state.openMs = null; render(); break;
    case 'go': goSuggest(); break;
    case 'reroll': reroll(k); break;
    case 'manual-pick': {
      const id = el.dataset.id;
      state.openMs = null;
      mutate(db => { const day = ensureDay(db, wk, k); day.recipeId = id; day.custom = ''; }, `Choose ${k} (${wk})`);
      break;
    }
    case 'clear-day': mutate(db => { const day = ensureDay(db, wk, k); day.recipeId = null; day.custom = ''; }, `Clear ${k} (${wk})`); break;
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
  Object.values(db.weeks).forEach(w => Object.values(w.days || {}).forEach(d => { if (d.filter?.tags) d.filter.tags = fix(d.filter.tags); if (d.filter?.excludeTags) d.filter.excludeTags = fix(d.filter.excludeTags); }));
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
      if (el.checked) f.excludeTags = (f.excludeTags || []).filter(t => t !== v);
    }, `Filter ${k} (${wk})`); break;
    case 'filter-extag': keepOpen(); mutate(db => {
      const f = ensureDay(db, wk, k).filter; const v = el.dataset.value;
      f.excludeTags = el.checked ? [...new Set([...(f.excludeTags || []), v])] : (f.excludeTags || []).filter(t => t !== v);
      if (el.checked) f.tags = f.tags.filter(t => t !== v);
    }, `Filter ${k} (${wk})`); break;
    case 'prefer-rated': mutate(db => { db.settings.preferRated = el.checked; }, `${el.checked ? 'Prefer' : 'Do not prefer'} higher-rated recipes`); break;
    case 'min-rating': mutate(db => { ensureDay(db, wk, k).filter.minRating = Number(el.value); }, `Filter ${k} (${wk})`); break;
    case 'custom': {
      const v = el.value.trim();
      mutate(db => { const day = ensureDay(db, wk, k); day.custom = v; if (v) day.recipeId = null; }, `Free-text dinner ${k} (${wk})`);
      break;
    }
    case 'snack-pick': keepOpen(); mutate(db => {
      const day = ensureDay(db, wk, k), id = el.dataset.id;
      day.snackIds = el.checked ? [...new Set([...(day.snackIds || []), id])] : (day.snackIds || []).filter(x => x !== id);
    }, `Snacks ${k} (${wk})`); break;
    case 'snacks': { const v = el.value; mutate(db => { ensureDay(db, wk, k).snacks = v; }, `Snacks ${k} (${wk})`); break; }
    case 'rtag': keepOpen(); state.rTags = el.checked ? [...state.rTags.filter(t => !(el.dataset.value.startsWith('type:') && t.startsWith('type:'))), el.dataset.value] : state.rTags.filter(t => t !== el.dataset.value);
      if (el.checked) state.rExTags = state.rExTags.filter(t => t !== el.dataset.value); render(); break;
    case 'rxtag': keepOpen(); state.rExTags = el.checked ? [...state.rExTags, el.dataset.value] : state.rExTags.filter(t => t !== el.dataset.value);
      if (el.checked) state.rTags = state.rTags.filter(t => t !== el.dataset.value); render(); break;
    case 'rsort': state.rSort = el.value; render(); break;
    case 'rinactive': state.rInactive = el.checked; render(); break;
    case 'd-tag': syncDraftFields(); draft.tags = el.checked ? [...draft.tags, el.dataset.value] : draft.tags.filter(t => t !== el.dataset.value); break;
  }
});
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('combo-q')) return;
  const visible = [...e.target.closest('.ms-pop').querySelectorAll('.combo-item:not(.hidden)')];
  if (e.key === 'Enter') { e.preventDefault(); visible[0]?.click(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(visible[0]); }
});
const focusItem = el => el && (el.matches('label') ? el.querySelector('input') : el).focus();
document.addEventListener('keydown', e => {
  const item = e.target.closest?.('.combo-item');
  if (!item || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const visible = [...item.closest('.combo-list').querySelectorAll('.combo-item:not(.hidden)')];
  const i = visible.indexOf(item) + (e.key === 'ArrowDown' ? 1 : -1);
  if (i < 0) item.closest('.ms-pop').querySelector('.combo-q').focus(); else focusItem(visible[i]);
});
// Recipe tiles act as buttons: Enter / Space opens the editor.
document.addEventListener('keydown', e => {
  if ((e.target.classList?.contains('rrow') || e.target.classList?.contains('gtile')) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'gform') { e.preventDefault(); addGrocery($('#gname').value, $('#glink').value); }
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
// A text selection that ends outside the box fires a click on the backdrop —
// so the backdrop only closes when the mouse was also pressed down there.
let downOnBackdrop = false;
document.addEventListener('mousedown', e => { downOnBackdrop = e.target.id === 'modal'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) tryCloseModal(); });
// Pick up changes made by others when coming back to the tab.
// Skipped while the user is typing or has a dropdown open — a re-render would wipe it.
window.addEventListener('focus', () => {
  const busy = !$('#modal').classList.contains('hidden') || document.querySelector('details.ms[open]')
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!busy) reload(true);
});
window.addEventListener('beforeunload', e => { if (pending.length || saving) { e.preventDefault(); e.returnValue = ''; } });

reload();
