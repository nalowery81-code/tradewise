import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'
import { REPORT_CATALOG, getReportCatalogItem, validateReportDefinition } from '../../../lib/reports/catalog'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const normalizeDefinitionInput = (body: any) => {
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''
  const reportType = String(body?.reportType || '').trim()
  const companyId = body?.companyId ? String(body.companyId).trim() : null
  const filters = body?.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters
    : {}
  const sections = Array.isArray(body?.sections)
    ? body.sections.map((value: unknown) => String(value)).filter(Boolean)
    : []

  return { name, reportType, companyId, filters, sections }
}

const validateCompanyScope = async (companyId: string | null) => {
  if (!companyId) return true
  const { data: company } = await supabaseServer
    .from('Companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle()
  return Boolean(company)
}

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [{ data: definitions, error: definitionError }, { data: companies, error: companyError }, { data: runs, error: runError }] =
    await Promise.all([
      supabaseServer
        .from('ReportDefinitions')
        .select('id, name, report_type, schema_version, scope_company_id, filters, sections, created_at, updated_at')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false }),
      supabaseServer
        .from('Companies')
        .select('id, name, status, account_type')
        .order('name', { ascending: true }),
      supabaseServer
        .from('ReportRuns')
        .select('id, definition_id, report_type, schema_version, scope_company_id, filters, sections, status, row_count, summary, started_at, completed_at, error_text')
        .order('started_at', { ascending: false })
        .limit(25),
    ])

  if (definitionError || companyError || runError) {
    console.error('REPORT CENTER LOAD ERROR:', definitionError || companyError || runError)
    return jsonNoStore({ error: 'Could not load the Report Center.' }, { status: 500 })
  }

  return jsonNoStore({
    catalog: REPORT_CATALOG,
    definitions: definitions || [],
    companies: companies || [],
    recentRuns: runs || [],
  })
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const input = normalizeDefinitionInput(await request.json().catch(() => ({})))

  if (input.name.length < 2 || input.name.length > 120) {
    return jsonNoStore({ error: 'Report name must be between 2 and 120 characters.' }, { status: 400 })
  }

  const validation = validateReportDefinition({
    reportType: input.reportType,
    sections: input.sections,
  })
  if (!validation.ok) return jsonNoStore({ error: validation.error }, { status: 400 })
  if (!(await validateCompanyScope(input.companyId))) {
    return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  const catalogItem = getReportCatalogItem(input.reportType)!

  const { data, error } = await supabaseServer
    .from('ReportDefinitions')
    .insert({
      name: input.name,
      report_type: input.reportType,
      schema_version: catalogItem.schemaVersion,
      scope_company_id: input.companyId,
      filters: input.filters,
      sections: input.sections,
      created_by_profile_id: access.profileId,
      updated_at: new Date().toISOString(),
    })
    .select('id, name, report_type, schema_version, scope_company_id, filters, sections, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('SAVE REPORT DEFINITION ERROR:', error)
    return jsonNoStore({ error: 'Could not save the report.' }, { status: 500 })
  }

  return jsonNoStore({ definition: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  if (!id) return jsonNoStore({ error: 'Report id is required.' }, { status: 400 })

  const input = normalizeDefinitionInput(body)
  if (input.name.length < 2 || input.name.length > 120) {
    return jsonNoStore({ error: 'Report name must be between 2 and 120 characters.' }, { status: 400 })
  }

  const validation = validateReportDefinition({
    reportType: input.reportType,
    sections: input.sections,
  })
  if (!validation.ok) return jsonNoStore({ error: validation.error }, { status: 400 })
  if (!(await validateCompanyScope(input.companyId))) {
    return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  const catalogItem = getReportCatalogItem(input.reportType)!

  const { data, error } = await supabaseServer
    .from('ReportDefinitions')
    .update({
      name: input.name,
      report_type: input.reportType,
      schema_version: catalogItem.schemaVersion,
      scope_company_id: input.companyId,
      filters: input.filters,
      sections: input.sections,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('is_archived', false)
    .select('id, name, report_type, schema_version, scope_company_id, filters, sections, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('UPDATE REPORT DEFINITION ERROR:', error)
    return jsonNoStore({ error: 'Could not update the saved report.' }, { status: 500 })
  }

  return jsonNoStore({ definition: data })
}

export async function DELETE(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const id = new URL(request.url).searchParams.get('id')?.trim() || ''
  if (!id) return jsonNoStore({ error: 'Report id is required.' }, { status: 400 })

  const { error } = await supabaseServer
    .from('ReportDefinitions')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('ARCHIVE REPORT DEFINITION ERROR:', error)
    return jsonNoStore({ error: 'Could not archive the saved report.' }, { status: 500 })
  }

  return jsonNoStore({ archived: true, id })
}
