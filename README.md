# Streaks

A habit tracker that runs in the browser. Check a habit off each day, watch the streak grow, and see the last 16 weeks as a grid. No dependencies, no build step, no account: your data stays in `localStorage`.

## Run it

- **In CodeMini:** open `index.html` and use Live Preview.
- **Anywhere else:** open `index.html` in a browser, or serve the folder with any static server.

## Using it

- Add a habit, then press the circle to mark today. Press it again to undo.
- Press a square in the grid to fix any of the last 14 days. Older days are read-only.
- A streak stays alive until today ends: if you have not checked in yet, it counts from yesterday.
- **Backup and restore** copies your data as JSON and loads a backup back in. Restoring replaces everything and asks first.

## Tests

The logic in `src/js/streaks.js` has no DOM, and the file runs its own self-tests when you run it directly:

```sh
npm test            # same as: node src/js/streaks.js
TZ=Pacific/Auckland npm test
```

The tests cover leap days, daylight saving changes, streak rules and backup validation. CI runs them in three time zones.

## CodeMini setup

The `.codemini/` folder is the project's [CodeMini](https://codemini-ide.vercel.app/) configuration and is committed with the code.

| File | What it does |
| --- | --- |
| `settings.json` | Two-space indent, word wrap, Tree View in Explorer, auto save, and a green accent and status bar. Only display and editor settings can be set here. |
| `tasks.json` | **Test** runs the self-tests. **Time zone check** prints the time zone the runner sees. |
| `agent.md` | Project rules for helpers: how days are stored, what never to do. |
| `local/` | Machine-only files. Git ignores it. |

CodeMini tasks run one file with no imports, no arguments and no `npm`. That is why the tests sit inside `streaks.js`. There is no build task because there is no build step.

## Layout

```
index.html
src/css/style.css
src/js/streaks.js    habit and date logic, plus its tests
src/js/app.js        draws the page, saves to localStorage
.codemini/           CodeMini settings, tasks, notes, local/
.github/workflows/   CI
```

## Data

Saved under the key `streaks.v1`:

```json
{ "version": 1, "habits": [
  { "id": "a1b2", "name": "Read 20 pages", "created": "2026-01-05", "archived": false, "days": ["2026-01-05", "2026-01-06"] }
] }
```

Days are local `YYYY-MM-DD` dates, not timestamps, so a time zone or daylight saving change cannot move a check-in to another day.

## License

MIT, see [LICENSE](LICENSE).
