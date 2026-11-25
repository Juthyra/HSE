'use strict';
/* HSE Manager – incidents, inspections, corrective actions. Data lives in localStorage (offline-first). */
const KEY = 'hse-data-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0, 10);
const uid = p => p + '-' + Date.now().toString(36).slice(-5).toUpperCase() + Math.floor(Math.random()*36).toString(36).toUpperCase();
const cls = s => String(s).replace(/\s/g, '');

const INC_TYPES = ['Injury', 'Near miss', 'Property damage', 'Environmental', 'Unsafe condition', 'Health / illness'];
const SEVERITY = ['Low', 'Medium', 'High', 'Critical'];
const INC_STATUS = ['Open', 'Investigating', 'Closed'];
const ACT_STATUS = ['Open', 'In progress', 'Done'];
const CHECKLIST = [
  'Walkways clear, no trip hazards', 'PPE available and in use', 'Fire extinguishers accessible & in date',
  'Emergency exits unobstructed', 'First-aid kit stocked', 'Machinery guards in place',
  'Chemicals labelled & stored correctly', 'Spill kits available', 'Waste segregated & disposed properly',
  'Electrical equipment in good condition'
];

let db = load();
function load() {
  try { return Object.assign({incidents: [], inspections: [], actions: []}, JSON.parse(localStorage.getItem(KEY))); }
  catch { return {incidents: [], inspections: [], actions: []}; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}
function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
const opts = (list, sel) => list.map(o => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
const isOverdue = a => a.status !== 'Done' && a.due && a.due < today();
function fmtDate(d) { return d ? new Date(d + 'T00:00').toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) : '—'; }
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

/* ---------- router ---------- */
const routes = {dashboard, incidents, inspections, actions, data};
function route() {
  const [path, q] = (location.hash.slice(2) || 'dashboard').split('?');
  const name = routes[path] ? path : 'dashboard';
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.r === name));
  routes[name]();
  if (q === 'new=1') { ({incidents: incidentForm, inspections: inspectionForm, actions: actionForm})[name]?.(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- dashboard ---------- */
function dashboard() {
  const openInc = db.incidents.filter(i => i.status !== 'Closed').length;
  const overdue = db.actions.filter(isOverdue).length;
  const openAct = db.actions.filter(a => a.status !== 'Done').length;
  const injuries = db.incidents.filter(i => i.type === 'Injury').map(i => i.date).sort().pop();
  const days = injuries ? Math.floor((Date.now() - new Date(injuries + 'T00:00')) / 864e5) : null;
  const scores = db.inspections.map(i => i.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const byType = INC_TYPES.map(t => [t, db.incidents.filter(i => i.type === t).length]);
  const max = Math.max(1, ...byType.map(x => x[1]));
  const recent = [...db.incidents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  $('#view').innerHTML = `
    <div class="grid">
      <div class="kpi ${openInc ? 'bad' : 'good'}"><b>${openInc}</b><span>Open incidents</span></div>
      <div class="kpi ${overdue ? 'bad' : 'good'}"><b>${overdue}</b><span>Overdue actions</span></div>
      <div class="kpi"><b>${openAct}</b><span>Open actions</span></div>
      <div class="kpi good"><b>${days ?? '—'}</b><span>Days since last injury</span></div>
      <div class="kpi"><b>${avg === null ? '—' : avg + '%'}</b><span>Avg inspection score</span></div>
      <div class="kpi"><b>${db.inspections.length}</b><span>Inspections done</span></div>
    </div>
    <div class="card"><h2>Incidents by type</h2>
      ${byType.map(([t, n]) => `<div class="bar"><span>${esc(t)}</span><div class="t"><i style="width:${n / max * 100}%"></i></div><span>${n}</span></div>`).join('')}
    </div>
    <div class="card"><h2>Recent incidents</h2>
      ${recent.length ? recent.map(i => `<div class="row" style="margin:8px 0"><div><b>${esc(i.type)}</b> – ${esc(i.location)}<div class="mu">${fmtDate(i.date)}</div></div><span class="tag ${i.severity}">${i.severity}</span></div>`).join('')
        : '<div class="empty">No incidents recorded 🎉</div>'}
    </div>
    ${db.incidents.length + db.inspections.length + db.actions.length ? '' : '<button class="btn" id="demo">Load demo data</button>'}`;
  $('#demo')?.addEventListener('click', loadDemo);
}

/* ---------- incidents ---------- */
let incFilter = 'All';
function incidents() {
  const list = db.incidents.filter(i => incFilter === 'All' || i.status === incFilter).sort((a, b) => b.date.localeCompare(a.date));
  $('#view').innerHTML = `
    <div class="filters">${['All', ...INC_STATUS].map(f => `<button class="${f === incFilter ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
    ${list.length ? list.map(i => `
      <div class="card" data-id="${i.id}" style="cursor:pointer">
        <div class="row"><b>${esc(i.type)}</b><span class="tag ${i.severity}">${i.severity}</span></div>
        <div>${esc(i.description)}</div>
        <div class="row mu"><span>📍 ${esc(i.location)} · ${fmtDate(i.date)}</span><span class="tag ${cls(i.status)}">${i.status}</span></div>
      </div>`).join('') : '<div class="empty">No incidents found.</div>'}
    <button class="btn fab" id="add">+ Report incident</button>`;
  document.querySelectorAll('.filters button').forEach(b => b.onclick = () => { incFilter = b.dataset.f; incidents(); });
  document.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => incidentForm(c.dataset.id));
  $('#add').onclick = () => incidentForm();
}
function incidentForm(id) {
  const i = db.incidents.find(x => x.id === id) || {date: today(), type: INC_TYPES[0], severity: 'Low', status: 'Open', location: '', description: '', reporter: ''};
  modal(`<h2>${id ? 'Incident ' + id : 'Report incident'}</h2>
    <form id="f">
      <label>Date</label><input type="date" name="date" value="${i.date}" required>
      <label>Type</label><select name="type">${opts(INC_TYPES, i.type)}</select>
      <label>Severity</label><select name="severity">${opts(SEVERITY, i.severity)}</select>
      <label>Location</label><input name="location" value="${esc(i.location)}" required placeholder="e.g. Warehouse B">
      <label>What happened?</label><textarea name="description" required>${esc(i.description)}</textarea>
      <label>Reported by</label><input name="reporter" value="${esc(i.reporter)}">
      <label>Status</label><select name="status">${opts(INC_STATUS, i.status)}</select>
      <div class="row" style="margin-top:14px">
        <button class="btn">Save</button>
        <button type="button" class="btn ghost" id="cancel">Cancel</button>
        ${id ? '<button type="button" class="btn ghost" id="mkact">+ Action</button><button type="button" class="btn danger" id="del">Delete</button>' : ''}
      </div>
    </form>`);
  $('#cancel').onclick = closeModal;
  $('#f').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    if (id) Object.assign(i, d); else db.incidents.push({id: uid('INC'), ...d});
    save(); closeModal(); toast('Incident saved'); route();
  };
  if (id) {
    $('#del').onclick = () => { if (confirm('Delete this incident?')) { db.incidents = db.incidents.filter(x => x.id !== id); save(); closeModal(); route(); } };
    $('#mkact').onclick = () => { closeModal(); actionForm(null, {title: `Follow-up: ${i.type} at ${i.location}`, source: id}); };
  }
}

/* ---------- inspections ---------- */
function inspections() {
  const list = [...db.inspections].sort((a, b) => b.date.localeCompare(a.date));
  $('#view').innerHTML = `
    ${list.length ? list.map(i => `
      <div class="card" data-id="${i.id}" style="cursor:pointer">
        <div class="row"><b>${esc(i.area)}</b><span class="tag ${i.score >= 90 ? 'Low' : i.score >= 70 ? 'Medium' : 'Critical'}">${i.score}%</span></div>
        <div class="mu">${fmtDate(i.date)} · ${esc(i.inspector)} · ${i.results.filter(r => r === 'Fail').length} failed item(s)</div>
      </div>`).join('') : '<div class="empty">No inspections yet.</div>'}
    <button class="btn fab" id="add">+ New inspection</button>`;
  document.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => inspectionView(c.dataset.id));
  $('#add').onclick = () => inspectionForm();
}
function inspectionForm() {
  modal(`<h2>New inspection</h2>
    <form id="f">
      <label>Date</label><input type="date" name="date" value="${today()}" required>
      <label>Area / site</label><input name="area" required placeholder="e.g. Production hall">
      <label>Inspector</label><input name="inspector" required>
      <label>Checklist</label>
      ${CHECKLIST.map((c, n) => `<div class="chk"><span>${esc(c)}</span><select name="c${n}">${opts(['Pass', 'Fail', 'N/A'], 'Pass')}</select></div>`).join('')}
      <label>Notes</label><textarea name="notes"></textarea>
      <label><input type="checkbox" name="auto" checked style="width:auto"> Create corrective actions for failed items</label>
      <div class="row" style="margin-top:14px"><button class="btn">Save</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div>
    </form>`);
  $('#cancel').onclick = closeModal;
  $('#f').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    const results = CHECKLIST.map((_, n) => d['c' + n]);
    const scored = results.filter(r => r !== 'N/A');
    const score = scored.length ? Math.round(scored.filter(r => r === 'Pass').length / scored.length * 100) : 100;
    const ins = {id: uid('INS'), date: d.date, area: d.area, inspector: d.inspector, notes: d.notes, results, score};
    db.inspections.push(ins);
    let made = 0;
    if (d.auto) results.forEach((r, n) => {
      if (r === 'Fail') { made++; db.actions.push({id: uid('ACT'), title: `Fix: ${CHECKLIST[n]} (${d.area})`, owner: d.inspector, due: addDays(7),
        priority: 'High', status: 'Open', source: ins.id}); }
    });
    save(); closeModal(); toast(`Saved – score ${score}%${made ? `, ${made} action(s) created` : ''}`); route();
  };
}
function inspectionView(id) {
  const i = db.inspections.find(x => x.id === id);
  modal(`<h2>${esc(i.area)} – ${i.score}%</h2>
    <div class="mu">${fmtDate(i.date)} · ${esc(i.inspector)} · ${i.id}</div>
    ${CHECKLIST.map((c, n) => `<div class="chk"><span>${esc(c)}</span><span class="tag ${i.results[n] === 'Pass' ? 'Low' : i.results[n] === 'Fail' ? 'Critical' : ''}">${i.results[n]}</span></div>`).join('')}
    ${i.notes ? `<p>${esc(i.notes)}</p>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="cancel">Close</button><button class="btn danger" id="del">Delete</button></div>`);
  $('#cancel').onclick = closeModal;
  $('#del').onclick = () => { if (confirm('Delete this inspection?')) { db.inspections = db.inspections.filter(x => x.id !== id); save(); closeModal(); route(); } };
}
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ---------- corrective actions ---------- */
let actFilter = 'All';
function actions() {
  const list = db.actions.filter(a => actFilter === 'All' || (actFilter === 'Overdue' ? isOverdue(a) : a.status === actFilter))
    .sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  $('#view').innerHTML = `
    <div class="filters">${['All', ...ACT_STATUS, 'Overdue'].map(f => `<button class="${f === actFilter ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
    ${list.length ? list.map(a => `
      <div class="card" data-id="${a.id}" style="cursor:pointer">
        <div class="row"><b>${esc(a.title)}</b><span class="tag ${a.priority}">${a.priority}</span></div>
        <div class="row mu"><span>👤 ${esc(a.owner || 'Unassigned')} · due <span class="${isOverdue(a) ? 'overdue' : ''}">${fmtDate(a.due)}</span>${a.source ? ' · ' + esc(a.source) : ''}</span>
          <span class="tag ${cls(a.status)}">${a.status}</span></div>
      </div>`).join('') : '<div class="empty">No actions.</div>'}
    <button class="btn fab" id="add">+ New action</button>`;
  document.querySelectorAll('.filters button').forEach(b => b.onclick = () => { actFilter = b.dataset.f; actions(); });
  document.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => actionForm(c.dataset.id));
  $('#add').onclick = () => actionForm();
}
function actionForm(id, preset = {}) {
  const a = db.actions.find(x => x.id === id) || {title: '', owner: '', due: addDays(7), priority: 'Medium', status: 'Open', source: '', ...preset};
  modal(`<h2>${id ? 'Action ' + id : 'New corrective action'}</h2>
    <form id="f">
      <label>Title</label><input name="title" value="${esc(a.title)}" required>
      <label>Owner</label><input name="owner" value="${esc(a.owner)}">
      <label>Due date</label><input type="date" name="due" value="${a.due}">
      <label>Priority</label><select name="priority">${opts(SEVERITY, a.priority)}</select>
      <label>Status</label><select name="status">${opts(ACT_STATUS, a.status)}</select>
      <input type="hidden" name="source" value="${esc(a.source)}">
      <div class="row" style="margin-top:14px"><button class="btn">Save</button><button type="button" class="btn ghost" id="cancel">Cancel</button>
        ${id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}</div>
    </form>`);
  $('#cancel').onclick = closeModal;
  $('#f').onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    if (id) Object.assign(a, d); else db.actions.push({id: uid('ACT'), ...d});
    save(); closeModal(); toast('Action saved'); route();
  };
  if (id) $('#del').onclick = () => { if (confirm('Delete this action?')) { db.actions = db.actions.filter(x => x.id !== id); save(); closeModal(); route(); } };
}

/* ---------- data: export / import ---------- */
function data() {
  $('#view').innerHTML = `
    <div class="card"><h2>Export</h2><p class="mu">Your data is stored only on this device. Back it up regularly.</p>
      <div class="row"><button class="btn" id="json">Backup (JSON)</button><button class="btn ghost" id="csv">Incidents (CSV)</button></div></div>
    <div class="card"><h2>Import backup</h2><input type="file" id="imp" accept="application/json"></div>
    <div class="card"><h2>Demo / reset</h2>
      <div class="row"><button class="btn ghost" id="demo">Load demo data</button><button class="btn danger" id="wipe">Erase everything</button></div></div>
    <p class="mu">Records: ${db.incidents.length} incidents · ${db.inspections.length} inspections · ${db.actions.length} actions</p>`;
  $('#json').onclick = () => download(`hse-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
  $('#csv').onclick = () => {
    const cols = ['id', 'date', 'type', 'severity', 'location', 'description', 'reporter', 'status'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    download(`incidents-${today()}.csv`, [cols.join(','), ...db.incidents.map(i => cols.map(c => q(i[c])).join(','))].join('\n'), 'text/csv');
  };
  $('#imp').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.incidents) || !Array.isArray(d.inspections) || !Array.isArray(d.actions)) throw 0;
      if (confirm('Replace current data with this backup?')) { db = d; save(); toast('Imported'); route(); }
    } catch { toast('Invalid backup file'); }
  };
  $('#demo').onclick = loadDemo;
  $('#wipe').onclick = () => { if (confirm('Erase ALL data? This cannot be undone.')) { db = {incidents: [], inspections: [], actions: []}; save(); toast('Erased'); route(); } };
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function loadDemo() {
  const d = n => addDays(-n);
  db.incidents.push(
    {id: uid('INC'), date: d(3), type: 'Near miss', severity: 'Medium', location: 'Warehouse B', description: 'Forklift nearly struck a pedestrian at the loading bay.', reporter: 'A. Rahman', status: 'Investigating'},
    {id: uid('INC'), date: d(12), type: 'Injury', severity: 'High', location: 'Workshop', description: 'Minor hand laceration while changing a blade.', reporter: 'S. Lee', status: 'Open'},
    {id: uid('INC'), date: d(30), type: 'Environmental', severity: 'Low', location: 'Tank farm', description: 'Small oil drip contained by bund.', reporter: 'N. Tan', status: 'Closed'});
  db.actions.push(
    {id: uid('ACT'), title: 'Install pedestrian barrier at loading bay', owner: 'A. Rahman', due: d(2), priority: 'High', status: 'In progress', source: ''},
    {id: uid('ACT'), title: 'Refresher training: blade changing', owner: 'S. Lee', due: addDays(10), priority: 'Medium', status: 'Open', source: ''});
  db.inspections.push({id: uid('INS'), date: d(5), area: 'Production hall', inspector: 'M. Ali', notes: '', score: 89, results: CHECKLIST.map((_, n) => n === 2 ? 'Fail' : 'Pass')});
  save(); toast('Demo data loaded'); route();
}

/* ---------- PWA ---------- */
const net = () => { const p = $('#net'); p.textContent = navigator.onLine ? 'online' : 'offline'; p.classList.toggle('off', !navigator.onLine); };
addEventListener('online', net); addEventListener('offline', net); net();
let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Installed'); });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));

route();
