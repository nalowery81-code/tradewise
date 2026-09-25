import { getReportCatalogItem, validateReportDefinition } from './catalog'
import { runBillingUsageReport } from './billing-usage'
import type { ReportRunInput, ReportRunResult } from './types'

export async function runReport(input: ReportRunInput): Promise<ReportRunResult> {
  const validation = validateReportDefinition({
    reportType: input.reportType,
    sections: input.sections,
  })
  if (!validation.ok) throw new Error(validation.error)

  const catalogItem = getReportCatalogItem(input.reportType)
  if (!catalogItem) throw new Error('Unknown report type.')

  if (input.reportType === 'billing_usage') {
    return runBillingUsageReport(input)
  }

  throw new Error('That report family is not available yet.')
}
