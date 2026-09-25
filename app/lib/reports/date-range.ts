import type { ReportRange } from './types'

export const resolveReportRange = (filters: Record<string, unknown>): ReportRange => {
  const now = new Date()
  const preset = String(filters.datePreset || '30d')
  let start: Date
  let end = now

  if (preset === '7d') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (preset === 'month') {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  } else if (preset === 'custom') {
    const startValue = String(filters.startDate || '')
    const endValue = String(filters.endDate || '')
    start = new Date(`${startValue}T00:00:00.000Z`)
    end = new Date(`${endValue}T23:59:59.999Z`)
    if (!startValue || !endValue || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Choose a valid custom date range.')
    }
  } else {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  if (end.getTime() < start.getTime()) throw new Error('End date must be after start date.')
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new Error('Report ranges are limited to 366 days.')
  }

  return { preset, start, end }
}
