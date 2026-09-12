import { tool } from 'ai'
import type { Page } from '@playwright/test'
import { z } from 'zod'
import { logIssue } from './issues.js'
import { journal } from './journal.js'
import type { SessionState } from './session.js'

const targetSchema = z.object({
  role: z.string().optional().describe('ARIA role, e.g. button, textbox, link'),
  name: z.string().optional().describe('Accessible name'),
  selector: z.string().optional().describe('CSS selector only if role+name cannot work'),
})

type Target = z.infer<typeof targetSchema>

function locator(page: Page, target: Target) {
  const role = target.role as Parameters<Page['getByRole']>[0] | undefined
  if (role && target.name) {
    const byName = page.getByRole(role, { name: target.name, exact: false })
    if (role === 'checkbox' || role === 'radio') {
      return page
        .getByRole('listitem')
        .filter({ hasText: target.name })
        .getByRole(role)
        .or(byName)
    }
    return byName
  }
  if (role) {
    return page.getByRole(role, { name: target.name, exact: false })
  }
  if (target.selector) return page.locator(target.selector)
  if (target.name) {
    // Placeholders are not labels. getByLabel("What needs to be done?") never
    // matches TodoMVC's new-todo field and times out for the full action budget.
    return page
      .getByRole('textbox', { name: target.name, exact: false })
      .or(page.getByRole('searchbox', { name: target.name, exact: false }))
      .or(page.getByPlaceholder(target.name, { exact: false }))
      .or(page.getByLabel(target.name))
  }
  throw new Error('Provide role+name or a selector.')
}

function appBase(baseURL: string | undefined, current: URL): URL {
  if (baseURL) {
    return new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`)
  }
  return new URL(`${current.origin}/`)
}

function resolveAppUrl(url: string, current: URL, baseURL?: string): URL {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    return new URL(url)
  }
  const root = appBase(baseURL, current)
  const relative = url.startsWith('/') ? url.slice(1) : url
  return new URL(relative || './', root)
}

function staysOnApp(next: URL, current: URL, baseURL?: string): boolean {
  if (next.origin !== current.origin) return false
  if (!baseURL) return true
  const prefix = appBase(baseURL, current).pathname.replace(/\/$/, '')
  if (!prefix) return true
  const path = next.pathname.replace(/\/$/, '') || '/'
  return path === prefix || path.startsWith(`${prefix}/`)
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0] ?? message
}

export function createTools(
  page: Page,
  session: SessionState,
  exploreIndex: number,
  control: {
    done: boolean
    lastActions: number[]
    mutatedThisStep: boolean
    issuesOnUnchangedView: number
  },
  options: { visual?: boolean } = {},
) {
  const remaining = () =>
    session.callDeadline ? session.callDeadline - Date.now() : Number.POSITIVE_INFINITY

  const rateLimit = () => {
    if (remaining() <= 0) {
      throw new Error('TIMEBOX')
    }
    const now = Date.now()
    control.lastActions = control.lastActions.filter((t) => now - t < 60_000)
    if (control.lastActions.length >= 40) {
      throw new Error('Too many actions per minute. Slow down.')
    }
    control.lastActions.push(now)
  }

  const actionTimeout = () => Math.max(500, Math.min(8_000, remaining()))

  const runAction = async <T>(fn: () => Promise<T>): Promise<T> => {
    rateLimit()
    control.mutatedThisStep = true
    try {
      const result = await fn()
      control.issuesOnUnchangedView = 0
      return result
    } catch (error) {
      if (remaining() <= 0) throw new Error('TIMEBOX')
      throw error
    }
  }

  const tryAction = async (
    label: string,
    fn: () => Promise<void>,
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    try {
      await runAction(fn)
      journal(session, exploreIndex, 'action', label)
      return { ok: true, url: page.url() }
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEBOX') throw error
      const message = firstLine(error)
      journal(session, exploreIndex, 'action', `${label} failed: ${message}`)
      return { ok: false, error: message }
    }
  }

  return {
    click: tool({
      description: 'Click a control.',
      parameters: targetSchema,
      execute: async (target) => {
        const loc = locator(page, target).first()
        return tryAction(
          `Click ${target.role ?? ''} ${target.name ?? target.selector ?? ''}`.trim(),
          () => loc.click({ timeout: actionTimeout() }),
        )
      },
    }),
    fill: tool({
      description: 'Fill a text field (clears existing value).',
      parameters: targetSchema.extend({
        value: z.string(),
      }),
      execute: async ({ value, ...target }) => {
        return tryAction(
          `Fill ${[target.role, target.name ?? target.selector ?? 'field'].filter(Boolean).join(' ')} with "${value}"`,
          () => locator(page, target).first().fill(value, { timeout: actionTimeout() }),
        )
      },
    }),
    press: tool({
      description: 'Press a key, optionally focused on a control.',
      parameters: targetSchema.extend({
        key: z.string(),
      }),
      execute: async ({ key, ...target }) => {
        return tryAction(`Press ${key}`, async () => {
          if (target.role || target.name || target.selector) {
            await locator(page, target).first().press(key, { timeout: actionTimeout() })
          } else {
            await page.keyboard.press(key)
          }
        })
      },
    }),
    check: tool({
      description: 'Check a checkbox or radio.',
      parameters: targetSchema,
      execute: async (target) => {
        return tryAction(`Check ${target.name ?? target.role}`, () =>
          locator(page, target).first().check({ timeout: actionTimeout() }),
        )
      },
    }),
    uncheck: tool({
      description: 'Uncheck a checkbox.',
      parameters: targetSchema,
      execute: async (target) => {
        return tryAction(`Uncheck ${target.name ?? target.role}`, () =>
          locator(page, target).first().uncheck({ timeout: actionTimeout() }),
        )
      },
    }),
    selectOption: tool({
      description: 'Choose an option in a select.',
      parameters: targetSchema.extend({
        value: z.string(),
      }),
      execute: async ({ value, ...target }) => {
        return tryAction(`Select ${value}`, async () => {
          await locator(page, target).first().selectOption(value, { timeout: actionTimeout() })
        })
      },
    }),
    goto: tool({
      description:
        'Go to a path or URL on this app. `/` is the config baseURL (the app), not the site origin.',
      parameters: z.object({
        url: z.string(),
      }),
      execute: async ({ url }) => {
        const current = new URL(page.url())
        const baseURL = session.testInfo.project.use.baseURL
        const next = resolveAppUrl(url, current, baseURL)
        if (!staysOnApp(next, current, baseURL)) {
          return { ok: false, error: 'Stay on the application baseURL.' }
        }
        return tryAction(`Go to ${next.pathname}${next.hash}`, async () => {
          await page.goto(next.toString(), { timeout: actionTimeout() })
        })
      },
    }),
    goBack: tool({
      description: 'Use the browser back button.',
      parameters: z.object({}),
      execute: async () => {
        return tryAction('Go back', async () => {
          await page.goBack({ timeout: actionTimeout() })
        })
      },
    }),
    logIssue: tool({
      description:
        'Record a bug that is visible on the current page once. Do not refile the same defect with a new title. After logging, take a user action or call done. Do not call this in the same turn as a click, fill, or navigation.',
      parameters: z.object({
        title: z.string(),
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        category: z.enum([
          'visual',
          'functional',
          'ux',
          'content',
          'performance',
          'console',
          'accessibility',
        ]),
        description: z.string(),
        expected: z.string(),
        actual: z.string(),
        evidence: z
          .string()
          .describe(
            'A short quote copied from the current snapshot that proves the failure (visible item, label, or error text).',
          ),
        reproSteps: z.array(z.string()).min(1),
        interactive: z
          .boolean()
          .describe('True if the bug needs a sequence of actions to reproduce'),
      }),
      execute: async (input) => {
        if (control.mutatedThisStep) {
          return {
            ok: false,
            error:
              'Wait for the next snapshot before logIssue. Do not log in the same turn as an action.',
          }
        }
        if (control.issuesOnUnchangedView >= 2) {
          return {
            ok: false,
            error:
              'You already logged issues on this unchanged view. Click, fill, filter, or call done.',
          }
        }
        const outcome = await logIssue(session, page, exploreIndex, {
          ...input,
          visual: options.visual,
        })
        if (outcome.status === 'no-evidence') {
          return {
            ok: false,
            error:
              'evidence is not in the current snapshot. Recreate the failing view, then log only what this snapshot shows.',
          }
        }
        if (outcome.status === 'duplicate') {
          return {
            ok: false,
            error: `Already logged as ${outcome.existing.id}: ${outcome.existing.title}. Do not log it again. Take a new action or call done.`,
          }
        }
        control.issuesOnUnchangedView += 1
        return { ok: true, id: outcome.issue.id, url: outcome.issue.url }
      },
    }),
    checkOk: tool({
      description: 'Record a check that found no issue.',
      parameters: z.object({
        title: z.string(),
      }),
      execute: async ({ title }) => {
        session.checks.push({
          title,
          url: page.url(),
          exploreIndex,
        })
        journal(session, exploreIndex, 'check', title)
        return { ok: true }
      },
    }),
    done: tool({
      description: 'End this explore() call. Use when the mission is complete or stuck.',
      parameters: z.object({
        summary: z.string(),
      }),
      execute: async ({ summary }) => {
        control.done = true
        journal(session, exploreIndex, 'wrap', summary)
        return { ok: true }
      },
    }),
  }
}
