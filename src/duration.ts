import type { Duration } from './types.js'

const PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/

export function parseDuration(value: Duration): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid timebox/timeout: ${value}`)
    }
    return value
  }

  const match = PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`Invalid duration "${value}". Use milliseconds or strings like "20m", "30s".`)
  }

  const amount = Number(match[1])
  const unit = match[2]
  if (unit === 'ms') return amount
  if (unit === 's') return amount * 1000
  if (unit === 'm') return amount * 60 * 1000
  return amount * 60 * 60 * 1000
}
