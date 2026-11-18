# Notes for Agent Mini and other helpers

Streaks is a habit tracker. Plain HTML, CSS and JavaScript: no dependencies, no build step.

- All logic is in `src/js/streaks.js` and has no DOM. `src/js/app.js` only draws the page and saves to `localStorage` (`streaks.v1`).
- Days are `YYYY-MM-DD` strings in local time, never timestamps. Use `addDays`, `toKey` and `fromKey`, not millisecond math.
- Names from users and from imported backups go into the page with `textContent`. Never use `innerHTML`.
- State changes return a new state. Do not edit habits in place.
- Tests live at the bottom of `src/js/streaks.js` (`selfTest`) because CodeMini tasks run one file with no imports. Add a `test(...)` there for every change to the logic.
- A file run by a task must not contain the word `await` anywhere, even in a comment: the runner then wraps it differently.
- `.codemini/local/` is machine-only and ignored by Git. Never put keys or tokens in `.codemini/`: it is committed.
