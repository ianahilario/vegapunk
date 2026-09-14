import { test } from '@playwright/test'
import { vegapunk } from 'vegapunk'
import { Persona } from '../personas'

test('a user can add a todo item', {
  tag: ['@todos', '@filters'],
}, async ({ page }) => {
  test.setTimeout(60_000 * 6)
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: `Don't do anything else other than adding 1 todo item.`,
    persona: Persona.DEFAULT,
    timebox: 60_000 * 5,
  })
})

test('a user can add, complete, and filter their items', {
  tag: ['@todos', '@filters'],
}, async ({ page }) => {
  test.setTimeout(60_000 * 6)
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: 'Explore adding, completing, and filtering todos.',
    persona: Persona.DEFAULT,
    timebox: 60_000 * 5,
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

test('the todo list keeps names, contrast, and keyboard access', {
  tag: ['@todos', '@a11y'],
}, async ({ page }) => {
  test.setTimeout(60_000 * 3)
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: 'Audit names, contrast, and keyboard access on the todo list and filters.',
    persona: Persona.A11YAUDITOR,
    timebox: 60_000 * 2,
  })
})
