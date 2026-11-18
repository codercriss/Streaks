/* Streaks UI: draws the page from the state and saves every change. All logic lives in streaks.js. */
(function () {
  'use strict';
  const S = window.Streaks, KEY = 'streaks.v1', WEEKS = 16, EDIT_DAYS = 14;
  const $ = (id) => document.getElementById(id);
  const today = () => S.toKey(new Date());
  let state = S.emptyState(), canSave = true;

  // el('button', { type: 'button' }, 'Text', childNode): text goes in as text, never as HTML.
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => (k === 'class' ? (n.className = attrs[k]) : n.setAttribute(k, attrs[k])));
    kids.forEach((c) => n.append(c));
    return n;
  }
  // First click arms the button with a new label, a second click within 3 seconds does the thing.
  function twoStep(btn, armedLabel, action) {
    const label = btn.textContent; let timer = null;
    btn.addEventListener('click', () => {
      if (timer) { clearTimeout(timer); timer = null; action(); return; }
      btn.textContent = armedLabel; btn.classList.add('danger');
      timer = setTimeout(() => { timer = null; btn.textContent = label; btn.classList.remove('danger'); }, 3000);
    });
  }

  function load() {
    try { const raw = localStorage.getItem(KEY), r = raw && S.parseImport(raw, today()); if (r && r.ok) state = r.state; } catch (e) { canSave = false; }
  }
  function update(next) {
    state = next;
    if (canSave) { try { localStorage.setItem(KEY, S.serialize(state)); } catch (e) { canSave = false; } }
    render();
  }

  const pretty = (key) => S.fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  function habitItem(h) {
    const t = today(), done = h.days.includes(t), streak = S.currentStreak(h.days, t), r = S.rate(h, t, 30);
    const check = el('button', { type: 'button', class: 'check', 'aria-pressed': String(done), 'aria-label': h.name + ', today' }, '\u2713');
    check.addEventListener('click', () => update(S.toggleDay(state, h.id, t, t)));

    const map = el('div', { class: 'map', role: 'group', 'aria-label': 'Last ' + WEEKS + ' weeks' });
    S.heatmap(h.days, t, WEEKS).forEach((col) => col.forEach((c) => {
      const age = S.diffDays(c.key, t), cls = (c.done ? 'on ' : '') + (c.future ? 'future ' : '') + (c.today ? 'today' : '');
      if (c.future || age >= EDIT_DAYS) { map.append(el('div', { class: cls.trim() })); return; }
      const b = el('button', { type: 'button', class: cls.trim(), 'aria-pressed': String(c.done), 'aria-label': pretty(c.key) });
      b.addEventListener('click', () => update(S.toggleDay(state, h.id, c.key, t)));
      map.append(b);
    }));

    const archive = el('button', { type: 'button' }, 'Archive');
    archive.addEventListener('click', () => update(S.setArchived(state, h.id, true)));
    const del = el('button', { type: 'button' }, 'Delete');
    twoStep(del, 'Delete for good?', () => update(S.removeHabit(state, h.id)));

    return el('li', { class: 'habit' },
      el('div', { class: 'head' }, check, el('span', { class: 'name' }, h.name),
        el('div', { class: 'streak' }, el('b', {}, String(streak)), el('span', {}, 'day streak'))),
      el('p', { class: 'stats' }, 'Best ' + S.bestStreak(h.days) + ' days. Last 30 days: ' + r.pct + '% (' + r.done + ' of ' + r.span + ').'),
      map, el('div', { class: 'acts' }, archive, del));
  }

  function archivedItem(h) {
    const back = el('button', { type: 'button' }, 'Restore');
    back.addEventListener('click', () => update(S.setArchived(state, h.id, false)));
    const del = el('button', { type: 'button' }, 'Delete');
    twoStep(del, 'Delete for good?', () => update(S.removeHabit(state, h.id)));
    return el('li', { class: 'habit' }, el('div', { class: 'head' }, el('span', { class: 'name' }, h.name), back, del));
  }

  function render() {
    $('today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const active = state.habits.filter((h) => !h.archived), old = state.habits.filter((h) => h.archived), list = $('habits');
    list.replaceChildren();
    if (!active.length) {
      const sample = el('button', { type: 'button' }, 'Load sample data');
      sample.addEventListener('click', () => update(S.makeSample(today())));
      list.append(el('li', { class: 'habit empty' }, el('p', {}, 'Add a habit above, then check it off each day to build a streak.'), sample));
    } else active.forEach((h) => list.append(habitItem(h)));
    $('archived-box').hidden = !old.length;
    $('archived-title').textContent = 'Archived (' + old.length + ')';
    $('archived').replaceChildren(...old.map(archivedItem));
    $('storage-note').hidden = canSave;
  }

  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = S.addHabit(state, $('new-habit').value, today()), err = $('form-error');
    err.hidden = r.ok; err.textContent = r.ok ? '' : r.error;
    if (r.ok) { $('new-habit').value = ''; update(r.state); }
  });

  // ---- backup and restore ----
  const dlg = $('backup'), box = $('backup-text'), msg = $('backup-msg');
  $('backup-open').addEventListener('click', () => { box.value = S.serialize(state); msg.textContent = ''; dlg.showModal(); });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(box.value); msg.textContent = 'Copied.'; }
    catch (e) { box.select(); msg.textContent = 'Press Ctrl+C or Cmd+C to copy the selected text.'; }
  });
  $('download').addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([box.value], { type: 'application/json' })), download: 'streaks-' + today() + '.json' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  let armed = false;
  $('restore').addEventListener('click', (e) => {
    const r = S.parseImport(box.value, today());
    if (!r.ok) { armed = false; msg.textContent = r.error; return; }
    if (!armed) { armed = true; e.target.textContent = 'Replace ' + state.habits.length + ' habits with ' + r.state.habits.length + '?'; return; }
    armed = false; e.target.textContent = 'Replace my habits';
    update(r.state); msg.textContent = 'Restored ' + r.state.habits.length + ' habits' + (r.dropped ? ' (' + r.dropped + ' invalid items skipped)' : '') + '.';
  });
  box.addEventListener('input', () => { armed = false; $('restore').textContent = 'Replace my habits'; });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); }); // a new day may have started
  load(); render();
})();
