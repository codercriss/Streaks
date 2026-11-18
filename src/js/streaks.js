/* Streaks core: pure date and habit logic, no DOM.
 *
 * Loads three ways: a browser <script> (window.Streaks), Node (require) and CodeMini's isolated runner.
 * Run this file directly (`node src/js/streaks.js`, `npm test`, or the "Test" task in CodeMini) and it
 * runs its own self-tests. CodeMini tasks run one file with no imports, which is why the tests live here.
 *
 * Days are plain "YYYY-MM-DD" strings in the person's local time zone, never timestamps, so daylight
 * saving and time zones cannot shift a check-in onto another day.
 */
(function (root) {
  'use strict';
  const VERSION = 1, MAX_HABITS = 100, NAME_MAX = 40;
  const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---- days -------------------------------------------------------------------------------------
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  const toKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromKey = (k) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }; // noon: an hour of DST never changes the date
  const isKey = (k) => typeof k === 'string' && KEY_RE.test(k) && toKey(fromKey(k)) === k;
  function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
  const mondayIndex = (k) => (fromKey(k).getDay() + 6) % 7; // Monday 0 ... Sunday 6
  const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
  const cleanDays = (list) => Array.from(new Set((Array.isArray(list) ? list : []).filter(isKey))).sort();

  // ---- numbers ----------------------------------------------------------------------------------
  // Consecutive days ending today. Today not done yet does not break the streak: it counts from yesterday.
  function currentStreak(days, today) {
    const set = new Set(days);
    let k = set.has(today) ? today : addDays(today, -1), n = 0;
    while (set.has(k)) { n++; k = addDays(k, -1); }
    return n;
  }
  function bestStreak(days) {
    let best = 0, run = 0, prev = null;
    cleanDays(days).forEach((k) => { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
    return best;
  }
  // Share of the last `window` days that were done, counting only days since the habit was created.
  function rate(habit, today, window) {
    const span = Math.max(1, Math.min(window, diffDays(habit.created, today) + 1)), from = addDays(today, 1 - span);
    const done = habit.days.filter((k) => k >= from && k <= today).length;
    return { done, span, pct: Math.round((100 * done) / span) };
  }
  // `weeks` columns of 7 days, Monday first, the last column holding today.
  function heatmap(days, today, weeks) {
    const set = new Set(days), start = addDays(today, -mondayIndex(today) - 7 * (weeks - 1)), cols = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) { const key = addDays(start, w * 7 + d); col.push({ key, done: set.has(key), future: key > today, today: key === today }); }
      cols.push(col);
    }
    return cols;
  }

  // ---- habits: every change returns a new state, nothing is edited in place -----------------------
  const emptyState = () => ({ version: VERSION, habits: [] });
  const withHabits = (habits) => ({ version: VERSION, habits });
  const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const change = (s, id, fn) => withHabits(s.habits.map((h) => (h.id === id ? Object.assign({}, h, fn(h)) : h)));

  function addHabit(s, name, today, id) {
    const n = cleanName(name);
    if (!n) return { ok: false, error: 'Give the habit a name.' };
    if (s.habits.length >= MAX_HABITS) return { ok: false, error: 'You can track up to ' + MAX_HABITS + ' habits.' };
    if (s.habits.some((h) => !h.archived && h.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'You already track "' + n + '".' };
    return { ok: true, state: withHabits(s.habits.concat({ id: id || newId(), name: n, created: today, archived: false, days: [] })) };
  }
  // Future days and invalid keys are ignored.
  function toggleDay(s, id, key, today) {
    if (!isKey(key) || key > today) return s;
    return change(s, id, (h) => ({ days: h.days.includes(key) ? h.days.filter((d) => d !== key) : cleanDays(h.days.concat(key)) }));
  }
  const setArchived = (s, id, archived) => change(s, id, () => ({ archived: !!archived }));
  const removeHabit = (s, id) => withHabits(s.habits.filter((h) => h.id !== id));

  // ---- saving and loading -------------------------------------------------------------------------
  const serialize = (s) => JSON.stringify(s, null, 2);
  // Accepts only what Streaks writes. Anything else is dropped and counted, never trusted.
  function parseImport(text, today) {
    if (typeof text !== 'string' || text.length > 2e6) return { ok: false, error: 'That is too large to be a Streaks backup.' };
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not valid JSON.' }; }
    if (!data || data.version !== VERSION || !Array.isArray(data.habits)) return { ok: false, error: 'That is not a Streaks backup (expected version ' + VERSION + ').' };
    let dropped = 0; const ids = new Set(), habits = [];
    data.habits.slice(0, MAX_HABITS).forEach((h) => {
      const name = cleanName(h && h.name);
      if (!name) { dropped++; return; }
      const days = cleanDays(h.days).filter((k) => k <= today);
      dropped += (Array.isArray(h.days) ? h.days.length : 0) - days.length;
      let id = typeof h.id === 'string' && /^[\w-]{1,40}$/.test(h.id) && !ids.has(h.id) ? h.id : newId();
      while (ids.has(id)) id = newId();
      ids.add(id);
      habits.push({ id, name, created: isKey(h.created) && h.created <= today ? h.created : days[0] || today, archived: h.archived === true, days });
    });
    return { ok: true, state: withHabits(habits), dropped: dropped + Math.max(0, data.habits.length - MAX_HABITS) };
  }

  // Three habits with different rhythms, the same every time for a given day.
  function makeSample(today) {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const build = (id, name, odds, run) => {
      const days = [];
      for (let i = 0; i < 110; i++) if (i < run || (i > run && rnd() < odds)) days.push(addDays(today, -i));
      return { id, name, created: addDays(today, -110), archived: false, days: cleanDays(days) };
    };
    return withHabits([build('sample-read', 'Read 20 pages', 0.78, 12), build('sample-walk', 'Walk after lunch', 0.55, 3), build('sample-phone', 'No phone before 8', 0.35, 0)]);
  }

  const api = { VERSION, MAX_HABITS, NAME_MAX, toKey, fromKey, isKey, addDays, diffDays, currentStreak, bestStreak, rate, heatmap,
    emptyState, addHabit, toggleDay, setArchived, removeHabit, serialize, parseImport, makeSample };

  // ---- self-tests -------------------------------------------------------------------------------
  api.selfTest = function () {
    const out = { passed: 0, failed: [], names: [] }, T = '2025-06-15'; // a Sunday
    const same = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); };
    const test = (name, fn) => { out.names.push(name); try { fn(); out.passed++; } catch (e) { out.failed.push({ name, message: e.message }); } };
    const run = (n, end) => Array.from({ length: n }, (_, i) => addDays(end, -i));

    test('keys round-trip and reject impossible dates', () => {
      same(toKey(fromKey('2024-02-29')), '2024-02-29');
      same(['2025-02-30', '2025-2-3', '', null, '2025-13-01'].map(isKey), [false, false, false, false, false]);
    });
    test('addDays crosses months, years and leap days', () => {
      same(addDays('2024-02-28', 2), '2024-03-01'); same(addDays('2023-02-28', 1), '2023-03-01');
      same(addDays('2025-12-31', 1), '2026-01-01'); same(addDays('2025-01-01', -1), '2024-12-31');
    });
    test('addDays is not fooled by daylight saving changes', () => {
      same(addDays('2025-03-08', 1), '2025-03-09'); same(addDays('2025-03-08', 2), '2025-03-10');
      same(addDays('2025-11-01', 1), '2025-11-02'); same(addDays('2025-11-01', 2), '2025-11-03');
      same(diffDays('2025-03-01', '2025-04-01'), 31);
    });
    test('current streak counts back from today', () => { same(currentStreak(run(5, T), T), 5); same(currentStreak([], T), 0); });
    test('a streak survives until today is over', () => same(currentStreak(run(3, addDays(T, -1)), T), 3));
    test('a missed day resets the streak', () => same(currentStreak(run(3, addDays(T, -2)), T), 0));
    test('best streak finds the longest run', () => same(bestStreak(run(4, '2025-05-10').concat(run(7, '2025-06-01'))), 7));
    test('rate only counts days since the habit began', () => {
      same(rate({ created: T, days: [T] }, T, 30), { done: 1, span: 1, pct: 100 });
      same(rate({ created: '2025-01-01', days: run(15, T) }, T, 30).pct, 50);
    });
    test('heatmap is Monday-first with today in the last column', () => {
      const cols = heatmap([T], T, 16);
      same([cols.length, cols[0].length], [16, 7]); same(fromKey(cols[0][0].key).getDay(), 1);
      same(cols[15][6], { key: '2025-06-15', done: true, future: false, today: true });
      same(heatmap([], '2025-06-11', 2)[1].map((c) => c.future), [false, false, false, true, true, true, true]);
    });
    test('addHabit cleans, rejects empty and duplicate names', () => {
      const a = addHabit(emptyState(), '  Read   daily ', T, 'a');
      same(a.state.habits[0].name, 'Read daily'); same(addHabit(a.state, '', T).ok, false); same(addHabit(a.state, 'read DAILY', T).ok, false);
    });
    test('toggleDay adds, removes, and ignores future or invalid days', () => {
      const s = addHabit(emptyState(), 'x', T, 'a').state, on = toggleDay(s, 'a', T, T);
      same(on.habits[0].days, [T]); same(toggleDay(on, 'a', T, T).habits[0].days, []);
      same(toggleDay(s, 'a', '2025-06-16', T), s); same(toggleDay(s, 'a', 'nope', T), s); same(s.habits[0].days, []);
    });
    test('archive and remove', () => {
      const s = addHabit(emptyState(), 'x', T, 'a').state;
      same(setArchived(s, 'a', true).habits[0].archived, true); same(removeHabit(s, 'a').habits, []);
    });
    test('parseImport rejects what is not a backup', () => {
      same(['{', '[]', '{"version":2,"habits":[]}', '{"version":1}'].map((t) => parseImport(t, T).ok), [false, false, false, false]);
    });
    test('parseImport drops bad names, bad and future days, and repeated ids', () => {
      const r = parseImport(JSON.stringify({ version: 1, habits: [
        { id: 'a', name: ' Run ', created: '2025-06-01', days: [T, T, '2025-06-16', 'x'] }, { id: 'a', name: 'Stretch', days: [] }, { name: '  ' }] }), T);
      same(r.ok, true); same(r.state.habits.length, 2); same(r.state.habits[0].days, [T]); same(r.dropped, 4);
      same(r.state.habits[0].id !== r.state.habits[1].id, true);
    });
    test('serialize then parseImport gives back the same state', () => {
      const s = makeSample(T); same(parseImport(serialize(s), T).state, s);
    });
    test('sample data is valid, repeatable and has a live streak', () => {
      const s = makeSample(T); same(s.habits.length, 3); same(JSON.stringify(makeSample(T)), JSON.stringify(s));
      same(currentStreak(s.habits[0].days, T) >= 12, true); same(parseImport(serialize(s), T).dropped, 0);
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Streaks = api;

  // Run directly (not loaded by the app page): print the results. A failure ends in an error so a task shows red.
  const direct = typeof document === 'undefined' ? typeof require === 'function' && typeof module !== 'undefined' && require.main === module : !document.getElementById('app');
  if (direct) {
    const r = api.selfTest();
    r.names.forEach((n) => console.log((r.failed.some((f) => f.name === n) ? '  FAIL  ' : '  ok    ') + n));
    r.failed.forEach((f) => console.log('\n' + f.name + '\n  ' + f.message));
    console.log('\n' + r.passed + ' passed, ' + r.failed.length + ' failed');
    if (r.failed.length) { if (typeof process !== 'undefined' && process.exit) process.exitCode = 1; else throw new Error(r.failed.length + ' test(s) failed'); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
