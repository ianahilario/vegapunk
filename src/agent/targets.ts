export type SnapshotControl = {
  role: string
  name: string
  checked?: boolean
  disabled?: boolean
}

const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'switch',
  'slider',
  'spinbutton',
  'option',
  'treeitem',
])

const QUOTED = /^\s*-\s+([a-z][a-z0-9]+)(?:\s+"([^"]*)")?(?:\s+\[([^\]]*)\])?\s*$/i
const YAML = /^\s*-\s+([a-z][a-z0-9]+)(?:\s+\[([^\]]*)\])?\s*:\s*(?:"([^"]*)"|(.*?))\s*$/i

function attrs(raw: string | undefined): { checked?: boolean; disabled?: boolean } {
  const flags = (raw ?? '').toLowerCase()
  return {
    checked: /\bchecked\b/.test(flags) || undefined,
    disabled: /\bdisabled\b/.test(flags) || undefined,
  }
}

function parseAriaLine(line: string): SnapshotControl | undefined {
  let match = line.match(QUOTED)
  if (match) {
    const name = match[2]?.trim()
    if (!name) return undefined
    return { role: match[1]!.toLowerCase(), name, ...attrs(match[3]) }
  }
  match = line.match(YAML)
  if (match) {
    const name = (match[3] ?? match[4] ?? '').trim()
    if (!name) return undefined
    return { role: match[1]!.toLowerCase(), name, ...attrs(match[2]) }
  }
  return undefined
}

/** Named interactive controls from a Playwright `ariaSnapshot()` tree. */
export function parseSnapshotControls(snapshot: string): SnapshotControl[] {
  const controls: SnapshotControl[] = []
  const seen = new Set<string>()
  for (const line of snapshot.split('\n')) {
    const parsed = parseAriaLine(line)
    if (!parsed || parsed.disabled) continue
    if (!INTERACTIVE.has(parsed.role)) continue
    const key = `${parsed.role}\0${parsed.name}\0${parsed.checked ? '1' : '0'}`
    if (seen.has(key)) continue
    seen.add(key)
    controls.push(parsed)
  }
  return controls
}

export function snapshotBlock(snapshot: string, heading: string): string[] {
  const index = snapshot.indexOf(heading)
  if (index < 0) return []
  const rest = snapshot.slice(index + heading.length)
  const next = rest.search(
    /\n(?:Console since last snapshot:|Network since last snapshot:|A11y scan:|Keyboard:|Fetch:|Storage:|Conditions:)/,
  )
  const block = (next < 0 ? rest : rest.slice(0, next)).trim()
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function snapshotUrl(snapshot: string): string | undefined {
  return snapshot.match(/^URL:\s*(.+)$/m)?.[1]?.trim()
}

export function parseNetworkPaths(snapshot: string): { method: string; path: string }[] {
  const lines = [
    ...snapshotBlock(snapshot, 'Network since last snapshot:'),
    ...snapshotBlock(snapshot, 'Fetch:'),
  ]
  const seen = new Set<string>()
  const paths: { method: string; path: string }[] = []
  for (const line of lines) {
    const match = line.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i)
    if (!match) continue
    const method = match[1]!.toUpperCase()
    const path = match[2]!
    const key = `${method} ${path}`
    if (seen.has(key)) continue
    seen.add(key)
    paths.push({ method, path })
  }
  return paths
}

export function parseStorageKeys(snapshot: string): { kind: string; key: string }[] {
  const keys: { kind: string; key: string }[] = []
  const seen = new Set<string>()
  for (const line of snapshotBlock(snapshot, 'Storage:')) {
    const match = line.match(/^(local|session|cookie)\s+([^=\s]+)=/)
    if (!match) continue
    const key = `${match[1]}\0${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    keys.push({ kind: match[1]!, key: match[2]! })
  }
  return keys
}
