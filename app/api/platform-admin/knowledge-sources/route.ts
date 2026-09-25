import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [documents, editions, sections, relationships, sourceChecks] = await Promise.all([
    supabaseServer.from('VerifiedSourceDocuments')
      .select('id, code_edition_id, title, source_type, authority, source_url, content_rights, publication_date, effective_from, effective_to, status, last_verified_at, created_at')
      .order('created_at', { ascending: false }),
    supabaseServer.from('VerifiedCodeEditions')
      .select('id, jurisdiction_id, code_family, title, rule_citation, model_code_title, model_code_edition, effective_from, effective_to, status, source_authority, source_url, last_verified_at, created_at')
      .order('created_at', { ascending: false }),
    supabaseServer.from('VerifiedCodeSections')
      .select('id, source_document_id, code_edition_id, status, last_verified_at'),
    supabaseServer.from('VerifiedCodeRelationships').select('id'),
    supabaseServer.from('WeeklySourceChecks')
      .select('id, source_title, source_url, status, http_status, final_url, error_text, checked_at')
      .order('checked_at', { ascending: false })
      .limit(100),
  ])

  const error = documents.error || editions.error || sections.error || relationships.error || sourceChecks.error
  if (error) {
    console.error('KNOWLEDGE SOURCES LOAD ERROR:', error)
    return jsonNoStore({ error: 'Could not load knowledge and source data.' }, { status: 500 })
  }

  const sectionRows = sections.data || []
  const documentRows = (documents.data || []).map((document) => ({
    ...document,
    sectionCount: sectionRows.filter((section) => section.source_document_id === document.id).length,
  }))
  const editionRows = (editions.data || []).map((edition) => ({
    ...edition,
    sectionCount: sectionRows.filter((section) => section.code_edition_id === edition.id).length,
    documentCount: documentRows.filter((document) => document.code_edition_id === edition.id).length,
  }))

  const checks = sourceChecks.data || []
  const issueStatuses = new Set(['dead', 'blocked', 'unreachable', 'invalid'])

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    documents: documentRows,
    editions: editionRows,
    recentChecks: checks,
    summary: {
      documents: documentRows.length,
      currentDocuments: documentRows.filter((document) => document.status === 'current').length,
      editions: editionRows.length,
      currentEditions: editionRows.filter((edition) => edition.status === 'current').length,
      sections: sectionRows.length,
      currentSections: sectionRows.filter((section) => section.status === 'current').length,
      relationships: relationships.data?.length || 0,
      recentChecks: checks.length,
      recentCheckIssues: checks.filter((check) => issueStatuses.has(String(check.status || ''))).length,
    },
  })
}
