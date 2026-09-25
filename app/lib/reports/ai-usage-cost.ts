import { supabaseServer } from '../supabase-server'
import { resolveReportRange } from './date-range'
import type { ReportRunInput, ReportRunResult } from './types'

type UsageEvent = {
  company_id: string | null
  feature: string | null
  model: string | null
  input_tokens: number | null
  cached_input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  web_search_calls: number | null
  file_search_calls: number | null
  created_at: string
}

type UsageBreakdown = {
  key: string
  calls: number
  totalTokens: number
}

export async function runAIUsageCostReport(input: ReportRunInput): Promise<ReportRunResult> {
  const range = resolveReportRange(input.filters)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  let companyQuery = supabaseServer
    .from('Companies')
    .select('id, name, status, account_type')
    .order('name', { ascending: true })

  if (input.companyId) companyQuery = companyQuery.eq('id', input.companyId)

  const { data: companies, error: companyError } = await companyQuery
  if (companyError) throw new Error('Could not load report companies.')

  const companyRows = companies || []
  const companyIds = companyRows.map((company) => company.id)

  if (!companyIds.length) {
    return {
      reportType: 'ai_usage_cost',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      period: { preset: range.preset, start: startIso, end: endIso },
      sections: input.sections,
      scopeCompanyId: input.companyId,
      rows: [],
      summary: {
        companies: 0,
        companiesWithUsage: 0,
        aiCalls: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        webSearchCalls: 0,
        fileSearchCalls: 0,
        features: 0,
        models: 0,
      },
      aiCostNote: 'CraftCompass records company-attributed AI usage. Organization-wide OpenAI dollar charges may include other apps, so this report does not assign unverified dollar cost to a company.',
    }
  }

  const { data: usageData, error: usageError } = await supabaseServer
    .from('AIUsageEvents')
    .select('company_id, feature, model, input_tokens, cached_input_tokens, output_tokens, total_tokens, web_search_calls, file_search_calls, created_at')
    .in('company_id', companyIds)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (usageError) throw new Error('Could not build AI Usage & Cost report.')

  const usageRows = (usageData || []) as UsageEvent[]
  let rows = companyRows.map((company) => {
    const events = usageRows.filter((event) => event.company_id === company.id)

    const featureMap = new Map<string, UsageBreakdown>()
    const modelMap = new Map<string, UsageBreakdown>()

    for (const event of events) {
      const feature = String(event.feature || 'unknown')
      const model = String(event.model || 'unknown')
      const tokens = Number(event.total_tokens || 0)

      const featureRow = featureMap.get(feature) || { key: feature, calls: 0, totalTokens: 0 }
      featureRow.calls += 1
      featureRow.totalTokens += tokens
      featureMap.set(feature, featureRow)

      const modelRow = modelMap.get(model) || { key: model, calls: 0, totalTokens: 0 }
      modelRow.calls += 1
      modelRow.totalTokens += tokens
      modelMap.set(model, modelRow)
    }

    const lastUsageAt = events.length
      ? events.reduce((latest, event) =>
          new Date(event.created_at).getTime() > new Date(latest).getTime() ? event.created_at : latest,
        events[0].created_at)
      : null

    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      accountType: company.account_type,
      usage: {
        calls: events.length,
        inputTokens: events.reduce((sum, event) => sum + Number(event.input_tokens || 0), 0),
        cachedInputTokens: events.reduce((sum, event) => sum + Number(event.cached_input_tokens || 0), 0),
        outputTokens: events.reduce((sum, event) => sum + Number(event.output_tokens || 0), 0),
        totalTokens: events.reduce((sum, event) => sum + Number(event.total_tokens || 0), 0),
        webSearchCalls: events.reduce((sum, event) => sum + Number(event.web_search_calls || 0), 0),
        fileSearchCalls: events.reduce((sum, event) => sum + Number(event.file_search_calls || 0), 0),
        lastUsageAt,
      },
      features: [...featureMap.values()].sort((a, b) => b.totalTokens - a.totalTokens),
      models: [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    }
  })

  const usageStatus = String(input.filters.usageStatus || 'all')
  if (usageStatus === 'with_usage') rows = rows.filter((row) => row.usage.calls > 0)
  if (usageStatus === 'no_usage') rows = rows.filter((row) => row.usage.calls === 0)

  const distinctFeatures = new Set(
    rows.flatMap((row) => row.features.map((feature) => feature.key))
  )
  const distinctModels = new Set(
    rows.flatMap((row) => row.models.map((model) => model.key))
  )

  const summary = {
    companies: rows.length,
    companiesWithUsage: rows.filter((row) => row.usage.calls > 0).length,
    aiCalls: rows.reduce((sum, row) => sum + row.usage.calls, 0),
    inputTokens: rows.reduce((sum, row) => sum + row.usage.inputTokens, 0),
    cachedInputTokens: rows.reduce((sum, row) => sum + row.usage.cachedInputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.usage.outputTokens, 0),
    totalTokens: rows.reduce((sum, row) => sum + row.usage.totalTokens, 0),
    webSearchCalls: rows.reduce((sum, row) => sum + row.usage.webSearchCalls, 0),
    fileSearchCalls: rows.reduce((sum, row) => sum + row.usage.fileSearchCalls, 0),
    features: distinctFeatures.size,
    models: distinctModels.size,
  }

  return {
    reportType: 'ai_usage_cost',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections: input.sections,
    scopeCompanyId: input.companyId,
    rows,
    summary,
    aiCostNote: 'CraftCompass records company-attributed AI usage. Organization-wide OpenAI dollar charges may include other apps, so this report does not assign unverified dollar cost to a company.',
  }
}
