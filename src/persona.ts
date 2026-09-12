import { z } from 'zod'
import type { Persona } from './types.js'

const personaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  profile: z.string().min(1),
})

/**
 * Validate and return a {@link Persona} for `explore({ persona })`.
 *
 * Pass the returned object — not `id` as a string. `id` is the log/report slug;
 * `profile` is what the model follows each turn, so write concrete habits.
 *
 * @param persona - `id`, `title`, and `profile` are all required and non-empty.
 * @returns The same persona after validation.
 *
 * @example
 * ```ts
 * import { createPersona } from '@egghead/test'
 *
 * export const Persona = {
 *   DEFAULT: createPersona({
 *     id: 'default',
 *     title: 'Default user',
 *     profile: 'Uses the product the way it was designed.',
 *   }),
 *   MALICIOUS: createPersona({
 *     id: 'malicious',
 *     title: 'Malicious user',
 *     profile: 'Tries to abuse inputs, double-submit, and tamper with the URL.',
 *   }),
 *   ELDERLY: createPersona({
 *     id: 'elderly',
 *     title: 'Elderly first-time user',
 *     profile: 'In their 70s, new to the product. Prefers large targets and misses subtle error text.',
 *   }),
 * }
 * ```
 */
export function createPersona(persona: Persona): Persona {
  return personaSchema.parse(persona)
}
