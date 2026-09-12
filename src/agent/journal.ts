import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JournalEntry } from '../types.js'
import type { SessionState } from './session.js'

export function journal(
  session: SessionState,
  exploreIndex: number,
  kind: JournalEntry['kind'],
  message: string,
): void {
  const entry: JournalEntry = {
    at: new Date().toISOString(),
    exploreIndex,
    kind,
    message,
  }
  session.journal.push(entry)
  appendFileSync(
    join(session.sessionDir, 'journal.ndjson'),
    `${JSON.stringify(entry)}\n`,
    'utf8',
  )
  const prefix = kind === 'issue' ? '!' : kind === 'action' ? '>' : '·'
  const persona = session.explores[exploreIndex]?.persona.id
  const tag = persona ? `[vegapunk - ${persona}]` : '[vegapunk]'
  console.log(`${tag} ${prefix} ${message}`)
}
