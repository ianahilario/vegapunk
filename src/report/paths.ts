import { join } from 'node:path'

export const EGGHEAD_REPORT_DIR = 'egghead-report'

export function eggheadReportDir(playwrightOutputDir: string): string {
  return join(playwrightOutputDir, EGGHEAD_REPORT_DIR)
}
