export type AllowedOriginRule = {
  test: (origin: string) => boolean
  display: string
}

function originOf(url: string): string | undefined {
  try {
    const origin = new URL(url).origin
    if (!origin || origin === 'null') return undefined
    return origin
  } catch {
    return undefined
  }
}

function anchored(regex: RegExp): RegExp {
  const flags = regex.flags.replace(/[gy]/g, '')
  return new RegExp(`^(?:${regex.source})$`, flags)
}

export function parseAllowedOrigins(entries: (string | RegExp)[]): AllowedOriginRule[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      'vegapunk.config.ts requires allowedOrigins (at least one origin string or RegExp). The model is not called until the page origin matches.',
    )
  }

  return entries.map((entry, index) => {
    if (entry instanceof RegExp) {
      const pattern = anchored(entry)
      return {
        test: (origin) => pattern.test(origin),
        display: entry.toString(),
      }
    }
    if (typeof entry !== 'string') {
      throw new Error(
        `allowedOrigins[${index}] must be an origin string or a RegExp (got ${typeof entry}).`,
      )
    }
    const origin = originOf(entry)
    if (!origin) {
      throw new Error(
        `allowedOrigins[${index}] must be an absolute origin URL (got ${JSON.stringify(entry)}). Use a RegExp for patterns.`,
      )
    }
    return {
      test: (value) => value === origin,
      display: origin,
    }
  })
}

export function formatAllowedOrigins(allowed: AllowedOriginRule[]): string {
  return allowed.map((rule) => rule.display).join(', ')
}

export function isOriginAllowed(url: string, allowed: AllowedOriginRule[]): boolean {
  const origin = originOf(url)
  if (!origin) return false
  return allowed.some((rule) => rule.test(origin))
}

export class OriginRefusedError extends Error {
  readonly name = 'OriginRefusedError'
}

export function refusedOriginMessage(url: string, allowed: AllowedOriginRule[]): string {
  const origin = originOf(url) ?? url
  return (
    `Origin ${origin} is not on allowedOrigins. Refusing so production data is not sent to the model. ` +
    `Allowed: ${formatAllowedOrigins(allowed)}`
  )
}

export function isOriginRefusedError(error: unknown): boolean {
  if (error instanceof OriginRefusedError) return true
  if (error instanceof Error && isOriginRefusedError(error.cause)) return true
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('not on allowedOrigins')
}

export function assertAllowedOrigin(url: string, allowed: AllowedOriginRule[]): void {
  if (isOriginAllowed(url, allowed)) return
  throw new OriginRefusedError(refusedOriginMessage(url, allowed))
}
