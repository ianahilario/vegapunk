import type { SessionReport } from './types.js'

export function renderMarkdown(report: SessionReport): string {
  const bySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const issue of report.issues) {
    bySeverity[issue.severity] += 1
  }

  const lines: string[] = [
    `# ${report.title}`,
    '',
    `- Date: ${report.startedAt}`,
    `- Project: ${report.project}`,
    `- Charter: ${report.titlePath.join(' › ')}`,
    `- Repeat: ${report.repeatEachIndex}`,
    `- Explore timeboxes: ${report.explores.map((explore) => `${Math.round(explore.timeboxMs / 1000)}s`).join(', ') || 'n/a'}`,
    report.url ? `- URL: ${report.url}` : '',
    '',
    '## Summary',
    '',
    `| critical | high | medium | low |`,
    `| --- | --- | --- | --- |`,
    `| ${bySeverity.critical} | ${bySeverity.high} | ${bySeverity.medium} | ${bySeverity.low} |`,
    '',
  ]

  for (const explore of report.explores) {
    lines.push(
      `## Explore ${explore.index + 1}: ${explore.mission}`,
      '',
      `- Persona: ${explore.persona.title} (\`${explore.persona.id}\`)`,
      `- Timebox: ${Math.round(explore.timeboxMs / 1000)}s`,
      `- Profile: ${explore.persona.profile}`,
      '',
    )
  }

  lines.push('## What it did', '')
  for (const entry of report.journal) {
    lines.push(`- [${entry.kind}] ${entry.message}`)
  }

  if (report.checks.length) {
    lines.push('', '## Checks with no issues', '')
    for (const check of report.checks) {
      lines.push(`- ${check.title} (${check.url})`)
    }
  }

  lines.push('', '## Issues', '')
  if (!report.issues.length) {
    lines.push('_None._', '')
  }
  for (const issue of report.issues) {
    lines.push(
      `### ${issue.id} — ${issue.title}`,
      '',
      `- Severity: ${issue.severity}`,
      `- Category: ${issue.category}`,
      `- URL: ${issue.url}`,
      `- Explore: ${issue.exploreIndex + 1} (${issue.persona.title})`,
      `- Mission: ${issue.mission}`,
      '',
      issue.description,
      '',
      `**Expected:** ${issue.expected}`,
      '',
      `**Actual:** ${issue.actual}`,
      '',
      '**Repro steps**',
      '',
    )
    for (const [index, step] of issue.reproSteps.entries()) {
      lines.push(`${index + 1}. ${step.action}`)
      if (step.screenshot) lines.push(`   - Screenshot: ${step.screenshot}`)
    }
    lines.push('', `Repro video: ${issue.video ?? 'see artifacts'}`, '')
    if (issue.snapshot) {
      lines.push('<details><summary>Page snapshot</summary>', '', '```', issue.snapshot, '```', '', '</details>', '')
    }
  }

  return lines.filter((line) => line !== undefined).join('\n')
}
