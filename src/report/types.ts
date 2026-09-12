import type { CheckOk, Issue, JournalEntry } from '../types.js'
import type { ExploreSection } from '../agent/session.js'

export type SessionReport = {
  startedAt: string
  endedAt: string
  project: string
  title: string
  titlePath: string[]
  repeatEachIndex: number
  url?: string
  timeboxMs: number
  explores: ExploreSection[]
  journal: JournalEntry[]
  issues: Issue[]
  checks: CheckOk[]
  sessionDir: string
}
