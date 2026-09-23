import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import type { Issue, IssueCategory, IssueSeverity, ReproStep } from '../types.js'
import { journal } from './journal.js'
import type { SessionState } from './session.js'
import { captureSnapshot } from './snapshot.js'

export type LogIssueOutcome =
  | { status: 'logged'; issue: Issue }
  | { status: 'duplicate'; existing: Issue }
  | { status: 'no-evidence'; reason: string }

const STOP = new Set([
  'the',
  'and',
  'are',
  'was',
  'with',
  'that',
  'this',
  'from',
  'make',
  'makes',
  'made',
  'nearly',
  'very',
  'most',
  'main',
  'page',
  'text',
  'issue',
  'issues',
  'severe',
  'critical',
  'high',
  'medium',
  'low',
  'failure',
  'failures',
  'almost',
  'completely',
  'extremely',
  'content',
  'unreadable',
  'invisible',
  'also',
])

function pageKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

function tokens(...parts: string[]): string[] {
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word))
}

function similar(left: string[], right: string[]): boolean {
  const a = new Set(left)
  const b = new Set(right)
  if (!a.size || !b.size) return false
  let overlap = 0
  for (const word of a) {
    if (b.has(word)) overlap += 1
  }
  const union = new Set([...a, ...b]).size
  return overlap / union >= 0.45 || overlap / Math.min(a.size, b.size) >= 0.75
}

export function findDuplicateIssue(
  issues: Issue[],
  url: string,
  input: { title: string; actual: string },
): Issue | undefined {
  const key = pageKey(url)
  const incoming = tokens(input.title, input.actual)
  return issues.find((issue) => {
    if (pageKey(issue.url) !== key) return false
    return similar(incoming, tokens(issue.title, issue.actual))
  })
}

const QUOTED = /"([^"\n]+)"|'([^'\n]+)'|“([^”\n]+)”/g

/** Quotes in `actual` are claims about what is on screen. A long paraphrase of an a11y line still counts. */
export function quotedPhrases(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(QUOTED)) {
    const phrase = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (phrase.length >= 2) found.push(phrase)
  }
  return found
}

export function textInSnapshot(snapshot: string, text: string): boolean {
  const haystack = snapshot.toLowerCase()
  const needle = text.trim().toLowerCase()
  if (needle.length < 2) return false
  if (haystack.includes(needle)) return true
  const words = needle.split(/\s+/).filter(Boolean)
  if (words.length < 6) return false
  for (let index = 0; index + 6 <= words.length; index += 1) {
    if (haystack.includes(words.slice(index, index + 6).join(' '))) return true
  }
  return false
}

/**
 * Reject a filed issue whose proof is not on this page.
 * Visual-category defects (overlap, clip, overflow) may cite the screenshot.
 * Every other category must quote the snapshot. Quotes in `actual` must be on this page
 * even for visual defects — a remembered label from an earlier screen is not evidence.
 */
export function ungroundedClaim(
  snapshot: string,
  input: { evidence: string; actual: string; category: IssueCategory; visual?: boolean },
): string | undefined {
  const evidence = input.evidence.trim()
  if (!evidence) {
    return 'evidence is empty. Quote the current snapshot, or describe a visual defect you can see.'
  }
  const screenshotOnly = Boolean(input.visual) && input.category === 'visual'
  if (!screenshotOnly && !textInSnapshot(snapshot, evidence)) {
    return 'evidence is not in the current snapshot. Recreate the failing view, then log only what this snapshot shows.'
  }
  const missing = quotedPhrases(input.actual).filter((phrase) => !textInSnapshot(snapshot, phrase))
  if (missing.length) {
    const listed = missing.map((phrase) => `"${phrase}"`).join(', ')
    const verb = missing.length > 1 ? 'are' : 'is'
    return `${listed} ${verb} not in the current snapshot. Do not report an item the page does not show. A count such as "1 item left" is not that item.`
  }
  return undefined
}

export async function logIssue(
  session: SessionState,
  page: Page,
  exploreIndex: number,
  input: {
    title: string
    severity: IssueSeverity
    category: IssueCategory
    description: string
    expected: string
    actual: string
    evidence: string
    reproSteps: string[]
    interactive: boolean
    visual?: boolean
    /** Snapshot the model was shown this turn. One-shot notes are already consumed on a second capture. */
    snapshot?: string
  },
): Promise<LogIssueOutcome> {
  const snapshot = input.snapshot?.trim() ? input.snapshot : await captureSnapshot(page)
  const reason = ungroundedClaim(snapshot, input)
  if (reason) {
    return { status: 'no-evidence', reason }
  }

  const duplicate = findDuplicateIssue(session.issues, page.url(), input)
  if (duplicate) {
    return { status: 'duplicate', existing: duplicate }
  }

  session.issueSeq += 1
  const id = `ISSUE-${String(session.issueSeq).padStart(3, '0')}`
  const explore = session.explores[exploreIndex]
  const screenshotPath = join('screenshots', `${id}.png`)
  await page.screenshot({
    path: join(session.sessionDir, screenshotPath),
    fullPage: true,
  })

  const steps: ReproStep[] = []
  for (const [index, action] of input.reproSteps.entries()) {
    const stepShot = join('screenshots', `${id}-step-${index + 1}.png`)
    if (index === input.reproSteps.length - 1) {
      steps.push({ action, screenshot: screenshotPath })
    } else {
      steps.push({ action, screenshot: stepShot })
    }
  }

  const issue: Issue = {
    id,
    title: input.title,
    severity: input.severity,
    category: input.category,
    url: page.url(),
    description: input.description,
    expected: input.expected,
    actual: input.actual,
    reproSteps: steps,
    screenshots: [screenshotPath],
    video: input.interactive ? undefined : 'N/A',
    snapshot,
    exploreIndex,
    mission: explore?.mission ?? '',
    persona: {
      id: explore?.persona.id ?? '',
      title: explore?.persona.title ?? '',
    },
  }

  session.issues.push(issue)
  writeFileSync(
    join(session.sessionDir, 'issues.json'),
    JSON.stringify(session.issues, null, 2),
    'utf8',
  )
  journal(session, exploreIndex, 'issue', `${id} ${input.title}`)
  return { status: 'logged', issue }
}
