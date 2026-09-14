/**
 * Turn an agent-supplied URL or glob into a Playwright route pattern.
 * Only same-origin app traffic may be intercepted — not a catch-all glob,
 * and not a third-party checkout host.
 */
export function isTooBroadRoutePattern(url: string): boolean {
  const literal = url.replace(/[*/?]+/g, '')
  return literal.length < 3
}

export function prepareRoutePattern(
  url: string,
  current: URL,
): { ok: true; pattern: string } | { ok: false; error: string } {
  const trimmed = url.trim()
  if (!trimmed) {
    return { ok: false, error: 'Provide a URL pattern.' }
  }
  if (isTooBroadRoutePattern(trimmed)) {
    return {
      ok: false,
      error: 'URL pattern is too broad. Match a specific path such as **/checkout**.',
    }
  }

  if (trimmed.includes('*')) {
    const originMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\/([^*/]+)/i)
    if (originMatch) {
      try {
        const origin = new URL(`${originMatch[1]}://${originMatch[2]}`).origin
        if (origin !== current.origin) {
          return { ok: false, error: 'Stay on the application origin.' }
        }
      } catch {
        return { ok: false, error: 'URL pattern is invalid.' }
      }
    }
    return { ok: true, pattern: trimmed }
  }

  try {
    const next = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, current.origin)
    if (next.origin !== current.origin) {
      return { ok: false, error: 'Stay on the application origin.' }
    }
    return { ok: true, pattern: `${next.origin}${next.pathname}${next.search}**` }
  } catch {
    return { ok: false, error: 'URL pattern is invalid.' }
  }
}

export function guessContentType(body: string): string {
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'application/json'
  return 'text/plain'
}

export function clipText(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max)}…` : compact
}

export function prepareFetchUrl(
  url: string,
  current: URL,
): { ok: true; href: string } | { ok: false; error: string } {
  const trimmed = url.trim()
  if (!trimmed) {
    return { ok: false, error: 'Provide a URL.' }
  }
  if (trimmed.includes('*')) {
    return { ok: false, error: 'pageFetch needs a concrete URL, not a glob.' }
  }
  try {
    const next = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, current.origin)
    if (next.origin !== current.origin) {
      return { ok: false, error: 'Stay on the application origin.' }
    }
    return { ok: true, href: next.toString() }
  } catch {
    return { ok: false, error: 'URL is invalid.' }
  }
}

export function formatStorageEntries(
  kind: string,
  entries: Record<string, string | null>,
): string[] {
  const keys = Object.keys(entries).slice(0, 20)
  if (!keys.length) return [`${kind} (empty)`]
  return keys.map((key) => {
    const value = entries[key]
    const shown = value == null ? 'null' : clipText(value, 80)
    return `${kind} ${key}=${shown}`
  })
}
