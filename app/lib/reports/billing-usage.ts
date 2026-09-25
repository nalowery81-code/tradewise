import { supabaseServer } from '../supabase-server'
import { resolveReportRange } from './date-range'
import type { ReportRunInput, ReportRunResult } from './types'

export async function runBillingUsageReport(input: ReportRunInput): Promise<ReportRunResult> {
  const range = resolveReportRange(input.filters)

  let companyQuery = supabaseServer
    .from('Companies')
    .select('id, name, status, account_type, plan_code, subscription_status, seat_limits')
    .order('name', { ascending: true })

  if (input.companyId) companyQuery = companyQuery.eq('id', input.companyId)

  const { data: companies, error: companyError } = await companyQuery
  if (companyError) throw new Error('Could not load report companies.')

  const companyRows = companies || []
  const companyIds = companyRows.map((company) => company.id)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  if (!companyIds.length) {
    return {
      reportType: 'billing_usage',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      period: { preset: range.preset, start: startIso, end: endIso },
      sections: input.sections,
      scopeCompanyId: input.companyId,
      rows: [],
      summary: {
        companies: 0,
        overPlanCompanies: 0,
        activeSeats: 0,
        conversations: 0,
        aiCalls: 0,
        totalTokens: 0,
      },
    }
  }

  const [profilesResult, techConversationResult, managementConversationResult, aiUsageResult] = await Promise.all([
    supabaseServer
      .from('UserProfiles')
      .select('company_id, role, is_active')
      .in('company_id', companyIds)
      .eq('is_active', true),
    input.sections.includes('activity')
      ? supabaseServer
          .from('Conversations')
          .select('company_id')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('activity')
      ? supabaseServer
          .from('ManagementConversations')
          .select('company_id, user_role')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('ai_usage')
      ? supabaseServer
          .from('AIUsageEvents')
          .select('company_id, total_tokens, input_tokens, cached_input_tokens, output_tokens, web_search_calls, file_search_calls')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
  ])

  const loadError =
    profilesResult.error ||
    techConversationResult.error ||
    managementConversationResult.error ||
    aiUsageResult.error

  if (loadError) throw new Error('Could not build Billing & Usage report.')

  let rows = companyRows.map((company) => {
    const profiles = (profilesResult.data || []).filter((row) => row.company_id === company.id)
    const used = {
      owners: profiles.filter((row) => row.role === 'owner').length,
      managers: profiles.filter((row) => row.role === 'manager').length,
      technicians: profiles.filter((row) => row.role === 'technician').length,
    }
    const included = {
      owners: Number(company.seat_limits?.owners ?? 1),
      managers: Number(company.seat_limits?.managers ?? 2),
      technicians: Number(company.seat_limits?.technicians ?? 8),
    }
    const overage = {
      owners: Math.max(0, used.owners - included.owners),
      managers: Math.max(0, used.managers - included.managers),
      technicians: Math.max(0, used.technicians - included.technicians),
    }

    const techConversations = (techConversationResult.data || []).filter((row) => row.company_id === company.id).length
    const managementRows = (managementConversationResult.data || []).filter((row) => row.company_id === company.id)
    const aiRows = (aiUsageResult.data || []).filter((row) => row.company_id === company.id)

    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      accountType: company.account_type,
      planCode: company.plan_code,
      subscriptionStatus: company.subscription_status,
      included,
      used,
      overage,
      overPlan: overage.owners > 0 || overage.managers > 0 || overage.technicians > 0,
      activity: {
        technicianConversations: techConversations,
        managerConversations: managementRows.filter((row) => row.user_role === 'manager').length,
        ownerConversations: managementRows.filter((row) => row.user_role === 'owner').length,
      },
      aiUsage: {
        calls: aiRows.length,
        inputTokens: aiRows.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0),
        cachedInputTokens: aiRows.reduce((sum, row) => sum + Number(row.cached_input_tokens || 0), 0),
        outputTokens: aiRows.reduce((sum, row) => sum + Number(row.output_tokens || 0), 0),
        totalTokens: aiRows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0),
        webSearchCalls: aiRows.reduce((sum, row) => sum + Number(row.web_search_calls || 0), 0),
        fileSearchCalls: aiRows.reduce((sum, row) => sum + Number(row.file_search_calls || 0), 0),
      },
    }
  })

  const requestedSubscriptionStatus = String(input.filters.subscriptionStatus || 'all')
  if (requestedSubscriptionStatus !== 'all') {
    rows = rows.filter((row) => row.subscriptionStatus === requestedSubscriptionStatus)
  }
  if (input.filters.overPlanOnly === true) {
    rows = rows.filter((row) => row.overPlan)
  }

  const summary = {
    companies: rows.length,
    overPlanCompanies: rows.filter((row) => row.overPlan).length,
    activeSeats: rows.reduce((sum, row) => sum + row.used.owners + row.used.managers + row.used.technicians, 0),
    conversations: rows.reduce(
      (sum, row) =>
        sum +
        row.activity.technicianConversations +
        row.activity.managerConversations +
        row.activity.ownerConversations,
      0
    ),
    aiCalls: rows.reduce((sum, row) => sum + row.aiUsage.calls, 0),
    totalTokens: rows.reduce((sum, row) => sum + row.aiUsage.totalTokens, 0),
  }

  return {
    reportType: 'billing_usage',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections: input.sections,
    scopeCompanyId: input.companyId,
    rows,
    summary,
    billingNote: 'Plan/status and included allowances are CraftCompass billing architecture. Dollar invoices, payments, and revenue will populate here when Stripe is connected.',
    aiCostNote: 'AI usage is company-attributed CraftCompass telemetry. Organization OpenAI billing may also include other OpenAI projects, so this report does not assign unverified dollar cost to a company.',
  }
}
