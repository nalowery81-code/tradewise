import { requirePlatformAdmin } from '../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const BILLING_SECTIONS = ['plan_seats','activity','ai_usage']

const resolveRange = (filters: Record<string, unknown>) => {
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

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const reportType = String(body?.reportType || 'billing_usage')
  const companyId = body?.companyId ? String(body.companyId).trim() : null
  const sections = Array.isArray(body?.sections)
    ? body.sections.map((value: unknown) => String(value)).filter(Boolean)
    : BILLING_SECTIONS
  const filters = body?.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters as Record<string, unknown>
    : {}

  if (reportType !== 'billing_usage') {
    return jsonNoStore({ error: 'Only Billing & Usage is available in the MVP Report Center.' }, { status: 400 })
  }
  if (!sections.length || sections.some((section: string) => !BILLING_SECTIONS.includes(section))) {
    return jsonNoStore({ error: 'Choose at least one report section.' }, { status: 400 })
  }

  let range
  try {
    range = resolveRange(filters)
  } catch (error: any) {
    return jsonNoStore({ error: error?.message || 'Invalid report date range.' }, { status: 400 })
  }

  let companyQuery = supabaseServer
    .from('Companies')
    .select('id, name, status, account_type, plan_code, subscription_status, seat_limits')
    .order('name', { ascending: true })

  if (companyId) companyQuery = companyQuery.eq('id', companyId)

  const { data: companies, error: companyError } = await companyQuery
  if (companyError) {
    console.error('REPORT COMPANY LOAD ERROR:', companyError)
    return jsonNoStore({ error: 'Could not load report companies.' }, { status: 500 })
  }

  const companyRows = companies || []
  const companyIds = companyRows.map((company) => company.id)
  if (!companyIds.length) {
    return jsonNoStore({
      reportType,
      generatedAt: new Date().toISOString(),
      period: { preset: range.preset, start: range.start.toISOString(), end: range.end.toISOString() },
      sections,
      rows: [],
    })
  }

  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  const [profilesResult, techConversationResult, managementConversationResult, aiUsageResult] = await Promise.all([
    supabaseServer
      .from('UserProfiles')
      .select('company_id, role, is_active')
      .in('company_id', companyIds)
      .eq('is_active', true),
    sections.includes('activity')
      ? supabaseServer
          .from('Conversations')
          .select('company_id')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    sections.includes('activity')
      ? supabaseServer
          .from('ManagementConversations')
          .select('company_id, user_role')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    sections.includes('ai_usage')
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

  if (loadError) {
    console.error('BILLING USAGE REPORT LOAD ERROR:', loadError)
    return jsonNoStore({ error: 'Could not build Billing & Usage report.' }, { status: 500 })
  }

  const rows = companyRows.map((company) => {
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

  return jsonNoStore({
    reportType,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections,
    scopeCompanyId: companyId,
    rows,
    billingNote: 'Plan/status and included allowances are CraftCompass billing architecture. Dollar invoices, payments, and revenue will populate here when Stripe is connected.',
    aiCostNote: 'AI usage is company-attributed CraftCompass telemetry. Organization OpenAI billing may also include other OpenAI projects, so this report does not assign unverified dollar cost to a company.',
  })
}
