import { expect, test, type TestInfo } from '@playwright/test'
import type { Page } from '@playwright/test'
import { runExplore } from './agent/explore.js'
import { createSession, type SessionState } from './agent/session.js'
import { writeSessionReport } from './report/write.js'
import type { ExploreOptions } from './types.js'

const sessions = new WeakMap<TestInfo, SessionState>()

function sessionFor(testInfo: TestInfo): SessionState {
  const existing = sessions.get(testInfo)
  if (existing) return existing
  const session = createSession(testInfo)
  sessions.set(testInfo, session)
  return session
}

function currentTestInfo(): TestInfo {
  try {
    return test.info()
  } catch {
    throw new Error('egghead.explore() must run inside a Playwright test.')
  }
}

/**
 * Drive a Playwright `page` with an AI agent.
 *
 * Import `test` from `@playwright/test` and call this from the test body.
 * Required: `page`, `mission`, `persona`, `timebox`.
 *
 * Call more than once if you want. Issues from one call do not skip later
 * calls. The test fails at the end if any issue was logged.
 *
 * @example
 * ```ts
 * import { test } from '@playwright/test'
 * import { egghead } from '@egghead/test'
 * import { Persona } from '../personas'
 *
 * test('a user can add, complete, and filter their items', { tag: '@todos' }, async ({ page }) => {
 *   await page.goto('./')
 *   await egghead.explore({
 *     page,
 *     mission: 'Explore adding, completing, and filtering todos.',
 *     persona: Persona.DEFAULT,
 *     timebox: 10 * 60 * 1000,
 *   })
 * })
 * ```
 */
export async function explore(options: ExploreOptions): Promise<void> {
  const page: Page | undefined = options.page
  if (!page) {
    throw new Error('egghead.explore() requires page.')
  }

  const testInfo = currentTestInfo()
  const session = sessionFor(testInfo)
  const before = session.issues.length

  await runExplore(page, session, options)

  writeSessionReport(session, page.url())
  await testInfo.attach('egghead-report', {
    path: `${session.sessionDir}/report.html`,
    contentType: 'text/html',
  })

  const found = session.issues.slice(before)
  const list = found.map((issue) => `${issue.id} ${issue.title}`).join('\n')
  expect
    .soft(
      found.length,
      found.length
        ? `${found.length} issue(s) found.\n${list}\nReport: ${session.sessionDir}/report.html`
        : '',
    )
    .toBe(0)
}

export const egghead = { explore }
