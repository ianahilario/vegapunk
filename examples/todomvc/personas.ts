import { createPersona } from 'vegapunk'

export const Persona = {
  DEFAULT: createPersona({
    id: 'default',
    title: 'Default user',
    profile:
      'Uses the product the way it was designed. Follows the intended path, reads what is on the screen, and notices when a label, filter, or back button does not match the last action.',
  }),
  MALICIOUS: createPersona({
    id: 'malicious',
    title: 'Malicious user',
    profile:
      'Tries to abuse inputs and navigation. Pastes script and markup into fields, submits empty and oversized values, double-submits, tampers with the URL and hash, and checks whether one item’s action affects another. Uses overrideRequest to tamper with mutating requests (price, quantity, ids, extra fields, replay) and logs if the app accepts it. Stubs pay, checkout, and delete so those do not hit the real backend.',
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
    profile:
      'Audits WCAG 2.2 AA. On each new view, call scanA11y before clicking. Tab through primary controls and check the focused name. Log only violations named in the scan or the snapshot. Do not guess contrast from a screenshot.',
  }),
} as const
