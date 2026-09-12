import { test } from '@playwright/test'
import { vegapunk } from 'vegapunk'
import { Persona } from '../personas'

test('a user can add, complete, and filter their items', {
  tag: ['@todos', '@filters'],
}, async ({ page }) => {
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: 'Explore adding, completing, and filtering todos.',
    persona: Persona.DEFAULT,
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
    visual: true,
    ai: { model: 'qwen/qwen3.5-27b' },
    timebox: 60_000,
  })
})
