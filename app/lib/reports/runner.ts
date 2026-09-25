import { getReportCatalogItem, validateReportDefinition } from './catalog'
import { runBillingUsageReport } from './billing-usage'
import { runCompanyPerformanceReport } from './company-performance'
import { runAIUsageCostReport } from './ai-usage-cost'
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
  if (input.reportType === 'company_performance') {
    return runCompanyPerformanceReport(input)
  }
  if (input.reportType === 'ai_usage_cost') {
    return runAIUsageCostReport(input)
  }

  throw new Error('That report family is not available yet.')
}
