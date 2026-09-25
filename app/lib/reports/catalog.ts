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
    description: 'Adoption, people coverage, jurisdiction activity, and attention signals.',
    status: 'live',
    schemaVersion: 1,
    defaultSections: ['people_coverage', 'engagement', 'jurisdictions_trades', 'attention'],
    sections: [
      {
        key: 'people_coverage',
        label: 'People & coverage',
        description: 'Active users, technician roster, manager assignments, and account coverage.',
      },
      {
        key: 'engagement',
        label: 'Engagement',
        description: 'Conversation activity, active technicians, adoption rate, and most recent activity.',
      },
      {
        key: 'jurisdictions_trades',
        label: 'Jurisdictions & trades',
        description: 'Configured trades and jurisdictions compared with actual technician conversation usage.',
      },
      {
        key: 'attention',
        label: 'Attention signals',
        description: 'No activity, disabled companies, unassigned technicians, and low technician adoption.',
      },
    ],
    filters: [
      {
        key: 'companyStatus',
        label: 'Company status',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All company statuses' },
          { value: 'active', label: 'Active' },
          { value: 'disabled', label: 'Disabled' },
        ],
      },
      {
        key: 'attentionOnly',
        label: 'Companies needing attention only',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  {
    type: 'ai_usage_cost',
    label: 'AI Usage & Cost',
    description: 'Company-attributed AI calls, tokens, models, features, searches, and cost-readiness signals.',
    status: 'live',
    schemaVersion: 1,
    defaultSections: ['token_usage', 'features_models', 'search_usage'],
    sections: [
      {
        key: 'token_usage',
        label: 'Token usage',
        description: 'Calls plus input, cached input, output, and total token consumption by company.',
      },
      {
        key: 'features_models',
        label: 'Features & models',
        description: 'Which CraftCompass AI features and models are driving usage.',
      },
      {
        key: 'search_usage',
        label: 'Search usage',
        description: 'Web-search and file-search tool calls attributed to each company.',
      },
    ],
    filters: [
      {
        key: 'usageStatus',
        label: 'Usage status',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All companies' },
          { value: 'with_usage', label: 'Companies with AI usage' },
          { value: 'no_usage', label: 'Companies with no AI usage' },
        ],
      },
    ],
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
