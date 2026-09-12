import { join } from 'node:path'

export const VEGAPUNK_REPORT_DIR = 'vegapunk-report'

export function vegapunkReportDir(playwrightOutputDir: string): string {
  return join(playwrightOutputDir, VEGAPUNK_REPORT_DIR)
}
