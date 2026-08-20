/**
 * lib/api/mock/moderation.ts
 *
 * Moderation domain of the mock API: the report queue and report-state
 * transitions. Extracted from lib/api/mock.ts.
 */
import { mockReports } from './fixtures'
import { initPromise } from './state'
import type { ModerationReport, ModerationState } from '../types'

export async function mockListReports(_signal?: AbortSignal): Promise<ModerationReport[]> {
  await initPromise
  return mockReports
}

export async function mockGetReport(id: string, _signal?: AbortSignal): Promise<ModerationReport | null> {
  await initPromise
  return mockReports.find(r => r.id === id) || null
}

export async function mockUpdateReportState(
  id: string,
  state: ModerationState,
  updates?: Partial<ModerationReport>,
): Promise<void> {
  await initPromise
  const report = mockReports.find(r => r.id === id)
  if (report) {
    report.state = state
    if (updates) {
      Object.assign(report, updates)
    }
    report.updatedAt = new Date().toISOString()
  }
}