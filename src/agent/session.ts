import { mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { TestInfo } from '@playwright/test'
import { eggheadReportDir } from '../report/paths.js'
import type { CheckOk, Issue, JournalEntry, Persona } from '../types.js'

export type ExploreSection = {
  index: number
  mission: string
  persona: Persona
  startedAt: string
  endedAt?: string
  timeboxMs: number
}

export type SessionState = {
  testInfo: TestInfo
  outputDir: string
  sessionDir: string
  startedAt: string
  callDeadline: number
  explores: ExploreSection[]
  journal: JournalEntry[]
  issues: Issue[]
  checks: CheckOk[]
  issueSeq: number
}

export function createSession(testInfo: TestInfo): SessionState {
  const startedAt = new Date()
  const reportRoot = eggheadReportDir(testInfo.project.outputDir)
  const sessionDir = join(reportRoot, basename(testInfo.outputDir))
  mkdirSync(join(sessionDir, 'screenshots'), { recursive: true })
  mkdirSync(join(sessionDir, 'videos'), { recursive: true })
  mkdirSync(join(sessionDir, 'traces'), { recursive: true })

  return {
    testInfo,
    outputDir: reportRoot,
    sessionDir,
    startedAt: startedAt.toISOString(),
    callDeadline: 0,
    explores: [],
    journal: [],
    issues: [],
    checks: [],
    issueSeq: 0,
  }
}
