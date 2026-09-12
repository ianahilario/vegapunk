import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Issue } from '../types.js'
import type { SessionReport } from './types.js'

export type IndexSession = {
  title: string
  href: string
  issues: number
  project: string
  startedAt: string
  status: 'passed' | 'failed'
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function durationLabel(startedAt: string, endedAt?: string): string {
  if (!endedAt) return '—'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function severityCounts(report: SessionReport) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const issue of report.issues) counts[issue.severity] += 1
  return counts
}

function shot(sessionDir: string, rel: string | undefined, hrefPrefix: string): string {
  if (!rel || !existsSync(join(sessionDir, rel))) return ''
  return `<figure class="shot"><img src="${escape(hrefPrefix + rel)}" alt=""></figure>`
}

function page(options: {
  title: string
  crumbs: { href: string; label: string }[]
  status?: 'passed' | 'failed'
  body: string
}): string {
  const crumbs = options.crumbs
    .map((crumb, index) =>
      index === options.crumbs.length - 1
        ? `<span>${escape(crumb.label)}</span>`
        : `<a href="${escape(crumb.href)}">${escape(crumb.label)}</a><span class="sep">›</span>`,
    )
    .join('')
  const badge = options.status
    ? `<span class="badge ${options.status}">${options.status}</span>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(options.title)}</title>
<style>
  :root {
    --bg: #f4f4f4;
    --card: #fff;
    --ink: #1e1e1e;
    --muted: #6b6b6b;
    --line: #e4e4e4;
    --pass: #2f9e44;
    --fail: #e03131;
    --critical: #c92a2a;
    --high: #e8590c;
    --medium: #f08c00;
    --low: #868e96;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    background: var(--bg);
    color: var(--ink);
    line-height: 1.5;
  }
  header {
    background: #1e1e1e;
    color: #fff;
    padding: 0.85rem 1.25rem;
  }
  header h1 { font-size: 1rem; margin: 0 0 0.35rem; font-weight: 600; }
  .crumbs, .crumbs a { color: #cfcfcf; font-size: 0.85rem; text-decoration: none; }
  .crumbs a:hover { color: #fff; }
  .sep { margin: 0 0.4rem; color: #888; }
  main { max-width: 960px; margin: 1.25rem auto 3rem; padding: 0 1rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.9rem; margin: 0 0 1rem; }
  .badge {
    display: inline-block;
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .badge.passed, .sev.passed { background: #d3f9d8; color: var(--pass); }
  .badge.failed, .sev.failed { background: #ffe3e3; color: var(--fail); }
  .sev { display: inline-block; border-radius: 4px; padding: 0.05rem 0.4rem; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
  .sev.critical { background: #ffe3e3; color: var(--critical); }
  .sev.high { background: #fff0e4; color: var(--high); }
  .sev.medium { background: #fff6db; color: var(--medium); }
  .sev.low { background: #f1f3f5; color: var(--low); }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 1rem 1.15rem;
    margin: 0 0 1rem;
  }
  .card h2 { margin: 0 0 0.75rem; font-size: 1rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.65rem 0.4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  tr.test:hover { background: #fafafa; }
  a.row { color: inherit; text-decoration: none; }
  a.row:hover .title { text-decoration: underline; }
  .issue-link { display: flex; gap: 0.75rem; align-items: baseline; padding: 0.7rem 0; border-bottom: 1px solid var(--line); color: inherit; text-decoration: none; }
  .issue-link:last-child { border-bottom: 0; }
  .issue-link:hover .title { text-decoration: underline; }
  .journal { list-style: none; padding: 0; margin: 0; }
  .journal li { padding: 0.35rem 0; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
  .journal code { color: var(--muted); font-size: 0.78rem; margin-right: 0.4rem; }
  .shot { margin: 0.75rem 0 0; }
  .shot img { display: block; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }
  .pair div { background: #f8f8f8; border-radius: 6px; padding: 0.75rem; }
  .pair h3 { margin: 0 0 0.4rem; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; }
  ol.repro { padding-left: 1.2rem; }
  ol.repro li { margin: 0.85rem 0; }
  details { margin-top: 1rem; }
  pre { white-space: pre-wrap; font-size: 0.8rem; background: #f8f8f8; padding: 0.75rem; border-radius: 6px; overflow: auto; }
</style>
</head>
<body>
<header>
  <h1>Egghead report ${badge}</h1>
  <nav class="crumbs">${crumbs}</nav>
</header>
<main>
${options.body}
</main>
</body>
</html>
`
}

export function renderIndex(sessions: IndexSession[]): string {
  const failed = sessions.filter((session) => session.status === 'failed').length
  const rows = sessions
    .map(
      (session) => `<tr class="test">
        <td><span class="badge ${session.status}">${session.status}</span></td>
        <td><a class="row" href="${escape(session.href)}"><span class="title">${escape(session.title)}</span></a></td>
        <td>${escape(session.project)}</td>
        <td>${session.startedAt ? escape(session.startedAt.replace('T', ' ').slice(0, 19)) : '—'}</td>
        <td>${session.issues}</td>
      </tr>`,
    )
    .join('')
  return page({
    title: 'Egghead report',
    crumbs: [{ href: './index.html', label: 'All tests' }],
    body: `
      <p class="meta">${sessions.length} test${sessions.length === 1 ? '' : 's'} · ${failed} with issues</p>
      <div class="card">
        <table>
          <thead><tr><th>Status</th><th>Test</th><th>Project</th><th>Started</th><th>Issues</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">No sessions yet.</td></tr>'}</tbody>
        </table>
      </div>
    `,
  })
}

export function renderSession(report: SessionReport): string {
  const status = report.issues.length ? 'failed' : 'passed'
  const counts = severityCounts(report)
  const explores = report.explores
    .map(
      (explore) => `<div class="card">
        <h2>Explore ${explore.index + 1}: ${escape(explore.mission)}</h2>
        <p class="meta">
          <span>Persona: ${escape(explore.persona.title)} (<code>${escape(explore.persona.id)}</code>)</span>
          <span>Timebox: ${Math.round(explore.timeboxMs / 1000)}s</span>
        </p>
        <p>${escape(explore.persona.profile)}</p>
      </div>`,
    )
    .join('')
  const journal = report.journal
    .map(
      (entry) =>
        `<li><code>${escape(entry.kind)}</code>${escape(entry.message)}</li>`,
    )
    .join('')
  const checks = report.checks
    .map((check) => `<li>${escape(check.title)} <span class="meta">(${escape(check.url)})</span></li>`)
    .join('')
  const issues = report.issues
    .map(
      (issue) => `<a class="issue-link" href="./issues/${escape(issue.id)}.html">
        <span class="sev ${escape(issue.severity)}">${escape(issue.severity)}</span>
        <strong>${escape(issue.id)}</strong>
        <span class="title">${escape(issue.title)}</span>
      </a>`,
    )
    .join('')

  return page({
    title: report.title,
    status,
    crumbs: [
      { href: '../index.html', label: 'All tests' },
      { href: './report.html', label: report.title },
    ],
    body: `
      <p class="meta">
        <span>${escape(report.titlePath.join(' › '))}</span>
        <span>${escape(report.project)}</span>
        <span>${durationLabel(report.startedAt, report.endedAt)}</span>
        ${report.url ? `<span><a href="${escape(report.url)}">${escape(report.url)}</a></span>` : ''}
      </p>
      <section class="card">
        <h2>Egghead report</h2>
        <p class="meta">
          <span>critical ${counts.critical}</span>
          <span>high ${counts.high}</span>
          <span>medium ${counts.medium}</span>
          <span>low ${counts.low}</span>
        </p>
      </section>
      ${explores}
      <section class="card">
        <h2>What it did</h2>
        <ol class="journal">${journal || '<li>No journal entries.</li>'}</ol>
      </section>
      <section class="card">
        <h2>Checks with no issues</h2>
        <ul>${checks || '<li>None recorded.</li>'}</ul>
      </section>
      <section class="card">
        <h2>Issues</h2>
        ${issues || '<p>None.</p>'}
      </section>
    `,
  })
}

export function renderIssue(report: SessionReport, issue: Issue): string {
  const steps = issue.reproSteps
    .map((step) => {
      const img = shot(report.sessionDir, step.screenshot, '../')
      return `<li><div>${escape(step.action)}</div>${img}</li>`
    })
    .join('')
  const extras = issue.screenshots
    .filter((path) => !issue.reproSteps.some((step) => step.screenshot === path))
    .map((path) => shot(report.sessionDir, path, '../'))
    .join('')

  return page({
    title: `${issue.id} — ${issue.title}`,
    status: 'failed',
    crumbs: [
      { href: '../../index.html', label: 'All tests' },
      { href: '../report.html', label: report.title },
      { href: `./${issue.id}.html`, label: issue.id },
    ],
    body: `
      <h2 style="margin-top:0">${escape(issue.id)} — ${escape(issue.title)}</h2>
      <p class="meta">
        <span class="sev ${escape(issue.severity)}">${escape(issue.severity)}</span>
        <span>${escape(issue.category)}</span>
        <span>Explore ${issue.exploreIndex + 1} · ${escape(issue.persona.title)}</span>
        <span><a href="${escape(issue.url)}">${escape(issue.url)}</a></span>
      </p>
      <section class="card">
        <p>${escape(issue.description)}</p>
        <p class="meta">Mission: ${escape(issue.mission)}</p>
        <div class="pair">
          <div><h3>Expected</h3><p>${escape(issue.expected)}</p></div>
          <div><h3>Actual</h3><p>${escape(issue.actual)}</p></div>
        </div>
      </section>
      <section class="card">
        <h2>Repro steps</h2>
        <ol class="repro">${steps}</ol>
        ${extras}
        <p class="meta">Repro video: ${escape(issue.video ?? 'see artifacts')}</p>
        ${
          issue.snapshot
            ? `<details><summary>Page snapshot</summary><pre>${escape(issue.snapshot)}</pre></details>`
            : ''
        }
      </section>
    `,
  })
}

/** @deprecated use renderSession */
export function renderHtml(report: SessionReport): string {
  return renderSession(report)
}
