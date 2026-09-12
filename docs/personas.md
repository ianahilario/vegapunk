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
} as const
```

Required fields on each entry: `id`, `title`, `profile`.

`explore({ persona })` takes a persona object from `createPersona()`, not a string. Passing `'elderly'` is a type error.

```ts
import { Persona } from '../personas'

await vegapunk.explore({
  page,
  mission: 'Explore adding, completing, and filtering todos.',
  persona: Persona.DEFAULT,
  timebox: '10m',
})
```

Convention: one `personas.ts` that charters import from. Vegapunk does not load personas by id and there is no `--persona` flag.

Starter keys in the sample lab: `Persona.DEFAULT` (everyday intended-path user), `Persona.MALICIOUS` (abusive inputs and URL tampering), `Persona.ELDERLY` (first-timer who misses small targets and subtle errors).
