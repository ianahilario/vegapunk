# How it works

Vegapunk is a bounded loop inside a Playwright test: snapshot the page, ask a model what to do, run Playwright tools, repeat until the mission is done or the clock runs out. The model never sees application source. It never writes test code. It only sees what a user (and a few page listeners) would see.

This page is the internals. Charters, personas, config, providers, and reports have their own docs.

## Who does what

```text
You (the charter)
  page.goto / login / fixtures
  vegapunk.explore({ page, mission, persona })
  teardown

Vegapunk
  load vegapunk.config.ts
  refuse the page unless its origin is on allowedOrigins
  attach console + XHR/fetch listeners
  loop: snapshot → model → tools
  write the session report
  fail the test if any issue was logged

The model
  read persona + mission + current snapshot
  pick tools (click, fill, scanA11y, logIssue, …)
  call done when stuck or finished
```

Playwright owns the browser, timeout, projects, and `baseURL`. Vegapunk owns one `explore()` call: the timebox, the tools, and the report for that test.

`explore()` must run inside a Playwright test. Multiple calls in the same test share one session (one journal, one issue list, one HTML report).

## One `explore()` call

1. Load `vegapunk.config.ts` (or `VEGAPUNK_CONFIG`). Merge `explore({ ai })` over config `ai`.
2. If Playwright `baseURL` or `page.url()` is not on `allowedOrigins`, throw. The model is not created and no snapshot is sent.
3. Start a per-call deadline from config `timebox`, or `explore({ timebox })` if you passed one. If Playwright’s test `timeout` is lower than that budget, Vegapunk throws before the loop.
4. Attach console and XHR/fetch listeners on the page (once per page).
5. Snapshot the current page. If it looks like an auth/MFA wall: headed runs `page.pause()` so a human can finish login; headless throws. After a pause, the origin is checked again.
6. Run the turn loop.
7. Tear down agent routes, dialog handlers, offline/throttle, and `emulateMedia`.
8. Write `report.html` / `report.json`, attach the HTML to the Playwright test, and `expect.soft` that **this** call logged zero issues.

Issues from an earlier call do not skip later calls or teardown. Soft assertions fail the test after the body finishes.

### The turn loop

Each turn is one model call (`maxSteps: 1`). Tools from that call run immediately. Tool results are **not** fed back to the model in the same turn. The next turn starts with a fresh snapshot, so the model sees the page *after* those tools, not a tool-result blob.

If `ai.model` is a TypeSafe Jev slug (`~typesafe/jev-latest`, `typesafe/jev-1.13`), the turn is a Decisions API call instead of chat completions. Vegapunk offers every Playwright tool that has arguments on this snapshot (controls, Network/Fetch paths, storage keys, plus fill/key/file catalogs). Jev picks the tool, then the argument set. Jev does not generate tool JSON or issue prose.

```text
while not done, under 80 turns, and ≥2s left on the timebox:
  refuse the page if its origin left allowedOrigins (do not send that snapshot)
  snapshot the page after the accessibility tree stops changing (ARIA tree + recent listener/tool notes)
  user message:
    time left
    “only log what THIS snapshot shows”
    already-filed issue ids for this explore
    current snapshot
    optional viewport JPEG (visual: true)
  model generates (persona + mission as the system prompt)
  tools execute (click, fill, logIssue, done, …)
  click / press / fill / check / uncheck / selectOption / tab / goto / goBack throw if the page origin left allowedOrigins
  journal any assistant text as a thought
```

The loop stops when:

- the model calls `done`
- the timebox hits (in-flight model call is aborted; no wrap-up turn)
- 80 turns have run
- less than 2 seconds remain, so another turn would not finish honestly

Hitting the timebox is not an error. A provider crash or a blocked auth wall is.

## What the model sees

Not the DOM, not your repo, not previous screenshots (except the latest when `visual` is on).

### System prompt

Built every turn from the persona and mission you passed:

- who they are (`title`, `id`, `profile`)
- the mission string
- that they are an exploratory tester, not writing regression tests
- the full tool list — **every** persona gets every tool; `id` is only a log slug
- how to file issues (expected vs actual, user-level repro, quote the snapshot)

`profile` is the steering. A malicious persona is still looking at the same snapshot; they are instructed to abuse inputs. An a11y auditor is instructed to care about names, contrast, and keyboard. See [personas.md](personas.md).

A short per-page checklist (forms, back, empty/error states, console, network, a11y, offline, storage, …) is sent once at the start of the explore, then the loop only sends the current page.

### Snapshot

Playwright `ariaSnapshot()` of `body` (role/name tree). Vegapunk samples that tree for at least a tenth of a second and until two reads match, up to half a second, so a click that only changes the hash is not snapshotted on the frame before the new view paints. Then:

| Block | Source | Lifetime |
| --- | --- | --- |
| Console | `console` error/warning and `pageerror` since the last snapshot | consumed each turn |
| Network | in-page XHR/fetch responses and failures (path, status, short body) | last 20 lines, then consumed |
| A11y scan | last `scanA11y` (axe, WCAG 2.2 AA tags) | shown once |
| Keyboard | last `tab` focus (role + name) | shown once |
| Fetch | last `pageFetch` (status + clipped body) | shown once |
| Storage | last `readStorage` / `writeStorage` | shown once |
| Conditions | dialogs, `emulateMedia`, `setNetwork` | shown once |

If `ariaSnapshot` fails, Vegapunk falls back to a short list of links, buttons, inputs, and roles.

Network lines are how the agent learns `/api/checkout` before `overrideRequest` or `pageFetch`. Charter-level `page.route()` still works for setup; the agent cannot see those routes, only the traffic.

### Screenshots (`visual: true`)

Off by default. When on, each turn also sends a viewport JPEG (not full page, quality 50). Older screenshots are stripped from the message list so only the latest image stays in context.

The screenshot is for overlap, clip, overflow, alignment, and tiny targets — not contrast ratios. Contrast and names still come from the snapshot or `scanA11y`. Needs a vision-capable model; see [ai.md](ai.md).

## Tools

Bound to the current Playwright `page`. Locators prefer **role + accessible name** from the snapshot (`getByRole`). Visible text beside a control is not always its name. CSS selectors are last resort.

| Group | Tools |
| --- | --- |
| UI | `click`, `fill`, `press`, `check`, `uncheck`, `selectOption`, `hover`, `tab`, `goto`, `goBack`, `setInputFiles` |
| Dialogs | `handleDialog` — register **before** the click that opens alert/confirm/prompt |
| Network | `overrideRequest` (abort / fulfill / tamper same-origin XHR/fetch), `pageFetch` (cookie-authenticated same-origin HTTP; does not go through agent routes), `setNetwork` (`offline` / `slow3g` / `fast3g` / `online`; throttle needs Chromium) |
| Storage | `readStorage`, `writeStorage` (`local` / `session` / `cookie`) on this origin |
| A11y | `scanA11y` (axe), `emulateMedia` (dark, reduced motion, forced colors) |
| Record | `logIssue`, `checkOk`, `done` |

Guards the model cannot skip:

- Stay on the app origin. With Playwright `baseURL` set, `goto` also stays under that path prefix. `/` means the app base, not the site origin. `goto` is refused if the next origin is not on `allowedOrigins`. After any tool that can change origin (`click`, `press`, `fill`, `check`, `uncheck`, `selectOption`, `tab`, `goto`, `goBack`), if the page left the list, `explore()` throws and later tools in that turn do not keep running.
- `overrideRequest` is same-origin and not a catch-all (`**/*` is rejected). Cross-origin requests are left alone.
- `pageFetch` needs a concrete path, not a glob.
- At most 40 mutating actions per 60 seconds. Each action’s Playwright timeout is 0.5–8s, shrinking as the timebox ends.
- When the explore ends, agent routes, dialog handlers, offline mode, media emulation, and CDP throttle are removed. Your charter `page.route()` is untouched.

`tab` is the keyboard-order tool: it presses Tab and returns the focused role and name. Do not use `press` with Tab for that.

## Issues

`logIssue` is how a bug becomes a ticket-shaped record. Vegapunk does not invent issues on its own.

Before an issue is kept:

1. **Same turn as an action** — rejected. Click/fill/navigate, wait for the next snapshot, then log. The failing view has to be in *this* snapshot, not the one from before the click.
2. **Evidence** — `evidence` must be a short quote from the current snapshot (label, item, console/network/a11y/fetch line). Empty evidence is rejected. With `visual: true`, a `visual` defect (overlap, clip, overflow, alignment) may pass without that quote living in the ARIA tree. Quotes in `actual` still have to be on this snapshot: a remembered label from an earlier screen, or a counter like “1 item left”, is not a visible row.
3. **Duplicate** — same path (origin + pathname) and overlapping title/actual wording as an issue already in this test session → rejected with the existing id.
4. **Unchanged view** — at most two issues before the page is mutated again. After that: click, filter, or `done`.

A kept issue gets `ISSUE-00N`, a full-page screenshot, expected / actual, user-level repro steps (not locator refs), category, severity, and which explore (mission + persona). `checkOk` records a path that worked. Neither generates Playwright test code.

Pass / fail is described in [reports.md](reports.md): zero issues → pass; any issue → fail after the body; hard errors throw now.

## Session on disk

One Playwright test → one session directory under `outputDir/vegapunk-report/`:

```text
journal.ndjson     # every orient / action / thought / issue / check / wrap
issues.json        # if anything was filed
report.json
report.html
issues/ISSUE-00N.html
screenshots/
```

The journal is also printed to the console as `[vegapunk - {persona id}]`. `vegapunk/reporter` rebuilds the run index at the end of `npx playwright test`.

## What Vegapunk does not do

- Navigate for you before `explore()` — `page.goto()` (and login) first.
- Load personas from a file or CLI flag — pass a `createPersona()` object.
- Call Cursor, or use Cursor subscription models.
- Wrap up politely when the timebox hits.
- Skip later `explore()` calls because the first one found a bug.
- Intercept third-party hosts or your existing `page.route()` setup.
- Call the model on a page whose origin is not in `allowedOrigins`.
