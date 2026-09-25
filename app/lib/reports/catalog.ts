import type { ReportCatalogItem, ReportType } from './types'

export const REPORT_CATALOG: ReportCatalogItem[] = [
  {
    type: 'billing_usage',
    label: 'Billing & Usage',
    description: 'Plans, allowances, overages, activity, and company-attributed AI usage.',
    status: 'live',
    schemaVersion: 1,
    defaultSections: ['plan_seats', 'activity', 'ai_usage'],
    sections: [
      {
        key: 'plan_seats',
        label: 'Plan & seats',
        description: 'Plan, subscription status, included users, active users, and overages.',
      },
      {
        key: 'activity',
        label: 'Activity',
        description: 'Technician, manager, and owner conversation activity for the reporting period.',
      },
      {
        key: 'ai_usage',
        label: 'AI usage',
        description: 'AI calls, tokens, web searches, and file searches attributed to each company.',
      },
    ],
    filters: [
      {
        key: 'subscriptionStatus',
        label: 'Subscription status',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All subscription statuses' },
          { value: 'manual', label: 'Manual' },
          { value: 'trialing', label: 'Trialing' },
          { value: 'active', label: 'Active' },
          { value: 'past_due', label: 'Past due' },
          { value: 'paused', label: 'Paused' },
          { value: 'canceled', label: 'Canceled' },
        ],
      },
      {
        key: 'overPlanOnly',
        label: 'Over-plan companies only',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  {
    type: 'company_performance',
    label: 'Company Performance',
    description: 'Adoption, company health, jurisdiction activity, and trends.',
    status: 'planned',
    schemaVersion: 1,
    defaultSections: [],
    sections: [],
    filters: [],
  },
  {
    type: 'ai_usage_cost',
    label: 'AI Usage & Cost',
    description: 'Feature-level AI consumption, models, searches, and cost analysis.',
    status: 'planned',
    schemaVersion: 1,
    defaultSections: [],
    sections: [],
    filters: [],
  },
  {
    type: 'learning_quality',
    label: 'Learning & Quality',
    description: 'Helpful feedback, reviews, guidance, and verified-source health.',
    status: 'planned',
    schemaVersion: 1,
    defaultSections: [],
    sections: [],
    filters: [],
  },
  {
    type: 'user_activity',
    label: 'User Activity',
    description: 'Owner, manager, and technician usage across the platform.',
    status: 'planned',
    schemaVersion: 1,
    defaultSections: [],
    sections: [],
    filters: [],
  },
]

export const getReportCatalogItem = (reportType: string) =>
  REPORT_CATALOG.find((item) => item.type === reportType) || null

export const validateReportDefinition = ({
  reportType,
  sections,
}: {
  reportType: string
  sections: string[]
}) => {
  const report = getReportCatalogItem(reportType)
  if (!report) return { ok: false as const, error: 'Unknown report type.' }
  if (report.status !== 'live') return { ok: false as const, error: 'That report family is not available yet.' }

  const supportedSections = new Set(report.sections.map((section) => section.key))
  if (!sections.length || sections.some((section) => !supportedSections.has(section))) {
    return { ok: false as const, error: 'Choose at least one supported report section.' }
  }

  return { ok: true as const, report }
}

export const isReportType = (value: string): value is ReportType =>
  REPORT_CATALOG.some((item) => item.type === value)
