import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionState } from '../agent/session.js'
import { renderIssue, renderSession } from './html.js'
import type { SessionReport } from './types.js'

export function sessionToReport(session: SessionState, url?: string): SessionReport {
  return {
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    project: session.testInfo.project.name,
    title: session.testInfo.title,
    titlePath: session.testInfo.titlePath,
    repeatEachIndex: session.testInfo.repeatEachIndex,
    url,
    timeboxMs: session.explores.reduce((sum, explore) => sum + explore.timeboxMs, 0),
    explores: session.explores,
    journal: session.journal,
    issues: session.issues,
    checks: session.checks,
    sessionDir: session.sessionDir,
  }
}

export function writeSessionHtml(report: SessionReport): void {
  mkdirSync(join(report.sessionDir, 'issues'), { recursive: true })
  writeFileSync(join(report.sessionDir, 'report.html'), renderSession(report))
  for (const issue of report.issues) {
    writeFileSync(
      join(report.sessionDir, 'issues', `${issue.id}.html`),
      renderIssue(report, issue),
    )
  }
}

export function writeSessionReport(session: SessionState, url?: string): SessionReport {
  const report = sessionToReport(session, url)
  writeFileSync(join(session.sessionDir, 'report.json'), JSON.stringify(report, null, 2))
  writeSessionHtml(report)
  return report
}
