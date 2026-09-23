import type { Page } from '@playwright/test'
import type { AiConfig, ExploreOptions, IssueCategory, IssueSeverity, Persona } from '../types.js'
import { assertAllowedOrigin, isOriginRefusedError, type AllowedOriginRule } from './allowed-origin.js'
import { journal } from './journal.js'
import type { SessionState } from './session.js'
import { captureSnapshot } from './snapshot.js'
import {
  parseNetworkPaths,
  parseSnapshotControls,
  parseStorageKeys,
  snapshotBlock,
  snapshotUrl,
  type SnapshotControl,
} from './targets.js'
import type { createTools } from './tools.js'

type BoundTools = ReturnType<typeof createTools>['tools']

const MAX_STEPS = 80
const MIN_TURN_MS = 2_000
const MAX_CANDIDATES = 20
const DEFECT_THRESHOLD = 0.7
const FILE_NAME = /file|upload|attach|browse|choose/i
const PRESS_KEYS = [
  'Enter',
  'Escape',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Backspace',
]

const TOOL_LABELS: Partial<Record<keyof BoundTools, string>> = {
  click: 'Click a named control.',
  fill: 'Type into a text field and press Enter.',
  press: 'Press a key (Enter, Escape, arrows, Space, Backspace).',
  check: 'Check a checkbox, radio, or switch.',
  uncheck: 'Uncheck a checkbox or switch.',
  selectOption: 'Choose an option in a select or combobox.',
  hover: 'Hover a control to reveal a tooltip or menu.',
  tab: 'Move focus with Tab (or Shift+Tab).',
  goto: 'Go to an app path from this snapshot.',
  goBack: 'Use the browser back button.',
  setInputFiles: 'Attach a canned file to a file control.',
  handleDialog: 'Accept or dismiss the next alert/confirm/prompt (call before the click).',
  overrideRequest: 'Abort or fulfill a same-origin XHR/fetch seen in Network/Fetch lines.',
  pageFetch: 'Send a cookie-authenticated GET to a path from Network/Fetch lines.',
  setNetwork: 'Go offline, online, or throttle to 3G.',
  readStorage: 'Read localStorage, sessionStorage, or cookies.',
  writeStorage: 'Write a storage or cookie value on this origin.',
  scanA11y: 'Run an axe WCAG scan of this view.',
  emulateMedia: 'Emulate dark mode, reduced motion, or forced colors.',
  checkOk: 'Record that this view looks correct, then continue.',
  done: 'Stop. The mission is complete, blocked, or has no useful next step.',
}

const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical']

type ToolControl = {
  done: boolean
  lastActions: number[]
  mutatedThisStep: boolean
  issuesOnUnchangedView: number
  turnSnapshot: string
  stop: () => void
}

export type JevCandidate = {
  id: string
  label: string
  tool: keyof BoundTools
  args: Record<string, unknown>
  submit?: boolean
}

type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence?: number }
  | { type: 'score'; score: number }

type DecideFn = (
  questions: Record<string, unknown>,
  state: unknown,
  signal: AbortSignal,
) => Promise<Record<string, JevAnswer>>

export function isJevModel(model: string): boolean {
  return /typesafe\/jev/i.test(model)
}

export function decisionsUrl(baseURL?: string): string {
  if (!baseURL) return 'https://openrouter.ai/api/alpha/decisions'
  const trimmed = baseURL.replace(/\/$/, '')
  if (/\/alpha\/decisions$/i.test(trimmed)) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed.slice(0, -3)}/alpha/decisions`
  return `${trimmed}/alpha/decisions`
}

function clip(value: string, max = 48): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export function fillCatalog(
  personaId: string,
  mission: string,
): { value: string; label: string }[] {
  if (personaId === 'malicious') {
    return [
      { value: '', label: 'an empty value' },
      { value: '<script>alert(1)</script>', label: 'a script payload' },
    ]
  }
  const quoted = [...mission.matchAll(/["']([^"']{2,60})["']/g)].map((match) => match[1] ?? '')
  const first = quoted[0] || 'Buy milk'
  const second = quoted[1] || 'Walk the dog'
  if (first === second) return [{ value: first, label: `"${clip(first)}"` }]
  return [
    { value: first, label: `"${clip(first)}"` },
    { value: second, label: `"${clip(second)}"` },
  ]
}

function targetArgs(control: SnapshotControl): Record<string, unknown> {
  return { role: control.role, name: control.name }
}

function pushCandidate(list: JevCandidate[], candidate: JevCandidate): void {
  if (list.length >= MAX_CANDIDATES) return
  list.push(candidate)
}

function clickable(controls: SnapshotControl[]): SnapshotControl[] {
  return controls.filter(
    (control) =>
      control.role !== 'textbox' &&
      control.role !== 'searchbox' &&
      control.role !== 'option',
  )
}

function checks(controls: SnapshotControl[], checked: boolean): SnapshotControl[] {
  return controls.filter(
    (control) =>
      (control.role === 'checkbox' || control.role === 'radio' || control.role === 'switch') &&
      Boolean(control.checked) === checked,
  )
}

function fileControls(controls: SnapshotControl[]): SnapshotControl[] {
  return controls.filter((control) => FILE_NAME.test(control.name))
}

function cannedFiles(personaId: string): { name: string; mimeType: string; content: string }[] {
  if (personaId === 'malicious') {
    return [{ name: 'upload.html', mimeType: 'text/html', content: '<script>alert(1)</script>' }]
  }
  return [{ name: 'upload.txt', mimeType: 'text/plain', content: 'hello from vegapunk' }]
}

function writeCatalog(
  personaId: string,
  snapshot: string,
): { kind: string; key: string; value: string; label: string }[] {
  const writes: { kind: string; key: string; value: string; label: string }[] = []
  for (const entry of parseStorageKeys(snapshot).slice(0, 4)) {
    writes.push({
      kind: entry.kind,
      key: entry.key,
      value: personaId === 'malicious' ? '<script>' : 'tampered',
      label: `Overwrite ${entry.kind} "${entry.key}"`,
    })
  }
  writes.push({
    kind: 'local',
    key: 'debug',
    value: 'true',
    label: 'Set localStorage debug=true',
  })
  if (personaId === 'malicious') {
    writes.push({
      kind: 'cookie',
      key: 'session',
      value: 'forged',
      label: 'Set cookie session=forged',
    })
  }
  return writes
}

/** Argument options for one Playwright tool. Empty means that tool is not offered this turn. */
export function buildJevCandidates(
  snapshot: string,
  persona: Persona,
  mission: string,
  tool: keyof BoundTools,
): JevCandidate[] {
  const controls = parseSnapshotControls(snapshot)
  const textboxes = controls.filter(
    (control) => control.role === 'textbox' || control.role === 'searchbox',
  )
  const options = controls.filter((control) => control.role === 'option')
  const combobox = controls.find((control) => control.role === 'combobox' || control.role === 'listbox')
  const network = parseNetworkPaths(snapshot)
  const candidates: JevCandidate[] = []

  switch (tool) {
    case 'click':
      for (const [index, control] of clickable(controls).entries()) {
        pushCandidate(candidates, {
          id: `click_${index}`,
          label: `Click ${control.role} "${clip(control.name)}"`,
          tool,
          args: targetArgs(control),
        })
      }
      break
    case 'hover':
      for (const [index, control] of clickable(controls).entries()) {
        pushCandidate(candidates, {
          id: `hover_${index}`,
          label: `Hover ${control.role} "${clip(control.name)}"`,
          tool,
          args: targetArgs(control),
        })
      }
      break
    case 'fill': {
      const values = fillCatalog(persona.id, mission)
      for (const [index, control] of textboxes.entries()) {
        for (const [valueIndex, entry] of values.entries()) {
          pushCandidate(candidates, {
            id: `fill_${index}_${valueIndex}`,
            label: `Type ${entry.label} into ${control.role} "${clip(control.name)}" and press Enter`,
            tool,
            args: { ...targetArgs(control), value: entry.value },
            submit: true,
          })
        }
      }
      break
    }
    case 'check':
      for (const [index, control] of checks(controls, false).entries()) {
        pushCandidate(candidates, {
          id: `check_${index}`,
          label: `Check ${control.role} "${clip(control.name)}"`,
          tool,
          args: targetArgs(control),
        })
      }
      break
    case 'uncheck':
      for (const [index, control] of checks(controls, true).entries()) {
        pushCandidate(candidates, {
          id: `uncheck_${index}`,
          label: `Uncheck ${control.role} "${clip(control.name)}"`,
          tool,
          args: targetArgs(control),
        })
      }
      break
    case 'selectOption': {
      const select = combobox ?? { role: 'combobox', name: undefined as string | undefined }
      for (const [index, option] of options.entries()) {
        pushCandidate(candidates, {
          id: `select_${index}`,
          label: `Select "${clip(option.name)}"`,
          tool,
          args: {
            role: select.role,
            ...(select.name ? { name: select.name } : {}),
            value: option.name,
          },
        })
      }
      break
    }
    case 'press':
      for (const key of PRESS_KEYS) {
        const focused = textboxes[0]
        pushCandidate(candidates, {
          id: `press_${key}`,
          label: focused
            ? `Press ${key} on ${focused.role} "${clip(focused.name)}"`
            : `Press ${key}`,
          tool,
          args: focused ? { ...targetArgs(focused), key } : { key },
        })
      }
      break
    case 'tab':
      pushCandidate(candidates, {
        id: 'tab_next',
        label: 'Tab to the next control.',
        tool,
        args: {},
      })
      pushCandidate(candidates, {
        id: 'tab_prev',
        label: 'Shift+Tab to the previous control.',
        tool,
        args: { shift: true },
      })
      break
    case 'goto': {
      pushCandidate(candidates, {
        id: 'goto_base',
        label: 'Go to the app base (./).',
        tool,
        args: { url: './' },
      })
      const pageUrl = snapshotUrl(snapshot)
      if (pageUrl) {
        try {
          const parsed = new URL(pageUrl)
          if (parsed.hash) {
            pushCandidate(candidates, {
              id: 'goto_nohash',
              label: `Go to ${parsed.pathname} (drop hash)`,
              tool,
              args: { url: `${parsed.pathname}${parsed.search}` },
            })
          }
        } catch {
          // ignore
        }
      }
      for (const [index, entry] of network.slice(0, 6).entries()) {
        pushCandidate(candidates, {
          id: `goto_${index}`,
          label: `Go to ${clip(entry.path)}`,
          tool,
          args: { url: entry.path },
        })
      }
      break
    }
    case 'goBack':
      pushCandidate(candidates, { id: 'goBack', label: 'Go back.', tool, args: {} })
      break
    case 'setInputFiles': {
      const files = cannedFiles(persona.id)
      for (const [index, control] of fileControls(controls).entries()) {
        pushCandidate(candidates, {
          id: `files_${index}`,
          label: `Attach ${files.map((file) => file.name).join(', ')} to "${clip(control.name)}"`,
          tool,
          args: { ...targetArgs(control), files },
        })
      }
      break
    }
    case 'handleDialog':
      pushCandidate(candidates, {
        id: 'dialog_accept',
        label: 'Accept the next dialog.',
        tool,
        args: { action: 'accept' },
      })
      pushCandidate(candidates, {
        id: 'dialog_dismiss',
        label: 'Dismiss the next dialog.',
        tool,
        args: { action: 'dismiss' },
      })
      break
    case 'overrideRequest':
      for (const [index, entry] of network.slice(0, 5).entries()) {
        pushCandidate(candidates, {
          id: `override_abort_${index}`,
          label: `Abort ${entry.method} ${clip(entry.path)}`,
          tool,
          args: { url: entry.path, method: entry.method, action: 'abort', once: true },
        })
        pushCandidate(candidates, {
          id: `override_fail_${index}`,
          label: `Fulfill ${entry.method} ${clip(entry.path)} with 500`,
          tool,
          args: {
            url: entry.path,
            method: entry.method,
            action: 'fulfill',
            status: 500,
            body: '{"error":true}',
            once: true,
          },
        })
      }
      break
    case 'pageFetch':
      for (const [index, entry] of network.slice(0, 8).entries()) {
        pushCandidate(candidates, {
          id: `fetch_${index}`,
          label: `Fetch ${entry.method} ${clip(entry.path)}`,
          tool,
          args: { url: entry.path, method: entry.method },
        })
      }
      break
    case 'setNetwork':
      for (const profile of ['online', 'offline', 'slow3g', 'fast3g'] as const) {
        pushCandidate(candidates, {
          id: `net_${profile}`,
          label: `Network ${profile}`,
          tool,
          args: { profile },
        })
      }
      break
    case 'readStorage':
      for (const kind of ['local', 'session', 'cookie'] as const) {
        pushCandidate(candidates, {
          id: `read_${kind}`,
          label: `Read ${kind} storage`,
          tool,
          args: { kind },
        })
      }
      break
    case 'writeStorage':
      for (const [index, entry] of writeCatalog(persona.id, snapshot).entries()) {
        pushCandidate(candidates, {
          id: `write_${index}`,
          label: entry.label,
          tool,
          args: { kind: entry.kind, key: entry.key, value: entry.value },
        })
      }
      break
    case 'scanA11y':
      pushCandidate(candidates, { id: 'scanA11y', label: TOOL_LABELS.scanA11y!, tool, args: {} })
      break
    case 'emulateMedia':
      pushCandidate(candidates, {
        id: 'media_dark',
        label: 'Emulate dark color scheme.',
        tool,
        args: { colorScheme: 'dark' },
      })
      pushCandidate(candidates, {
        id: 'media_light',
        label: 'Emulate light color scheme.',
        tool,
        args: { colorScheme: 'light' },
      })
      pushCandidate(candidates, {
        id: 'media_motion',
        label: 'Emulate reduced motion.',
        tool,
        args: { reducedMotion: 'reduce' },
      })
      pushCandidate(candidates, {
        id: 'media_forced',
        label: 'Emulate forced colors.',
        tool,
        args: { forcedColors: 'active' },
      })
      break
    case 'checkOk':
      pushCandidate(candidates, {
        id: 'checkOk',
        label: 'Record that this view looks correct.',
        tool,
        args: { title: clip(mission, 80) || 'This view looks correct' },
      })
      break
    case 'done':
      pushCandidate(candidates, {
        id: 'done',
        label: TOOL_LABELS.done!,
        tool,
        args: { summary: 'Jev ended the explore.' },
      })
      break
    default:
      break
  }

  return candidates
}

export function jevToolChoices(
  snapshot: string,
  persona: Persona,
  mission: string,
): Record<string, string> {
  const choices: Record<string, string> = {}
  for (const [tool, label] of Object.entries(TOOL_LABELS) as [keyof BoundTools, string][]) {
    if (buildJevCandidates(snapshot, persona, mission, tool).length) {
      choices[tool] = label
    }
  }
  return choices
}

export function issueEvidence(kind: string, snapshot: string): string | undefined {
  const blocks: Record<string, string> = {
    console: 'Console since last snapshot:',
    network: 'Network since last snapshot:',
    accessibility: 'A11y scan:',
  }
  const heading = blocks[kind]
  if (heading) {
    const line = snapshotBlock(snapshot, heading)[0]
    if (line) return line
  }
  const named = parseSnapshotControls(snapshot)[0]
  if (named) return named.name
  const url = snapshot.match(/^URL:\s*(.+)$/m)?.[1]?.trim()
  return url
}

export function severityFromScore(score: number): IssueSeverity {
  const index = Math.min(SEVERITIES.length - 1, Math.max(0, Math.round(score)))
  return SEVERITIES[index] ?? 'medium'
}

const KIND_CATEGORY: Record<string, IssueCategory> = {
  console: 'console',
  network: 'functional',
  accessibility: 'accessibility',
  functional: 'functional',
  ux: 'ux',
  content: 'content',
}

function kindTitle(kind: string, pageTitle: string): string {
  const titles: Record<string, string> = {
    console: 'Console error on this view',
    network: 'Network request failed on this view',
    accessibility: 'Accessibility failure on this view',
    functional: 'Control or state does not match the last action',
    ux: 'Missing feedback after an action',
    content: 'Label or copy is wrong or empty',
  }
  const base = titles[kind] ?? 'Unexpected behavior on this view'
  return pageTitle ? `${base} (${pageTitle})` : base
}

async function decide(
  ai: AiConfig,
  questions: Record<string, unknown>,
  state: unknown,
  signal: AbortSignal,
): Promise<Record<string, JevAnswer>> {
  const response = await fetch(decisionsUrl(ai.baseURL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/ianahilario/vegapunk',
      'X-OpenRouter-Title': 'vegapunk',
    },
    body: JSON.stringify({
      model: ai.model,
      state,
      questions,
    }),
    signal,
  })
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`Jev decisions request failed (${response.status}): ${raw.slice(0, 400)}`)
  }
  let parsed: { answers?: Record<string, JevAnswer>; error?: { message?: string } }
  try {
    parsed = JSON.parse(raw) as { answers?: Record<string, JevAnswer>; error?: { message?: string } }
  } catch {
    throw new Error(`Jev returned non-JSON: ${raw.slice(0, 400)}`)
  }
  if (!parsed.answers) {
    throw new Error(parsed.error?.message ?? 'Jev response had no answers.')
  }
  return parsed.answers
}

function noul(answers: Record<string, JevAnswer>, id: string): number {
  const answer = answers[id]
  return answer?.type === 'noul' ? answer.noul : 0
}

function choice(answers: Record<string, JevAnswer>, id: string): string | undefined {
  const answer = answers[id]
  return answer?.type === 'choice' ? answer.choice : undefined
}

function score(answers: Record<string, JevAnswer>, id: string): number {
  const answer = answers[id]
  return answer?.type === 'score' ? answer.score : 1
}

function isTimeboxStop(error: unknown): boolean {
  if (error == null) return false
  const name = error instanceof Error ? error.name : ''
  if (name === 'AbortError' || name === 'TimeoutError') return true
  const message = error instanceof Error ? error.message : String(error)
  return /TIMEBOX|aborted|AbortError/i.test(message)
}

async function invoke(
  tools: BoundTools,
  name: keyof BoundTools,
  args: Record<string, unknown>,
  abortSignal: AbortSignal,
  step: number,
): Promise<unknown> {
  const selected = tools[name]
  if (!selected.execute) {
    throw new Error(`Jev picked ${String(name)}, which has no execute function.`)
  }
  return selected.execute(args as never, {
    abortSignal,
    toolCallId: `jev-${step}-${String(name)}`,
    messages: [],
  })
}

function snapshotTitle(snapshot: string): string {
  return snapshot.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

function reproSteps(session: SessionState, exploreIndex: number): string[] {
  const actions = session.journal
    .filter((entry) => entry.exploreIndex === exploreIndex && entry.kind === 'action')
    .map((entry) => entry.message.replace(/ failed:.*$/, ''))
  return actions.length ? actions.slice(-8) : ['Open the current page']
}

export async function runJevExplore(input: {
  page: Page
  session: SessionState
  exploreIndex: number
  options: ExploreOptions
  ai: AiConfig
  tools: BoundTools
  toolControl: ToolControl
  abort: AbortController
  callDeadline: number
  allowedOrigins: AllowedOriginRule[]
  closeExplore: (reason: string) => void
  decide?: DecideFn
}): Promise<void> {
  const {
    page,
    session,
    exploreIndex,
    options,
    ai,
    tools,
    toolControl,
    abort,
    callDeadline,
    allowedOrigins,
    closeExplore,
  } = input
  const ask = input.decide ?? ((questions, state, signal) => decide(ai, questions, state, signal))

  let steps = 0
  while (
    !toolControl.done &&
    !abort.signal.aborted &&
    Date.now() + MIN_TURN_MS < callDeadline
  ) {
    if (steps >= MAX_STEPS) {
      closeExplore('Stopped at max steps.')
      break
    }
    steps += 1
    toolControl.mutatedThisStep = false

    try {
      assertAllowedOrigin(page.url(), allowedOrigins)
      const snapshot = await captureSnapshot(page)
      toolControl.turnSnapshot = snapshot
      if (abort.signal.aborted || Date.now() >= callDeadline) {
        closeExplore('Timebox reached.')
        break
      }

      const toolChoices = jevToolChoices(snapshot, options.persona, options.mission)
      const filed = session.issues
        .filter((issue) => issue.exploreIndex === exploreIndex)
        .map((issue) => `${issue.id}: ${issue.title}`)
      const state = {
        persona: {
          id: options.persona.id,
          title: options.persona.title,
          profile: options.persona.profile,
        },
        mission: options.mission,
        timeLeftSeconds: Math.round((callDeadline - Date.now()) / 1000),
        alreadyFiled: filed,
        recentActions: reproSteps(session, exploreIndex),
        page: snapshot,
      }

      const answers = await ask(
        {
          is_defect: {
            type: 'noul',
            instructions:
              'Does THIS snapshot show a product defect that should be filed now? Completing the mission is not a defect. Do not file something already listed.',
            criteria: {
              true: 'The snapshot shows broken behavior, a console/page error, a failed network call, or an accessibility violation that is not already filed.',
              false: 'The view is usable, the mission is progressing, or there is not enough evidence on this snapshot.',
            },
          },
          next_tool: {
            type: 'choice',
            instructions:
              'Pick the next exploratory tool for this persona and mission. Prefer a new control over repeating the last step. Pick done if finished or stuck.',
            criteria: toolChoices,
          },
          issue_kind: {
            type: 'choice',
            instructions: 'If this snapshot is a defect, what kind is it?',
            criteria: {
              console: 'Console or pageerror lines show a failure.',
              network: 'Network or Fetch lines show a failed request.',
              accessibility: 'A11y scan lines show a WCAG failure.',
              functional: 'A control, filter, or item does not match the last action or the mission.',
              ux: 'The UI gave no feedback after an action.',
              content: 'A label or copy is wrong or empty.',
            },
          },
          issue_severity: {
            type: 'score',
            instructions: 'If this snapshot is a defect, how severe is it?',
            criteria: [
              'Low: cosmetic or easy to work around',
              'Medium: confusing or a secondary path is wrong',
              'High: a main path is broken',
              'Critical: data loss or the user cannot continue',
            ],
          },
        },
        state,
        abort.signal,
      )

      const defect = noul(answers, 'is_defect')
      const toolName = choice(answers, 'next_tool') as keyof BoundTools | undefined
      journal(
        session,
        exploreIndex,
        'thought',
        `Jev defect ${defect.toFixed(2)}; tool ${toolName ?? 'none'}`,
      )

      if (defect >= DEFECT_THRESHOLD) {
        const kind = choice(answers, 'issue_kind') ?? 'functional'
        const evidence = issueEvidence(kind, snapshot)
        if (evidence) {
          const result = await invoke(
            tools,
            'logIssue',
            {
              title: kindTitle(kind, snapshotTitle(snapshot)),
              severity: severityFromScore(score(answers, 'issue_severity')),
              category: KIND_CATEGORY[kind] ?? 'functional',
              description: `Jev flagged this snapshot (${kind}, p=${defect.toFixed(2)}).`,
              expected: `The view should support the mission: ${options.mission}`,
              actual: evidence,
              evidence,
              reproSteps: reproSteps(session, exploreIndex),
              interactive: reproSteps(session, exploreIndex).length > 1,
            },
            abort.signal,
            steps,
          )
          if (result && typeof result === 'object' && 'ok' in result && result.ok) {
            continue
          }
        }
      }

      if (!toolName || !toolChoices[toolName]) {
        closeExplore('Jev did not pick a next tool.')
        break
      }

      const candidates = buildJevCandidates(
        snapshot,
        options.persona,
        options.mission,
        toolName,
      )
      let picked = candidates[0]
      if (candidates.length > 1) {
        const argAnswers = await ask(
          {
            arg: {
              type: 'choice',
              instructions: `Pick the arguments for ${toolName} on this snapshot.`,
              criteria: Object.fromEntries(
                candidates.map((candidate) => [candidate.id, candidate.label]),
              ),
            },
          },
          state,
          abort.signal,
        )
        picked =
          candidates.find((candidate) => candidate.id === choice(argAnswers, 'arg')) ?? picked
      }
      if (!picked) {
        closeExplore('Jev did not pick tool arguments.')
        break
      }

      await invoke(tools, picked.tool, picked.args, abort.signal, steps)
      if (picked.submit && picked.tool === 'fill' && !toolControl.done) {
        await invoke(
          tools,
          'press',
          { role: picked.args.role, name: picked.args.name, key: 'Enter' },
          abort.signal,
          steps,
        )
      }
      if (toolControl.done) break
    } catch (error) {
      if (isOriginRefusedError(error)) throw error
      if (toolControl.done) break
      if (isTimeboxStop(error)) {
        closeExplore('Timebox reached.')
        break
      }
      throw error
    }
  }
}
