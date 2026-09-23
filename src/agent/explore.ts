import { generateText, InvalidToolArgumentsError, type CoreMessage } from 'ai'
import type { Page } from '@playwright/test'
import { parseDuration } from '../duration.js'
import type { ExploreOptions } from '../types.js'
import { loadConfig } from '../config/load.js'
import { parseAllowedOrigins, assertAllowedOrigin, isOriginRefusedError } from './allowed-origin.js'
import { isJevModel, runJevExplore } from './jev.js'
import { createModel } from './model.js'
import { journal } from './journal.js'
import { TAXONOMY, systemPrompt } from './prompt.js'
import {
  attachConsole,
  attachNetwork,
  captureSnapshot,
  captureViewport,
  looksBlocked,
} from './snapshot.js'
import type { SessionState } from './session.js'
import { createTools } from './tools.js'

const MAX_STEPS = 80
const MIN_TURN_MS = 2_000

function isTimeboxStop(error: unknown): boolean {
  if (error == null) return false
  const name = error instanceof Error ? error.name : ''
  if (name === 'AbortError' || name === 'TimeoutError') return true
  const message = error instanceof Error ? error.message : String(error)
  return /TIMEBOX|aborted|AbortError/i.test(message)
}

function invalidToolArgumentsError(error: unknown): InvalidToolArgumentsError | undefined {
  if (InvalidToolArgumentsError.isInstance(error)) return error
  if (error instanceof Error && InvalidToolArgumentsError.isInstance(error.cause)) {
    return error.cause
  }
  return undefined
}

function isInvalidToolArguments(error: unknown): boolean {
  if (invalidToolArgumentsError(error)) return true
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Invalid arguments for tool')
}

function toolFailureHint(error: unknown, message: string): string {
  if (isInvalidToolArguments(error)) {
    const toolName = invalidToolArgumentsError(error)?.toolName ?? 'tool'
    return (
      `The ${toolName} call was rejected (invalid arguments): ${message.split('\n')[0]}. ` +
      'Retry that tool with every required field. Do not omit title or other required strings.'
    )
  }
  return (
    `A tool failed: ${message.split('\n')[0]}. Continue from the next snapshot. ` +
    'Use the accessible name from the snapshot, not the visible label beside it.'
  )
}

export async function runExplore(
  page: Page,
  session: SessionState,
  options: ExploreOptions,
): Promise<void> {
  if (!options.mission?.trim()) {
    throw new Error('explore() requires mission.')
  }
  if (!options.persona?.id || !options.persona.profile) {
    throw new Error('explore() requires a Persona object from createPersona().')
  }

  const loaded = await loadConfig(process.cwd())
  const allowedOrigins = parseAllowedOrigins(loaded.config.allowedOrigins)
  const playwrightBaseURL = session.testInfo.project.use.baseURL
  if (playwrightBaseURL) {
    assertAllowedOrigin(playwrightBaseURL, allowedOrigins)
  }
  assertAllowedOrigin(page.url(), allowedOrigins)

  const timebox = options.timebox ?? loaded.config.timebox
  const callBudget = parseDuration(timebox)
  const callDeadline = Date.now() + callBudget
  session.callDeadline = callDeadline

  if (session.testInfo.timeout && session.testInfo.timeout < callBudget) {
    throw new Error(
      `Playwright timeout (${session.testInfo.timeout}ms) is lower than this explore() timebox (${callBudget}ms). Raise test timeout (config timeout or test.setTimeout).`,
    )
  }

  const exploreIndex = session.explores.length
  session.explores.push({
    index: exploreIndex,
    mission: options.mission,
    persona: options.persona,
    startedAt: new Date().toISOString(),
    timeboxMs: callBudget,
  })

  attachConsole(page)
  attachNetwork(page)
  const visual = Boolean(options.visual)
  journal(
    session,
    exploreIndex,
    'orient',
    `Explore #${exploreIndex + 1}: ${options.mission} as ${options.persona.title}${visual ? ' (visual)' : ''}`,
  )

  const ai = { ...loaded.config.ai, ...options.ai }
  const temperature = ai.temperature ?? 0.6

  let snapshot = await captureSnapshot(page)
  if (await looksBlocked(page, snapshot)) {
    const headed = session.testInfo.project.use.headless === false
    if (headed) {
      journal(session, exploreIndex, 'thought', 'Possible auth/MFA blocker — pausing for a human.')
      await page.pause()
      assertAllowedOrigin(page.url(), allowedOrigins)
      snapshot = await captureSnapshot(page)
    } else {
      throw new Error(
        'Agent blocked (possible auth/MFA). Handle auth before explore(), or re-run headed.',
      )
    }
  }

  if (visual && isJevModel(ai.model)) {
    throw new Error(
      `explore({ visual: true }) needs a vision-capable chat model. ${ai.model} is a decisions model and cannot read screenshots.`,
    )
  }

  const abort = new AbortController()
  const abortTimer = setTimeout(
    () => abort.abort(),
    Math.max(0, callDeadline - Date.now()),
  )
  const toolControl = {
    done: false,
    lastActions: [] as number[],
    mutatedThisStep: false,
    issuesOnUnchangedView: 0,
    turnSnapshot: snapshot,
    stop: () => {
      clearTimeout(abortTimer)
      abort.abort()
    },
  }
  const { tools: boundTools, dispose: disposeTools } = createTools(
    page,
    session,
    exploreIndex,
    toolControl,
    { visual, allowedOrigins },
  )

  const closeExplore = (reason: string) => {
    if (!toolControl.done) {
      journal(session, exploreIndex, 'wrap', reason)
      toolControl.done = true
    }
    const section = session.explores[exploreIndex]
    if (section) section.endedAt = new Date().toISOString()
  }

  const messages: CoreMessage[] = [
    {
      role: 'user',
      content: `${TAXONOMY}\n\nCurrent page:\n${snapshot}`,
    },
  ]

  try {
    if (isJevModel(ai.model)) {
      await runJevExplore({
        page,
        session,
        exploreIndex,
        options,
        ai,
        tools: boundTools,
        toolControl,
        abort,
        callDeadline,
        allowedOrigins,
        closeExplore,
      })
    } else {
      const model = createModel(ai)
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

      assertAllowedOrigin(page.url(), allowedOrigins)
      snapshot = await captureSnapshot(page)
      if (abort.signal.aborted || Date.now() >= callDeadline) {
        closeExplore('Timebox reached.')
        break
      }

      toolControl.mutatedThisStep = false
      toolControl.turnSnapshot = snapshot
      stripPriorImages(messages)
      const filed = session.issues
        .filter((issue) => issue.exploreIndex === exploreIndex)
        .map((issue) => `- ${issue.id}: ${issue.title}`)
        .join('\n')
      const text = [
        `Time left: ${Math.round((callDeadline - Date.now()) / 1000)}s`,
        `Only logIssue if THIS snapshot${visual ? ' or screenshot' : ''} shows a failure you have not already filed.`,
        visual
          ? 'A new screenshot of the same page is not a new bug. After you log one defect, add items, use filters, or call done. The screenshot is for overlap, clip, overflow, and alignment. A named item is on screen only if this snapshot contains its name. A counter such as "1 item left" is not that row.'
          : 'Do not report a remembered bug from an earlier screen. A named item is on screen only if this snapshot contains its name.',
        filed ? `Already filed this explore:\n${filed}\nDo not log these again.` : '',
        `Current page:\n${snapshot}`,
      ]
        .filter(Boolean)
        .join('\n\n')
      if (visual) {
        const image = await captureViewport(page)
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image', image, mimeType: 'image/jpeg' },
          ],
        })
      } else {
        messages.push({ role: 'user', content: text })
      }

      try {
        const result = await generateText({
          model,
          system: systemPrompt(options.persona, options.mission, { visual }),
          messages,
          tools: boundTools,
          maxSteps: 1,
          maxRetries: 1,
          temperature,
          abortSignal: abort.signal,
        })
        assertAllowedOrigin(page.url(), allowedOrigins)
        if (result.text) {
          journal(session, exploreIndex, 'thought', result.text.slice(0, 400))
        }
        if (result.response.messages.length) {
          messages.push(...result.response.messages)
        } else if (result.text) {
          messages.push({ role: 'assistant', content: result.text })
        }
        if (toolControl.done) break
      } catch (error) {
        if (isOriginRefusedError(error)) throw error
        if (toolControl.done) break
        if (isTimeboxStop(error)) {
          closeExplore('Timebox reached.')
          break
        }
        if (isOriginRefusedError(error)) throw error
        const message = error instanceof Error ? error.message : String(error)
        if (visual && isVisionRejected(message)) {
          throw new Error(
            `explore({ visual: true }) needs a vision-capable model. ${ai.model} rejected the screenshot. ${message.split('\n')[0]}`,
          )
        }
        if (
          isInvalidToolArguments(error) ||
          message.includes('Error executing tool') ||
          message.includes('ToolExecution')
        ) {
          journal(session, exploreIndex, 'thought', `Tool failed: ${message.slice(0, 240)}`)
          messages.push({
            role: 'user',
            content: toolFailureHint(error, message),
          })
          continue
        }
        throw error
      }
      }
    }

    if (!toolControl.done) {
      closeExplore('Timebox reached.')
    }
  } finally {
    clearTimeout(abortTimer)
    await disposeTools()
    const section = session.explores[exploreIndex]
    if (section) section.endedAt = new Date().toISOString()
  }
}

function isVisionRejected(message: string): boolean {
  return /image|vision|multimodal|media type|content part|unsupported.*input/i.test(message)
}

function stripPriorImages(messages: CoreMessage[]): void {
  for (const message of messages) {
    if (message.role !== 'user' || typeof message.content === 'string') continue
    const text = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    message.content = text || '[prior screenshot omitted]'
  }
}
