import type { Page } from '@playwright/test'

export async function captureViewport(page: Page): Promise<Buffer> {
  return page.screenshot({
    type: 'jpeg',
    quality: 50,
    fullPage: false,
    animations: 'disabled',
  })
}

export async function captureSnapshot(page: Page): Promise<string> {
  const url = page.url()
  const title = await page.title().catch(() => '')
  let tree = ''

  try {
    tree = await page.locator('body').ariaSnapshot()
  } catch {
    tree = await fallbackTree(page)
  }

  const consoles = consumeConsole(page)
  const consoleBlock = consoles.length
    ? `\nConsole since last snapshot:\n${consoles.join('\n')}`
    : ''
  const network = consumeNetwork(page)
  const networkBlock = network.length
    ? `\nNetwork since last snapshot:\n${network.join('\n')}`
    : ''

  const a11y = consumeA11y(page)
  const a11yBlock = a11y.length
    ? `\nA11y scan:\n${a11y.join('\n')}`
    : ''
  const keyboard = consumeKeyboard(page)
  const keyboardBlock = keyboard.length
    ? `\nKeyboard:\n${keyboard.join('\n')}`
    : ''
  const fetchLines = consumeFetch(page)
  const fetchBlock = fetchLines.length
    ? `\nFetch:\n${fetchLines.join('\n')}`
    : ''
  const storage = consumeStorage(page)
  const storageBlock = storage.length
    ? `\nStorage:\n${storage.join('\n')}`
    : ''
  const conditions = consumeConditions(page)
  const conditionsBlock = conditions.length
    ? `\nConditions:\n${conditions.join('\n')}`
    : ''

  return `URL: ${url}\nTitle: ${title}\n\n${tree}${consoleBlock}${networkBlock}${a11yBlock}${keyboardBlock}${fetchBlock}${storageBlock}${conditionsBlock}`
}

const consoleBuffer = new WeakMap<Page, string[]>()

export function attachConsole(page: Page): void {
  if (consoleBuffer.has(page)) return
  const lines: string[] = []
  consoleBuffer.set(page, lines)
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      lines.push(`[${type}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    lines.push(`[pageerror] ${error.message}`)
  })
}

function consumeConsole(page: Page): string[] {
  const lines = consoleBuffer.get(page)
  if (!lines?.length) return []
  const copy = lines.splice(0, lines.length)
  return copy
}

const networkBuffer = new WeakMap<Page, string[]>()
const NETWORK_BUFFER_MAX = 40
const NETWORK_SNAPSHOT_MAX = 20
const NETWORK_LINE_MAX = 240

function isApiRequest(resourceType: string): boolean {
  return resourceType === 'xhr' || resourceType === 'fetch'
}

function formatNetworkLine(method: string, url: string, suffix: string, postData?: string | null): string {
  let path = url
  try {
    const parsed = new URL(url)
    path = `${parsed.pathname}${parsed.search}`
  } catch {
    // keep the raw url
  }
  const body = postData?.trim()
    ? ` ${postData.length > 180 ? `${postData.slice(0, 180)}…` : postData}`
    : ''
  return `${method} ${path} ${suffix}${body}`.slice(0, NETWORK_LINE_MAX)
}

function pushNetwork(page: Page, line: string): void {
  const lines = networkBuffer.get(page)
  if (!lines) return
  lines.push(line)
  if (lines.length > NETWORK_BUFFER_MAX) {
    lines.splice(0, lines.length - NETWORK_BUFFER_MAX)
  }
}

export function attachNetwork(page: Page): void {
  if (networkBuffer.has(page)) return
  const lines: string[] = []
  networkBuffer.set(page, lines)
  page.on('response', (response) => {
    const request = response.request()
    if (!isApiRequest(request.resourceType())) return
    pushNetwork(
      page,
      formatNetworkLine(
        request.method(),
        request.url(),
        String(response.status()),
        request.postData(),
      ),
    )
  })
  page.on('requestfailed', (request) => {
    if (!isApiRequest(request.resourceType())) return
    const failure = request.failure()?.errorText ?? 'failed'
    pushNetwork(
      page,
      formatNetworkLine(request.method(), request.url(), failure, request.postData()),
    )
  })
}

function consumeNetwork(page: Page): string[] {
  const lines = networkBuffer.get(page)
  if (!lines?.length) return []
  const copy = lines.splice(0, lines.length)
  return copy.slice(-NETWORK_SNAPSHOT_MAX)
}

const a11yBuffer = new WeakMap<Page, string[]>()

export function recordA11yScan(page: Page, lines: string[]): void {
  a11yBuffer.set(page, [...lines])
}

function consumeA11y(page: Page): string[] {
  const lines = a11yBuffer.get(page)
  if (!lines?.length) return []
  a11yBuffer.set(page, [])
  return lines
}

const keyboardBuffer = new WeakMap<Page, string[]>()
const KEYBOARD_SNAPSHOT_MAX = 10

export function recordKeyboard(page: Page, line: string): void {
  const lines = keyboardBuffer.get(page) ?? []
  lines.push(line)
  if (lines.length > KEYBOARD_SNAPSHOT_MAX) {
    lines.splice(0, lines.length - KEYBOARD_SNAPSHOT_MAX)
  }
  keyboardBuffer.set(page, lines)
}

function consumeKeyboard(page: Page): string[] {
  const lines = keyboardBuffer.get(page)
  if (!lines?.length) return []
  keyboardBuffer.set(page, [])
  return lines
}

const fetchBuffer = new WeakMap<Page, string[]>()
const FETCH_SNAPSHOT_MAX = 10

export function recordFetch(page: Page, line: string): void {
  const lines = fetchBuffer.get(page) ?? []
  lines.push(line)
  if (lines.length > FETCH_SNAPSHOT_MAX) {
    lines.splice(0, lines.length - FETCH_SNAPSHOT_MAX)
  }
  fetchBuffer.set(page, lines)
}

function consumeFetch(page: Page): string[] {
  const lines = fetchBuffer.get(page)
  if (!lines?.length) return []
  fetchBuffer.set(page, [])
  return lines
}

const storageBuffer = new WeakMap<Page, string[]>()

export function recordStorage(page: Page, lines: string[]): void {
  storageBuffer.set(page, [...lines])
}

function consumeStorage(page: Page): string[] {
  const lines = storageBuffer.get(page)
  if (!lines?.length) return []
  storageBuffer.set(page, [])
  return lines
}

const conditionsBuffer = new WeakMap<Page, string[]>()
const CONDITIONS_SNAPSHOT_MAX = 10

export function recordCondition(page: Page, line: string): void {
  const lines = conditionsBuffer.get(page) ?? []
  lines.push(line)
  if (lines.length > CONDITIONS_SNAPSHOT_MAX) {
    lines.splice(0, lines.length - CONDITIONS_SNAPSHOT_MAX)
  }
  conditionsBuffer.set(page, lines)
}

function consumeConditions(page: Page): string[] {
  const lines = conditionsBuffer.get(page)
  if (!lines?.length) return []
  conditionsBuffer.set(page, [])
  return lines
}

async function fallbackTree(page: Page): Promise<string> {
  return page.evaluate(() => {
    const interesting = document.querySelectorAll(
      'a, button, input, textarea, select, [role], [contenteditable="true"]',
    )
    return Array.from(interesting)
      .slice(0, 80)
      .map((el, index) => {
        const role = el.getAttribute('role') || el.tagName.toLowerCase()
        const name =
          el.getAttribute('aria-label') ||
          (el as HTMLInputElement).placeholder ||
          el.textContent?.trim().slice(0, 80) ||
          ''
        return `- ${role} "${name}" [e${index + 1}]`
      })
      .join('\n')
  })
}

export async function looksBlocked(page: Page, snapshot: string): Promise<boolean> {
  const text = snapshot.toLowerCase()
  const blocked =
    /\b(verify|verification code|one-time|otp|2fa|mfa|authenticator|enter the code)\b/.test(
      text,
    )
  if (!blocked) return false
  const url = page.url().toLowerCase()
  return /login|signin|auth|verify|challenge/.test(url) || blocked
}
