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

  return `URL: ${url}\nTitle: ${title}\n\n${tree}${consoleBlock}`
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
