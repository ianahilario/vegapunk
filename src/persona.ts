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
 * name it anything. `profile` is how this person uses the product. The agent
 * sees every tool and chooses what fits the persona and mission.
 *
 * @param persona - `id`, `title`, and `profile` are all required and non-empty.
 * @returns The same persona after validation.
 *
 * @example
 * ```ts
 * import { createPersona } from 'vegapunk'
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
 *     profile: 'Tries to abuse inputs and break out of the intended path.',
 *   }),
 *   ELDERLY: createPersona({
 *     id: 'elderly',
 *     title: 'Elderly first-time user',
 *     profile: 'In their 70s, new to the product. Prefers large targets and misses subtle error text.',
 *   }),
 *   A11YAUDITOR: createPersona({
 *     id: 'a11yauditor',
 *     title: 'Accessibility auditor',
 *     profile: 'Checks WCAG: names, contrast, and keyboard.',
 *   }),
 * }
 * ```
 */
export function createPersona(persona: Persona): Persona {
  return personaSchema.parse(persona)
}
