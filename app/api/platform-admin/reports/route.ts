import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const REPORT_TYPES = ['billing_usage','company_performance','ai_usage_cost','learning_quality','user_activity']
const BILLING_SECTIONS = ['plan_seats','activity','ai_usage']

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [{ data: definitions, error: definitionError }, { data: companies, error: companyError }] =
    await Promise.all([
      supabaseServer
        .from('ReportDefinitions')
        .select('id, name, report_type, scope_company_id, filters, sections, created_at, updated_at')
        .order('updated_at', { ascending: false }),
      supabaseServer
        .from('Companies')
        .select('id, name, status, account_type')
        .order('name', { ascending: true }),
    ])

  if (definitionError || companyError) {
    console.error('REPORT CENTER LOAD ERROR:', definitionError || companyError)
    return jsonNoStore({ error: 'Could not load the Report Center.' }, { status: 500 })
  }

  return jsonNoStore({
    definitions: definitions || [],
    companies: companies || [],
    supportedReportTypes: ['billing_usage'],
  })
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''
  const reportType = String(body?.reportType || '').trim()
  const companyId = body?.companyId ? String(body.companyId).trim() : null
  const filters = body?.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters
    : {}
  const sections = Array.isArray(body?.sections)
    ? body.sections.map((value: unknown) => String(value)).filter(Boolean)
    : []

  if (name.length < 2 || name.length > 120) {
    return jsonNoStore({ error: 'Report name must be between 2 and 120 characters.' }, { status: 400 })
  }
  if (!REPORT_TYPES.includes(reportType)) {
    return jsonNoStore({ error: 'Unknown report type.' }, { status: 400 })
  }
  if (reportType !== 'billing_usage') {
    return jsonNoStore({ error: 'That report family is not available yet.' }, { status: 400 })
  }
  if (!sections.length || sections.some((section: string) => !BILLING_SECTIONS.includes(section))) {
    return jsonNoStore({ error: 'Choose at least one supported Billing & Usage section.' }, { status: 400 })
  }

  if (companyId) {
    const { data: company } = await supabaseServer
      .from('Companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle()
    if (!company) return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  const { data, error } = await supabaseServer
    .from('ReportDefinitions')
    .insert({
      name,
      report_type: reportType,
      scope_company_id: companyId,
      filters,
      sections,
      created_by_profile_id: access.profileId,
    })
    .select('id, name, report_type, scope_company_id, filters, sections, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('SAVE REPORT DEFINITION ERROR:', error)
    return jsonNoStore({ error: 'Could not save the report.' }, { status: 500 })
  }

  return jsonNoStore({ definition: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const id = new URL(request.url).searchParams.get('id')?.trim() || ''
  if (!id) return jsonNoStore({ error: 'Report id is required.' }, { status: 400 })

  const { error } = await supabaseServer
    .from('ReportDefinitions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('DELETE REPORT DEFINITION ERROR:', error)
    return jsonNoStore({ error: 'Could not delete the saved report.' }, { status: 500 })
  }

  return jsonNoStore({ deleted: true, id })
}
