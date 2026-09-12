import { test } from '@playwright/test'
import { vegapunk } from 'vegapunk'
import { Persona } from '../personas'

const TIMEBOX = 120_000

test('a user can add, complete, and filter their items', {
  tag: ['@todos', '@filters'],
}, async ({ page }) => {
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: 'Explore adding, completing, and filtering todos.',
    persona: Persona.DEFAULT,
    timebox: TIMEBOX,
  })
})

test('hostile inputs and filter sequences do not leave the list unusable', {
  tag: '@todos',
}, async ({ page }) => {
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission:
      'Try empty submits, script in todo text, duplicate todos, completing then clearing, and unusual filter sequences.',
    persona: Persona.MALICIOUS,
    timebox: TIMEBOX,
  })
})

test('the list and filters stay readable without overlap, clip, or overflow', {
  tag: ['@todos', '@visual'],
}, async ({ page }) => {
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission:
      'Look for overlap, clip, contrast, and overflow on the todo list and filters.',
    persona: Persona.DEFAULT,
    timebox: TIMEBOX,
    visual: true,
    ai: { model: 'qwen/qwen3.5-27b' },
  })
})
