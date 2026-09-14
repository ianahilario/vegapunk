import type { Page } from '@playwright/test'

export const A11Y_LINE_MAX = 240
export const A11Y_SNAPSHOT_MAX = 15
export const A11Y_NODES_PER_RULE = 2
export const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export type A11yViolation = {
  id: string
  impact?: string | null
  nodes: Array<{
    target?: unknown
    failureSummary?: string
  }>
}

export type FocusedControl = {
  role: string
  name: string
}

function targetLabel(target: unknown): string {
  if (Array.isArray(target) && target.length) {
    const first = target[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  if (typeof target === 'string' && target.trim()) return target.trim()
  return 'element'
}

function summaryLine(failureSummary?: string): string {
  if (!failureSummary?.trim()) return ''
  const lines = failureSummary.split('\n').map((line) => line.trim()).filter(Boolean)
  const detail = lines.find((line) => !/^fix\b/i.test(line)) ?? lines[0] ?? ''
  return detail.replace(/^[-:]\s*/, '')
}

export function formatA11yViolations(violations: A11yViolation[]): string[] {
  const lines: string[] = []
  for (const violation of violations) {
    for (const node of violation.nodes.slice(0, A11Y_NODES_PER_RULE)) {
      const impact = violation.impact?.trim() || 'minor'
      const target = targetLabel(node.target)
      const summary = summaryLine(node.failureSummary)
      const line = `${violation.id} ${impact} ${target}${summary ? ` — ${summary}` : ''}`
      lines.push(line.slice(0, A11Y_LINE_MAX))
    }
  }
  if (lines.length <= A11Y_SNAPSHOT_MAX) return lines
  const kept = A11Y_SNAPSHOT_MAX - 1
  return [...lines.slice(0, kept), `…and ${lines.length - kept} more`]
}

export async function focusedControl(page: Page): Promise<FocusedControl | null> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement) return null

    const input = el as HTMLInputElement
    const implicit: Record<string, string> = {
      A: 'link',
      BUTTON: 'button',
      SELECT: 'combobox',
      TEXTAREA: 'textbox',
      SUMMARY: 'button',
      IMG: 'img',
    }
    let role = el.getAttribute('role') || implicit[el.tagName] || ''
    if (!role && el.tagName === 'INPUT') {
      const type = input.type || 'text'
      role =
        type === 'checkbox'
          ? 'checkbox'
          : type === 'radio'
            ? 'radio'
            : type === 'search'
              ? 'searchbox'
              : type === 'submit' || type === 'button' || type === 'reset'
                ? 'button'
                : 'textbox'
    }
    if (!role) role = el.tagName.toLowerCase()

    let name = el.getAttribute('aria-label')?.trim() || ''
    if (!name) {
      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy) {
        name = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter(Boolean)
          .join(' ')
      }
    }
    if (!name && input.labels?.length) {
      name = Array.from(input.labels)
        .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean)
        .join(' ')
    }
    if (!name && 'alt' in el) name = (el as HTMLImageElement).alt.trim()
    if (!name && 'placeholder' in el) name = input.placeholder.trim()
    if (!name && el instanceof HTMLElement && el.title) name = el.title.trim()
    if (!name) name = (el.textContent ?? '').replace(/\s+/g, ' ').trim()

    return { role, name: name.slice(0, 80) }
  })
}
