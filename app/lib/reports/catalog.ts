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
    description: 'Conversation feedback, audit corrections, guidance, learning runs, and verified-source health.',
    status: 'live',
    schemaVersion: 1,
    defaultSections: ['conversation_quality', 'corrections_guidance', 'source_health', 'learning_runs'],
    sections: [
      {
        key: 'conversation_quality',
        label: 'Conversation quality',
        description: 'Helpful feedback, requested feedback, flags, and audit outcomes linked to company conversations.',
      },
      {
        key: 'corrections_guidance',
        label: 'Corrections & guidance',
        description: 'Audit corrections by company plus platform-wide active guidance created from learning and review workflows.',
      },
      {
        key: 'source_health',
        label: 'Verified-source health',
        description: 'Platform-wide verified source document status and weekly source-check results.',
      },
      {
        key: 'learning_runs',
        label: 'Learning runs',
        description: 'Platform-wide weekly learning runs, reviewed items, helpful signals, and guidance generated.',
      },
    ],
    filters: [
      {
        key: 'attentionOnly',
        label: 'Companies with quality attention signals only',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  {
    type: 'user_activity',
    label: 'User Activity',
    description: 'User-level account status, sign-ins, conversation activity, and adoption signals.',
    status: 'live',
    schemaVersion: 1,
    defaultSections: ['account_profile', 'engagement', 'sign_in', 'attention'],
    sections: [
      {
        key: 'account_profile',
        label: 'Account profile',
        description: 'User identity, company, role, account state, and account age.',
      },
      {
        key: 'engagement',
        label: 'Conversation engagement',
        description: 'Conversation volume and most recent conversation activity during the selected period.',
      },
      {
        key: 'sign_in',
        label: 'Sign-in activity',
        description: 'Most recent authentication sign-in so inactive or never-used accounts are easy to spot.',
      },
      {
        key: 'attention',
        label: 'Attention signals',
        description: 'Inactive accounts, never-signed-in users, unlinked technician accounts, and no activity in the selected period.',
      },
    ],
    filters: [
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All roles' },
          { value: 'owner', label: 'Owners' },
          { value: 'manager', label: 'Managers' },
          { value: 'technician', label: 'Technicians' },
        ],
      },
      {
        key: 'accountStatus',
        label: 'Account status',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All account statuses' },
          { value: 'active', label: 'Active accounts' },
          { value: 'inactive', label: 'Inactive accounts' },
        ],
      },
      {
        key: 'activityStatus',
        label: 'Activity',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All activity levels' },
          { value: 'with_activity', label: 'Users with conversation activity' },
          { value: 'no_activity', label: 'Users with no conversation activity' },
          { value: 'never_signed_in', label: 'Users who never signed in' },
        ],
      },
    ],
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
