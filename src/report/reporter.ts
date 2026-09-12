import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter'
import { renderIndex, type IndexSession } from './html.js'
import { vegapunkReportDir } from './paths.js'
import type { SessionReport } from './types.js'
import { writeSessionHtml } from './write.js'

type Options = {
  open?: 'never' | 'always'
}

export default class VegapunkReporter implements Reporter {
  private outputDirs: string[] = []

  constructor(_options: Options = {}) {}

  printsToStdio(): boolean {
    return false
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.outputDirs = [...new Set(config.projects.map((project) => project.outputDir))]
  }

  async onEnd(_result: FullResult): Promise<void> {
    for (const dir of this.outputDirs) {
      const reportDir = vegapunkReportDir(dir)
      if (existsSync(reportDir)) writeIndex(reportDir)
    }
  }
}

export function writeIndex(outputDir: string): string {
  if (!existsSync(outputDir)) {
    throw new Error(`No results at ${outputDir}`)
  }
  const sessions: IndexSession[] = []
  for (const name of readdirSync(outputDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const jsonPath = join(outputDir, name.name, 'report.json')
    if (!existsSync(jsonPath)) continue
    const report = JSON.parse(readFileSync(jsonPath, 'utf8')) as SessionReport
    report.sessionDir = join(outputDir, name.name)
    writeSessionHtml(report)
    sessions.push({
      title: report.titlePath.join(' › ') || report.title,
      href: `./${name.name}/report.html`,
      issues: report.issues.length,
      project: report.project,
      startedAt: report.startedAt,
      status: report.issues.length ? 'failed' : 'passed',
    })
  }
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const html = renderIndex(sessions)
  const indexPath = join(outputDir, 'index.html')
  writeFileSync(indexPath, html)
  return indexPath
}
