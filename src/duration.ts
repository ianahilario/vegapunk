import type { Duration } from './types.js'

export function parseDuration(value: Duration): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid timebox/timeout: ${value}`)
  }
  return value
}
