'use strict';

/* ================= Storage ================= */

const STORE_KEY = 'schooltodos.v1';
const COLORS = [
  '#e5383b', '#f06a00', '#e0a100', '#2a9d58', '#14a3a3', '#0a66ff',
  '#5b5bd6', '#a347d1', '#d6409f', '#8d6e63', '#607d8b', '#3a3a3c',
];
const DEFAULT_PREFS = { view: 'all', tab: 'active', sort: 'due', minImp: 1 };

const uid = () =>
  (self.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function normalize(raw) {
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c) => c && c.id && c.name)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name).slice(0, 60),
      color: isColor(c.color) ? c.color : COLORS[5],
    }));
  const catIds = new Set(categories.map((c) => c.id));
  const todos = (Array.isArray(raw.todos) ? raw.todos : [])
    .filter((t) => t && t.id && t.title && catIds.has(String(t.categoryId)))
    .map((t) => ({
      id: String(t.id),
      categoryId: String(t.categoryId),
      title: String(t.title).slice(0, 200),
      notes: t.notes ? String(t.notes).slice(0, 4000) : '',
      importance: Math.min(5, Math.max(1, parseInt(t.importance, 10) || 3)),
      due: isYmd(t.due) ? t.due : '',
      completed: !!t.completed,
      completedAt: Number(t.completedAt) || null,
      createdAt: Number(t.createdAt) || Date.now(),
    }));
  const prefs = { ...DEFAULT_PREFS, ...(raw.prefs || {}) };
  if (prefs.view !== 'all' && !catIds.has(prefs.view)) prefs.view = 'all';
  return { categories, todos, prefs };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw) return normalize(raw);
  } catch { /* fall through */ }
  return { categories: [], todos: [], prefs: { ...DEFAULT_PREFS } };
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — storage is full or blocked');
  }
}

// Ask the browser not to evict our data under storage pressure.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ================= Helpers ================= */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymd(d);
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000);

function fmtDate(s) {
  const d = parseYmd(s);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

function dueInfo(s) {
  const n = daysUntil(s);
  if (n < -1) return { label: `${-n} days overdue`, cls: 'overdue' };
  if (n === -1) return { label: 'Due yesterday', cls: 'overdue' };
  if (n === 0) return { label: 'Due today', cls: 'soon' };
  if (n === 1) return { label: 'Due tomorrow', cls: 'soon' };
  if (n < 7) return { label: `Due ${parseYmd(s).toLocaleDateString(undefined, { weekday: 'long' })}`, cls: '' };
  return { label: `Due ${fmtDate(s)}`, cls: '' };
}

const catById = (id) => state.categories.find((c) => c.id === id);
const activeCount = (catId) =>
  state.todos.filter((t) => !t.completed && (!catId || t.categoryId === catId)).length;

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function impHtml(l) {
  let bars = '';
  for (let i = 1; i <= 5; i++) bars += `<b class="${i <= l ? 'f' : ''}"></b>`;
  return `<span class="imp" data-l="${l}" role="img" aria-label="Importance ${l} of 5">${bars}</span>`;
}

/* ================= Sorting ================= */

const byDue = (a, b) => {
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return b.importance - a.importance || a.createdAt - b.createdAt;
};
const byImportance = (a, b) => b.importance - a.importance || byDue(a, b);
const byCreated = (a, b) => b.createdAt - a.createdAt;
const SORTS = { due: byDue, importance: byImportance, created: byCreated };

/* ================= Rendering ================= */

const listEl = $('#list');

function render({ scrollChip = false } = {}) {
  const { view, tab, sort, minImp } = state.prefs;
  const cat = view === 'all' ? null : catById(view);

  $('#viewTitle').textContent = cat ? cat.name : 'All classes';
  $('#sortSel').value = sort;
  $('#filterSel').value = String(minImp);
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.classList.toggle('on', b.dataset.tab === tab));

  // Toolbar visibility: tabs only in a class; sort only for a class's active list.
  $('#tabs').hidden = !cat;
  $('#sortSel').closest('label').hidden = !cat || tab === 'completed';
  $('#toolbar').hidden = state.categories.length === 0;

  renderChips(scrollChip);

  if (state.categories.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="big">📚</div>
        <p><strong>Welcome!</strong></p>
        <p>Start by adding your classes.</p>
        <button class="primary-btn" data-action="add-class">+ Add a class</button>
      </div>`;
    return;
  }

  if (!cat) return renderAll(minImp);

  let items = state.todos.filter((t) =>
    t.categoryId === cat.id && t.importance >= minImp && t.completed === (tab === 'completed'));

  if (tab === 'completed') {
    items.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    listEl.innerHTML = items.length
      ? `<div class="cards">${items.map((t) => card(t)).join('')}</div>
         <div class="clear-row"><button class="link" data-action="clear-completed" style="color:var(--danger)">Clear completed</button></div>`
      : emptyHtml('✅', 'Nothing completed yet', 'Checked-off todos show up here.');
    return;
  }

  items.sort(SORTS[sort] || byDue);
  listEl.innerHTML = items.length
    ? `<div class="cards">${items.map((t) => card(t)).join('')}</div>`
    : emptyHtml('🎉', 'All caught up', minImp > 1 ? 'Nothing at this importance level.' : 'Tap + to add a todo.');
}

function renderAll(minImp) {
  const groups = [
    { key: 'overdue', label: 'Overdue', items: [] },
    { key: 'today', label: 'Today', items: [] },
    { key: 'tomorrow', label: 'Tomorrow', items: [] },
    { key: 'week', label: 'This week', items: [] },
    { key: 'later', label: 'Later', items: [] },
    { key: 'none', label: 'No due date', items: [] },
  ];
  const g = Object.fromEntries(groups.map((x) => [x.key, x.items]));

  for (const t of state.todos) {
    if (t.completed || t.importance < minImp) continue;
    if (!t.due) { g.none.push(t); continue; }
    const n = daysUntil(t.due);
    if (n < 0) g.overdue.push(t);
    else if (n === 0) g.today.push(t);
    else if (n === 1) g.tomorrow.push(t);
    else if (n < 7) g.week.push(t);
    else g.later.push(t);
  }

  const html = groups
    .filter((x) => x.items.length)
    .map((x) => {
      x.items.sort(x.key === 'none' ? byImportance : byDue);
      return `<h3 class="group-label ${x.key === 'overdue' ? 'overdue' : ''}">${x.label} · ${x.items.length}</h3>
              <div class="cards">${x.items.map((t) => card(t, true)).join('')}</div>`;
    })
    .join('');

  listEl.innerHTML = html || emptyHtml('🎉', 'All caught up', minImp > 1
    ? 'Nothing at this importance level.'
    : 'No open todos in any class. Tap + to add one.');
}

function emptyHtml(icon, title, sub) {
  return `<div class="empty"><div class="big">${icon}</div><p><strong>${title}</strong></p><p>${sub}</p></div>`;
}

function card(t, showClass = false) {
  const cat = catById(t.categoryId);
  const color = cat ? cat.color : '#8e8e93';
  let dueHtml = '';
  if (t.completed) {
    if (t.completedAt) dueHtml = `<span>Done ${fmtDate(ymd(new Date(t.completedAt)))}</span>`;
  } else if (t.due) {
    const d = dueInfo(t.due);
    dueHtml = `<span class="due ${d.cls}">${d.label}</span>`;
  }
  return `
    <article class="todo${t.completed ? ' done' : ''}" data-id="${esc(t.id)}" style="--c:${color}">
      <button class="check" data-action="toggle" aria-label="${t.completed ? 'Mark as not done' : 'Mark as done'}">${CHECK_SVG}</button>
      <button class="todo-body" data-action="edit">
        <span class="todo-title">${esc(t.title)}</span>
        ${t.notes ? `<span class="todo-notes">${esc(t.notes)}</span>` : ''}
        <span class="meta">
          ${impHtml(t.importance)}
          ${dueHtml}
          ${showClass && cat ? `<span class="cls" style="--c:${color}"><i></i>${esc(cat.name)}</span>` : ''}
        </span>
      </button>
      ${t.completed ? '<button class="restore-btn" data-action="toggle">Restore</button>' : ''}
    </article>`;
}

function renderChips(scrollActive) {
  const view = state.prefs.view;
  const chips = [
    `<button class="chip ${view === 'all' ? 'on' : ''}" data-view="all">All <span class="count">${activeCount()}</span></button>`,
    ...state.categories.map((c) => `
      <button class="chip ${view === c.id ? 'on' : ''}" data-view="${esc(c.id)}" style="--c:${c.color}">
        <span class="dot"></span>${esc(c.name)} <span class="count">${activeCount(c.id)}</span>
      </button>`),
    '<button class="chip add" data-action="add-class">+ Class</button>',
  ];
  const el = $('#chips');
  el.innerHTML = chips.join('');
  if (scrollActive) {
    const on = el.querySelector('.chip.on');
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

/* ================= Toast ================= */

let toastTimer;
function toast(msg, actionLabel = '', action = null) {
  const el = $('#toast');
  $('#toastMsg').textContent = msg;
  const btn = $('#toastAction');
  btn.textContent = actionLabel;
  btn.onclick = () => { hideToast(); if (action) action(); };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4500);
}
function hideToast() { $('#toast').hidden = true; }

/* ================= Dialog helpers ================= */

function setupDialog(dlg) {
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { dlg.close(); return; }
    // Tap on backdrop (outside the sheet box) closes.
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    }
  });
}
document.querySelectorAll('dialog').forEach(setupDialog);

// Enter in a text field saves the form (textarea keeps Enter for new lines).
document.querySelectorAll('dialog form').forEach((form) =>
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  }));

/* ================= Todo editor ================= */

const todoDlg = $('#todoDlg');
let editingTodoId = null;
let pickedImp = 3;

function setImportance(v) {
  pickedImp = v;
  document.querySelectorAll('#tImp button').forEach((b) => {
    const on = Number(b.dataset.v) === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
}

function openTodo(todo = null) {
  if (state.categories.length === 0) {
    toast('Add a class first');
    openCat();
    return;
  }
  editingTodoId = todo ? todo.id : null;
  $('#todoDlgTitle').textContent = todo ? 'Edit todo' : 'New todo';
  $('#tCat').innerHTML = state.categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  const view = state.prefs.view;
  const defaultCat = view !== 'all' ? view : (state.prefs.lastCat && catById(state.prefs.lastCat) ? state.prefs.lastCat : state.categories[0].id);

  $('#tTitle').value = todo ? todo.title : '';
  $('#tCat').value = todo ? todo.categoryId : defaultCat;
  $('#tDue').value = todo ? todo.due : '';
  $('#tNotes').value = todo ? todo.notes : '';
  setImportance(todo ? todo.importance : 3);
  $('#tDelete').hidden = !todo;

  todoDlg.showModal();
  if (!todo) setTimeout(() => $('#tTitle').focus(), 50);
}

$('#tImp').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (b) setImportance(Number(b.dataset.v));
});

todoDlg.querySelectorAll('[data-due]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#tDue').value = b.dataset.due === '' ? '' : todayStr(Number(b.dataset.due));
  }));

$('#todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#tTitle').value.trim();
  if (!title) { $('#tTitle').focus(); return; }
  const data = {
    title,
    categoryId: $('#tCat').value,
    importance: pickedImp,
    due: $('#tDue').value || '',
    notes: $('#tNotes').value.trim(),
  };
  if (editingTodoId) {
    Object.assign(state.todos.find((t) => t.id === editingTodoId), data);
  } else {
    state.todos.push({ id: uid(), ...data, completed: false, completedAt: null, createdAt: Date.now() });
  }
  state.prefs.lastCat = data.categoryId;
  save();
  todoDlg.close();
  render();
});

$('#tDelete').addEventListener('click', () => {
  const idx = state.todos.findIndex((t) => t.id === editingTodoId);
  if (idx < 0) return;
  const [removed] = state.todos.splice(idx, 1);
  save();
  todoDlg.close();
  render();
  toast('Todo deleted', 'Undo', () => {
    state.todos.splice(idx, 0, removed);
    save();
    render();
  });
});

/* ================= Class editor ================= */

const catDlg = $('#catDlg');
let editingCatId = null;
let pickedColor = COLORS[5];

function setColor(c) {
  pickedColor = c;
  document.querySelectorAll('#cColors button').forEach((b) =>
    b.classList.toggle('on', b.dataset.c === c));
}

$('#cColors').innerHTML = COLORS
  .map((c) => `<button type="button" data-c="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('');
$('#cColors').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-c]');
  if (b) setColor(b.dataset.c);
});

function openCat(cat = null) {
  editingCatId = cat ? cat.id : null;
  $('#catDlgTitle').textContent = cat ? 'Edit class' : 'New class';
  $('#cName').value = cat ? cat.name : '';
  // New classes get the first color not already in use.
  const used = new Set(state.categories.map((c) => c.color));
  setColor(cat ? cat.color : (COLORS.find((c) => !used.has(c)) || COLORS[0]));
  $('#cDelete').hidden = !cat;
  catDlg.showModal();
  setTimeout(() => $('#cName').focus(), 50);
}

$('#catForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#cName').value.trim();
  if (!name) { $('#cName').focus(); return; }
  let scroll = false;
  if (editingCatId) {
    Object.assign(catById(editingCatId), { name, color: pickedColor });
  } else {
    const cat = { id: uid(), name, color: pickedColor };
    state.categories.push(cat);
    // Jump to the new class unless we're managing from the settings sheet.
    if (!manageDlg.open) { state.prefs.view = cat.id; state.prefs.tab = 'active'; scroll = true; }
  }
  save();
  catDlg.close();
  renderManage();
  render({ scrollChip: scroll });
});

$('#cDelete').addEventListener('click', () => {
  const cat = catById(editingCatId);
  if (!cat) return;
  const n = state.todos.filter((t) => t.categoryId === cat.id).length;
  const msg = n
    ? `Delete "${cat.name}" and its ${n} todo${n === 1 ? '' : 's'}? This can't be undone.`
    : `Delete "${cat.name}"?`;
  if (!confirm(msg)) return;
  state.categories = state.categories.filter((c) => c.id !== cat.id);
  state.todos = state.todos.filter((t) => t.categoryId !== cat.id);
  if (state.prefs.view === cat.id) state.prefs.view = 'all';
  save();
  catDlg.close();
  renderManage();
  render();
});

/* ================= Manage classes ================= */

const manageDlg = $('#manageDlg');

function renderManage() {
  const n = state.categories.length;
  $('#catList').innerHTML = state.categories.map((c, i) => `
    <li data-id="${esc(c.id)}" style="--c:${c.color}">
      <span class="dot"></span>
      <span class="name">${esc(c.name)}</span>
      <span class="n">${activeCount(c.id)}</span>
      <button class="mv" data-move="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="mv" data-move="1" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>▼</button>
      <button class="edit" data-edit>Edit</button>
    </li>`).join('');
}

$('#manageBtn').addEventListener('click', () => { renderManage(); manageDlg.showModal(); });
$('#addCatBtn').addEventListener('click', () => openCat());

$('#catList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const i = state.categories.findIndex((c) => c.id === li.dataset.id);
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const j = i + Number(mv.dataset.move);
    if (j < 0 || j >= state.categories.length) return;
    [state.categories[i], state.categories[j]] = [state.categories[j], state.categories[i]];
    save();
    renderManage();
    render();
  } else if (e.target.closest('[data-edit]')) {
    openCat(state.categories[i]);
  }
});

/* ================= Backup ================= */

$('#exportBtn').addEventListener('click', async () => {
  const json = JSON.stringify({ app: 'school-todos', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const name = `school-todos-${todayStr()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // On iPhone the share sheet lets you "Save to Files".
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'School todos backup' }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#importInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = normalize(JSON.parse(await f.text()));
    if (!data.categories.length) throw new Error('empty');
    const ok = confirm(`Replace everything on this device with the backup (${data.categories.length} classes, ${data.todos.length} todos)?`);
    if (!ok) return;
    state = data;
    save();
    manageDlg.close();
    render({ scrollChip: true });
    toast('Backup restored');
  } catch {
    toast("That file isn't a valid backup");
  }
});

/* ================= Main list interactions ================= */

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  if (chip.dataset.action === 'add-class') { openCat(); return; }
  if (state.prefs.view === chip.dataset.view) return;
  state.prefs.view = chip.dataset.view;
  state.prefs.tab = 'active';
  save();
  render({ scrollChip: true });
  window.scrollTo({ top: 0 });
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.prefs.tab = b.dataset.tab;
  save();
  render();
});

$('#sortSel').addEventListener('change', (e) => { state.prefs.sort = e.target.value; save(); render(); });
$('#filterSel').addEventListener('change', (e) => { state.prefs.minImp = Number(e.target.value); save(); render(); });

listEl.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'add-class') { openCat(); return; }

  if (action === 'clear-completed') {
    const catId = state.prefs.view;
    const n = state.todos.filter((t) => t.categoryId === catId && t.completed).length;
    if (!confirm(`Permanently delete ${n} completed todo${n === 1 ? '' : 's'}?`)) return;
    state.todos = state.todos.filter((t) => !(t.categoryId === catId && t.completed));
    save();
    render();
    return;
  }

  const cardEl = actionEl.closest('.todo');
  const todo = cardEl && state.todos.find((t) => t.id === cardEl.dataset.id);
  if (!todo) return;

  if (action === 'edit') openTodo(todo);

  if (action === 'toggle') {
    const nowDone = !todo.completed;
    const prevAt = todo.completedAt;
    cardEl.classList.add('leaving');
    if (nowDone) cardEl.classList.add('done');
    setTimeout(() => {
      todo.completed = nowDone;
      todo.completedAt = nowDone ? Date.now() : null;
      save();
      render();
      toast(nowDone ? 'Marked done' : 'Moved back to active', 'Undo', () => {
        todo.completed = !nowDone;
        todo.completedAt = prevAt;
        save();
        render();
      });
    }, 200);
  }
});

$('#addBtn').addEventListener('click', () => openTodo());

// Re-render when the app comes back to the foreground so "today"/"overdue" stay correct.
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render({ scrollChip: true });

/* ================= Offline support ================= */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
