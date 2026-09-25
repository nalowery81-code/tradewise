export type ReportType =
  | 'billing_usage'
  | 'company_performance'
  | 'ai_usage_cost'
  | 'learning_quality'
  | 'user_activity'

export type ReportSection = {
  key: string
  label: string
  description: string
}

export type ReportFilterDefinition = {
  key: string
  label: string
  type: 'select' | 'boolean'
  options?: { value: string; label: string }[]
  defaultValue?: string | boolean
}

export type ReportCatalogItem = {
  type: ReportType
  label: string
  description: string
  status: 'live' | 'planned'
  schemaVersion: number
  defaultSections: string[]
  sections: ReportSection[]
  filters: ReportFilterDefinition[]
}

export type ReportRange = {
  preset: string
  start: Date
  end: Date
}

export type ReportRunInput = {
  reportType: ReportType
  companyId: string | null
  filters: Record<string, unknown>
  sections: string[]
}

export type ReportRunResult = {
  reportType: ReportType
  schemaVersion: number
  generatedAt: string
  period: { preset: string; start: string; end: string }
  sections: string[]
  scopeCompanyId: string | null
  rows: unknown[]
  summary: Record<string, number>
  billingNote?: string
  aiCostNote?: string
}
