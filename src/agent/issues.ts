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
  | { status: 'no-evidence' }

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
  },
): Promise<LogIssueOutcome> {
  const snapshot = await captureSnapshot(page)
  const evidence = input.evidence.trim()
  const inSnapshot = Boolean(evidence) && snapshot.toLowerCase().includes(evidence.toLowerCase())
  if (!inSnapshot && !input.visual) {
    return { status: 'no-evidence' }
  }
  if (!evidence) {
    return { status: 'no-evidence' }
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
