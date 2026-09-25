import { requirePlatformAdmin } from '../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../lib/supabase-server'
import { getReportCatalogItem, isReportType, validateReportDefinition } from '../../../../lib/reports/catalog'
import { runReport } from '../../../../lib/reports/runner'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const reportTypeValue = String(body?.reportType || 'billing_usage')
  const companyId = body?.companyId ? String(body.companyId).trim() : null
  const definitionId = body?.definitionId ? String(body.definitionId).trim() : null
  const sections = Array.isArray(body?.sections)
    ? body.sections.map((value: unknown) => String(value)).filter(Boolean)
    : []
  const filters = body?.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters as Record<string, unknown>
    : {}

  if (!isReportType(reportTypeValue)) {
    return jsonNoStore({ error: 'Unknown report type.' }, { status: 400 })
  }

  const catalogItem = getReportCatalogItem(reportTypeValue)
  if (!catalogItem) return jsonNoStore({ error: 'Unknown report type.' }, { status: 400 })

  const requestedSections = sections.length ? sections : catalogItem.defaultSections
  const validation = validateReportDefinition({
    reportType: reportTypeValue,
    sections: requestedSections,
  })
  if (!validation.ok) return jsonNoStore({ error: validation.error }, { status: 400 })

  if (companyId) {
    const { data: company } = await supabaseServer
      .from('Companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle()

    if (!company) return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  const startedAt = new Date().toISOString()
  const { data: runRow, error: runInsertError } = await supabaseServer
    .from('ReportRuns')
    .insert({
      definition_id: definitionId,
      report_type: reportTypeValue,
      schema_version: catalogItem.schemaVersion,
      scope_company_id: companyId,
      filters,
      sections: requestedSections,
      status: 'running',
      generated_by_profile_id: access.profileId,
      started_at: startedAt,
    })
    .select('id')
    .single()

  if (runInsertError || !runRow) {
    console.error('REPORT RUN AUDIT INSERT ERROR:', runInsertError)
    return jsonNoStore({ error: 'Could not start the report run.' }, { status: 500 })
  }

  try {
    const result = await runReport({
      reportType: reportTypeValue,
      companyId,
      filters,
      sections: requestedSections,
    })

    const completedAt = new Date().toISOString()
    const { error: completeError } = await supabaseServer
      .from('ReportRuns')
      .update({
        status: 'completed',
        row_count: result.rows.length,
        summary: result.summary,
        completed_at: completedAt,
      })
      .eq('id', runRow.id)

    if (completeError) console.error('REPORT RUN COMPLETE AUDIT ERROR:', completeError)

    return jsonNoStore({
      ...result,
      runId: runRow.id,
      definitionId,
      startedAt,
      completedAt,
    })
  } catch (error: any) {
    const message = error?.message || 'Could not run report.'
    console.error('REPORT RUN ERROR:', error)

    const { error: failError } = await supabaseServer
      .from('ReportRuns')
      .update({
        status: 'failed',
        error_text: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id)

    if (failError) console.error('REPORT RUN FAILURE AUDIT ERROR:', failError)
    return jsonNoStore({ error: message, runId: runRow.id }, { status: 500 })
  }
}
