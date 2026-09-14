# Personas

A persona is who is exploring and how they use the product — not a writing voice.

Group them on one object so charters can write `Persona.DEFAULT`:

```ts
import { createPersona } from 'vegapunk'

export const Persona = {
  DEFAULT: createPersona({
    id: 'default',
    title: 'Default user',
    profile:
      'Uses the product the way it was designed. Notices when a label, filter, or back button does not match the last action.',
  }),
  MALICIOUS: createPersona({
    id: 'malicious',
    title: 'Malicious user',
    profile:
      'Tries to abuse inputs, double-submit, and tamper with the URL.',
  }),
  ELDERLY: createPersona({
    id: 'elderly',
    title: 'Elderly first-time user',
    profile:
      'In their 70s, new to the product. Reads slowly, prefers large tap targets, gets lost in nested menus, misses subtle error text.',
  }),
  A11YAUDITOR: createPersona({
    id: 'a11yauditor',
    title: 'Accessibility auditor',
    profile: 'Checks WCAG: names, contrast, and keyboard.',
  }),
} as const
```

Required fields on each entry: `id`, `title`, `profile`.

`id` is only a log slug — name it `kai` or `malicious`, it does not change which tools exist. The agent sees **every** tool and picks what fits this `profile` and the mission. Write who they are and how they use the product; you do not have to name `pageFetch` or `scanA11y` unless you want to.

`explore({ persona })` takes a persona object from `createPersona()`, not a string. Passing `'elderly'` is a type error.

```ts
import { Persona } from '../personas'

await vegapunk.explore({
  page,
  mission: 'Explore adding, completing, and filtering todos.',
  persona: Persona.DEFAULT,
})
```

Convention: one `personas.ts` that charters import from. Vegapunk does not load personas by a CLI flag.

Starter keys in the sample lab: `Persona.DEFAULT`, `Persona.MALICIOUS`, `Persona.ELDERLY`, `Persona.A11YAUDITOR`.
