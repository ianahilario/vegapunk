# Reports

Vegapunk writes into `vegapunk-report/` inside Playwright’s `outputDir`. Traces stay in Playwright’s per-test folders. The viewer is HTML: a test list, a test page, then one page per issue.

```text
test-results/                 # Playwright outputDir
  vegapunk-report/
    index.html                # Vegapunk test list
    {playwright-test-dir}/
      report.html
      report.json
      issues/
        ISSUE-001.html
      screenshots/
  {playwright-test-dir}/
    trace.zip                 # Playwright, when retained

playwright-report/            # Playwright HTML reporter (sibling, not inside outputDir)
```

Playwright clears `outputDir` at the start of a run. The Vegapunk reporter writes `vegapunk-report/index.html` at the end. Keep Playwright’s HTML reporter out of `outputDir`. Zip `test-results/` to get traces and the Vegapunk report together.

On the test page, **Vegapunk report** still has Summary, Explores, What it did, Checks, and Issues. Issues are links, not inline write-ups. Open an issue page for expected / actual, repro steps, and screenshots.

## Pass / fail

- Zero issues across all `vegapunk.explore()` calls → the Playwright test passes.
- Any issue → the test fails **after** the test body finishes (later `vegapunk.explore()` calls still run).
- A hard error (blocked auth in CI, provider crash) throws immediately.
- Hitting a timebox wraps up that call; it is not an error.

## Issue fields

- title, severity (`critical | high | medium | low`)
- category (`visual | functional | ux | content | performance | console | accessibility`)
- URL, description, expected, actual
- user-level repro steps (not locator refs)
- screenshots embedded on the issue page; repro video only when the bug is interactive
- which `vegapunk.explore()` (mission + persona)

Someone who was not in the session should be able to file a ticket or retest by hand from the report alone. Vegapunk does not generate test code.
