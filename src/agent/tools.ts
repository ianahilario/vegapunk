import { AxeBuilder } from '@axe-core/playwright'
import { tool } from 'ai'
import type { CDPSession, Dialog, Page, Route } from '@playwright/test'
import { z } from 'zod'
import { A11Y_TAGS, focusedControl, formatA11yViolations } from './a11y.js'
import { logIssue } from './issues.js'
import { journal } from './journal.js'
import {
  clipText,
  formatStorageEntries,
  guessContentType,
  prepareFetchUrl,
  prepareRoutePattern,
} from './route.js'
import {
  recordA11yScan,
  recordCondition,
  recordFetch,
  recordKeyboard,
  recordStorage,
} from './snapshot.js'
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
    stop: () => void
  },
  options: { visual?: boolean } = {},
) {
  const installedRoutes: { pattern: string; handler: (route: Route) => Promise<void> }[] = []
  const dialogHandlers: Array<(dialog: Dialog) => void> = []
  let cdp: CDPSession | undefined

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
    tools: {
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
    tab: tool({
      description:
        'Move focus to the next (or previous) control and return its role and accessible name. Use this instead of press Tab when checking keyboard order.',
      parameters: z.object({
        shift: z.boolean().optional().describe('If true, tab backwards'),
      }),
      execute: async ({ shift }) => {
        const key = shift ? 'Shift+Tab' : 'Tab'
        try {
          await runAction(async () => {
            await page.keyboard.press(key)
          })
          const focused = await focusedControl(page)
          const label = focused
            ? `${key} to ${focused.role}${focused.name ? ` "${focused.name}"` : ''}`
            : `${key} (no focused control)`
          recordKeyboard(page, label)
          journal(session, exploreIndex, 'action', label)
          return { ok: true as const, url: page.url(), focused }
        } catch (error) {
          if (error instanceof Error && error.message === 'TIMEBOX') throw error
          const message = firstLine(error)
          journal(session, exploreIndex, 'action', `${key} failed: ${message}`)
          return { ok: false as const, error: message }
        }
      },
    }),
    scanA11y: tool({
      description:
        'Run an axe WCAG scan on the current page. Call this on each new view before guessing contrast or missing names. Findings appear in the next snapshot as A11y scan lines you can quote in logIssue.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const findings = await runAction(async () => {
            const results = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze()
            return formatA11yViolations(results.violations)
          })
          recordA11yScan(page, findings)
          const label = findings.length
            ? `A11y scan: ${findings.length} issue(s)`
            : 'A11y scan: no issues'
          journal(session, exploreIndex, 'action', label)
          return { ok: true as const, url: page.url(), issues: findings.length, findings }
        } catch (error) {
          if (error instanceof Error && error.message === 'TIMEBOX') throw error
          const message = firstLine(error)
          journal(session, exploreIndex, 'action', `A11y scan failed: ${message}`)
          return { ok: false as const, error: message }
        }
      },
    }),
    overrideRequest: tool({
      description:
        'Intercept matching in-page XHR/fetch. Call this BEFORE the click that fires the request. abort/fulfill so pay, checkout, and delete do not hit the real backend. tamper to send a body or header the UI would not allow.',
      parameters: z.object({
        url: z
          .string()
          .describe('Path or Playwright glob, e.g. /api/checkout or **/checkout**'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        action: z.enum(['abort', 'fulfill', 'tamper']),
        status: z.number().optional().describe('Status code when fulfilling. Default 200.'),
        body: z
          .string()
          .optional()
          .describe('JSON or text to fulfill with, or replacement POST body when tampering'),
        headers: z.record(z.string()).optional(),
        once: z.boolean().optional().describe('Remove the route after the first match'),
      }),
      execute: async ({ url, method, action, status, body, headers, once }) => {
        if (action === 'tamper' && body == null && (!headers || !Object.keys(headers).length)) {
          return { ok: false, error: 'tamper needs body or headers.' }
        }
        let current: URL
        try {
          current = new URL(page.url())
        } catch {
          return { ok: false, error: 'The page has no origin to intercept.' }
        }
        const prepared = prepareRoutePattern(url, current)
        if (!prepared.ok) return prepared
        const payloadNote = [
          body,
          headers && Object.keys(headers).length ? JSON.stringify(headers) : undefined,
        ]
          .filter((part): part is string => Boolean(part))
          .map((part) => (part.length > 180 ? `${part.slice(0, 180)}…` : part))
          .join(' ')
        const label = [
          'Override',
          method,
          url,
          '→',
          action,
          action === 'fulfill' ? String(status ?? 200) : '',
          action === 'abort' ? '' : payloadNote,
        ]
          .filter(Boolean)
          .join(' ')
        return tryAction(label, async () => {
          const handler = async (route: Route) => {
            try {
              const request = route.request()
              if (request.method() === 'OPTIONS') {
                await route.continue()
                return
              }
              const reqUrl = new URL(request.url())
              if (reqUrl.origin !== current.origin) {
                await route.continue()
                return
              }
              if (method && request.method().toUpperCase() !== method) {
                await route.continue()
                return
              }
              if (action === 'abort') {
                await route.abort()
                return
              }
              if (action === 'fulfill') {
                const payload = body ?? '{}'
                const contentType =
                  headers?.['content-type'] ??
                  headers?.['Content-Type'] ??
                  guessContentType(payload)
                await route.fulfill({
                  status: status ?? 200,
                  body: payload,
                  contentType,
                  headers,
                })
                return
              }
              await route.continue({
                postData: body,
                headers: headers ? { ...request.headers(), ...headers } : undefined,
              })
            } catch {
              await route.continue().catch(() => {})
            }
          }
          await page.route(prepared.pattern, handler, once ? { times: 1 } : undefined)
          installedRoutes.push({ pattern: prepared.pattern, handler })
        })
      },
    }),
    hover: tool({
      description: 'Hover a control to reveal tooltips or menus that only appear on hover.',
      parameters: targetSchema,
      execute: async (target) => {
        return tryAction(
          `Hover ${target.role ?? ''} ${target.name ?? target.selector ?? ''}`.trim(),
          () => locator(page, target).first().hover({ timeout: actionTimeout() }),
        )
      },
    }),
    setInputFiles: tool({
      description:
        'Attach in-memory file(s) to a file input. Use this instead of clicking the file picker.',
      parameters: targetSchema.extend({
        files: z
          .array(
            z.object({
              name: z.string(),
              mimeType: z.string().optional(),
              content: z.string().describe('UTF-8 text, or base64 when binary is true'),
              binary: z.boolean().optional(),
            }),
          )
          .min(1),
      }),
      execute: async ({ files, ...target }) => {
        const payloads = files.map((file) => ({
          name: file.name,
          mimeType: file.mimeType ?? (file.binary ? 'application/octet-stream' : 'text/plain'),
          buffer: Buffer.from(file.content, file.binary ? 'base64' : 'utf8'),
        }))
        return tryAction(
          `Set files ${payloads.map((file) => file.name).join(', ')} on ${target.name ?? target.selector ?? 'input'}`,
          () =>
            locator(page, target)
              .first()
              .setInputFiles(payloads, { timeout: actionTimeout() }),
        )
      },
    }),
    pageFetch: tool({
      description:
        'Send a same-origin HTTP request with the page cookies (IDOR, hidden endpoints, replay). Does not go through overrideRequest routes. Copy paths from Network lines. Quote the Fetch snapshot line in logIssue.',
      parameters: z.object({
        url: z.string().describe('Path or same-origin URL, e.g. /api/orders/124'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        body: z.string().optional(),
        headers: z.record(z.string()).optional(),
      }),
      execute: async ({ url, method, body, headers }) => {
        let current: URL
        try {
          current = new URL(page.url())
        } catch {
          return { ok: false, error: 'The page has no origin to fetch.' }
        }
        const prepared = prepareFetchUrl(url, current)
        if (!prepared.ok) return prepared
        const verb = method ?? 'GET'
        try {
          const result = await runAction(async () => {
            const response = await page.request.fetch(prepared.href, {
              method: verb,
              data: body,
              headers,
              timeout: actionTimeout(),
              failOnStatusCode: false,
              maxRedirects: 0,
            })
            const text = clipText(await response.text(), 180)
            const line = `${verb} ${new URL(prepared.href).pathname}${new URL(prepared.href).search} ${response.status()}${text ? ` ${text}` : ''}`
            recordFetch(page, line)
            return { status: response.status(), line }
          })
          journal(session, exploreIndex, 'action', `Fetch ${result.line}`)
          return { ok: true as const, url: page.url(), status: result.status, evidence: result.line }
        } catch (error) {
          if (error instanceof Error && error.message === 'TIMEBOX') throw error
          const message = firstLine(error)
          journal(session, exploreIndex, 'action', `Fetch ${verb} ${url} failed: ${message}`)
          return { ok: false as const, error: message }
        }
      },
    }),
    readStorage: tool({
      description:
        'Read localStorage, sessionStorage, or cookies on this origin. Findings appear as Storage lines in the next snapshot.',
      parameters: z.object({
        kind: z.enum(['local', 'session', 'cookie']),
        key: z.string().optional().describe('If omitted, list keys on this origin (capped)'),
      }),
      execute: async ({ kind, key }) => {
        try {
          const lines = await runAction(async () => {
            if (kind === 'cookie') {
              const cookies = await page.context().cookies(page.url())
              const selected = key ? cookies.filter((cookie) => cookie.name === key) : cookies
              const entries = Object.fromEntries(
                selected.slice(0, 20).map((cookie) => [cookie.name, cookie.value]),
              )
              return formatStorageEntries('cookie', entries)
            }
            const entries = await page.evaluate(
              ({ kind: store, key: name }) => {
                const storage = store === 'local' ? localStorage : sessionStorage
                if (name) return { [name]: storage.getItem(name) }
                const out: Record<string, string | null> = {}
                for (let index = 0; index < Math.min(storage.length, 20); index += 1) {
                  const itemKey = storage.key(index)
                  if (itemKey) out[itemKey] = storage.getItem(itemKey)
                }
                return out
              },
              { kind, key },
            )
            return formatStorageEntries(kind, entries)
          })
          recordStorage(page, lines)
          const label = `Read ${kind} storage (${lines.length})`
          journal(session, exploreIndex, 'action', label)
          return { ok: true as const, url: page.url(), entries: lines }
        } catch (error) {
          if (error instanceof Error && error.message === 'TIMEBOX') throw error
          const message = firstLine(error)
          journal(session, exploreIndex, 'action', `Read ${kind} storage failed: ${message}`)
          return { ok: false as const, error: message }
        }
      },
    }),
    writeStorage: tool({
      description:
        'Write a localStorage, sessionStorage, or cookie value on this origin. Reload or pageFetch afterward to see if the app trusts it.',
      parameters: z.object({
        kind: z.enum(['local', 'session', 'cookie']),
        key: z.string(),
        value: z.string(),
      }),
      execute: async ({ kind, key, value }) => {
        const shown = `${kind} ${key}=${clipText(value, 80)}`
        return tryAction(`Write ${shown}`, async () => {
          if (kind === 'cookie') {
            await page.context().addCookies([{ name: key, value, url: page.url() }])
          } else {
            await page.evaluate(
              ({ kind: store, key: name, value: next }) => {
                const storage = store === 'local' ? localStorage : sessionStorage
                storage.setItem(name, next)
              },
              { kind, key, value },
            )
          }
          recordStorage(page, [`wrote ${shown}`])
        })
      },
    }),
    handleDialog: tool({
      description:
        'Handle the next alert/confirm/prompt. Call this BEFORE the click that opens the dialog. Playwright otherwise dismisses it.',
      parameters: z.object({
        action: z.enum(['accept', 'dismiss']),
        promptText: z.string().optional().describe('Text to type into a prompt() when accepting'),
        once: z.boolean().optional().describe('Default true: only the next dialog'),
      }),
      execute: async ({ action, promptText, once }) => {
        const onceOnly = once !== false
        const label = `Dialog ${onceOnly ? 'next' : 'all'} → ${action}${promptText ? ` "${clipText(promptText, 40)}"` : ''}`
        return tryAction(label, async () => {
          const handler = async (dialog: Dialog) => {
            recordCondition(
              page,
              `Dialog ${dialog.type()} "${clipText(dialog.message(), 80)}" → ${action}`,
            )
            if (action === 'dismiss') await dialog.dismiss()
            else await dialog.accept(promptText)
          }
          if (onceOnly) page.once('dialog', handler)
          else page.on('dialog', handler)
          dialogHandlers.push(handler)
          recordCondition(page, label)
        })
      },
    }),
    emulateMedia: tool({
      description:
        'Emulate color scheme, reduced motion, or forced colors, then scanA11y or look at the snapshot.',
      parameters: z.object({
        colorScheme: z.enum(['dark', 'light', 'no-preference', 'null']).optional(),
        reducedMotion: z.enum(['reduce', 'no-preference', 'null']).optional(),
        forcedColors: z.enum(['active', 'none', 'null']).optional(),
      }),
      execute: async ({ colorScheme, reducedMotion, forcedColors }) => {
        if (colorScheme == null && reducedMotion == null && forcedColors == null) {
          return { ok: false, error: 'Set colorScheme, reducedMotion, or forcedColors.' }
        }
        const media = {
          colorScheme: colorScheme === 'null' ? null : colorScheme,
          reducedMotion: reducedMotion === 'null' ? null : reducedMotion,
          forcedColors: forcedColors === 'null' ? null : forcedColors,
        }
        const label = `Media ${[
          colorScheme && `colorScheme=${colorScheme}`,
          reducedMotion && `reducedMotion=${reducedMotion}`,
          forcedColors && `forcedColors=${forcedColors}`,
        ]
          .filter(Boolean)
          .join(' ')}`
        return tryAction(label, async () => {
          await page.emulateMedia(media)
          recordCondition(page, label)
        })
      },
    }),
    setNetwork: tool({
      description:
        'Go offline, online, or throttle to 3G so you can see loading and error states. Throttle needs Chromium.',
      parameters: z.object({
        profile: z.enum(['online', 'offline', 'slow3g', 'fast3g']),
      }),
      execute: async ({ profile }) => {
        return tryAction(`Network ${profile}`, async () => {
          if (profile === 'offline') {
            await page.context().setOffline(true)
            recordCondition(page, 'Network offline')
            return
          }
          await page.context().setOffline(false)
          if (profile === 'online') {
            if (cdp) {
              await cdp
                .send('Network.emulateNetworkConditions', {
                  offline: false,
                  latency: 0,
                  downloadThroughput: -1,
                  uploadThroughput: -1,
                })
                .catch(() => {})
            }
            recordCondition(page, 'Network online')
            return
          }
          const name = page.context().browser()?.browserType().name()
          if (name && name !== 'chromium') {
            throw new Error('Network throttle needs Chromium.')
          }
          cdp ??= await page.context().newCDPSession(page)
          const slow = profile === 'slow3g'
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: slow ? 2000 : 150,
            downloadThroughput: slow ? 50 * 1024 : 200 * 1024,
            uploadThroughput: slow ? 20 * 1024 : 100 * 1024,
          })
          recordCondition(page, `Network ${profile}`)
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
        control.stop()
        return { ok: true }
      },
    }),
    },
    dispose: async () => {
      const routes = installedRoutes.splice(0, installedRoutes.length)
      for (const { pattern, handler } of routes) {
        await page.unroute(pattern, handler).catch(() => {})
      }
      const handlers = dialogHandlers.splice(0, dialogHandlers.length)
      for (const handler of handlers) {
        page.off('dialog', handler)
      }
      await page.context().setOffline(false).catch(() => {})
      await page
        .emulateMedia({ colorScheme: null, reducedMotion: null, forcedColors: null })
        .catch(() => {})
      if (cdp) {
        await cdp
          .send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1,
          })
          .catch(() => {})
        await cdp.detach().catch(() => {})
        cdp = undefined
      }
    },
  }
}
