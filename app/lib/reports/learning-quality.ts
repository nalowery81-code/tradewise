import { supabaseServer } from '../supabase-server'
import { resolveReportRange } from './date-range'
import type { ReportRunInput, ReportRunResult } from './types'

type ConversationRef = {
  id: string
  company_id: string
}

type QualityRow = {
  conversation_type: string
  conversation_id: string
  created_at: string
  rating?: string | null
  status?: string | null
  category?: string | null
}

const groupCount = (rows: Array<{ status?: string | null }>, value: string) =>
  rows.filter((row) => String(row.status || '') === value).length

export async function runLearningQualityReport(input: ReportRunInput): Promise<ReportRunResult> {
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

  const [
    techConversationsResult,
    managementConversationsResult,
    feedbackResult,
    requestsResult,
    flagsResult,
    reviewsResult,
    guidanceResult,
    verifiedSourcesResult,
    learningRunsResult,
    sourceChecksResult,
  ] = await Promise.all([
    companyIds.length
      ? supabaseServer.from('Conversations').select('id, company_id').in('company_id', companyIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabaseServer.from('ManagementConversations').select('id, company_id').in('company_id', companyIds)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('conversation_quality')
      ? supabaseServer
          .from('ConversationUserFeedback')
          .select('conversation_type, conversation_id, rating, created_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('conversation_quality')
      ? supabaseServer
          .from('ConversationFeedbackRequests')
          .select('conversation_type, conversation_id, status, rating, created_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('conversation_quality')
      ? supabaseServer
          .from('ConversationAuditFlags')
          .select('conversation_type, conversation_id, status, created_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('conversation_quality') || input.sections.includes('corrections_guidance')
      ? supabaseServer
          .from('ConversationAuditReviews')
          .select('conversation_type, conversation_id, status, category, created_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('corrections_guidance')
      ? supabaseServer
          .from('GuidanceLibrary')
          .select('id, status, topic, priority, created_at, activated_at')
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('source_health')
      ? supabaseServer
          .from('VerifiedSourceDocuments')
          .select('id, status, source_type, authority, last_verified_at, created_at')
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('learning_runs')
      ? supabaseServer
          .from('WeeklyLearningRuns')
          .select('id, status, review_count, guidance_count, helpful_count, source_checked_count, source_issue_count, created_at, completed_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    input.sections.includes('source_health')
      ? supabaseServer
          .from('WeeklySourceChecks')
          .select('status, http_status, checked_at')
          .gte('checked_at', startIso)
          .lte('checked_at', endIso)
      : Promise.resolve({ data: [], error: null }),
  ])

  const loadError =
    techConversationsResult.error ||
    managementConversationsResult.error ||
    feedbackResult.error ||
    requestsResult.error ||
    flagsResult.error ||
    reviewsResult.error ||
    guidanceResult.error ||
    verifiedSourcesResult.error ||
    learningRunsResult.error ||
    sourceChecksResult.error

  if (loadError) throw new Error('Could not build Learning & Quality report.')

  const companyByConversation = new Map<string, string>()
  for (const row of (techConversationsResult.data || []) as ConversationRef[]) {
    companyByConversation.set(`technician:${row.id}`, row.company_id)
  }
  for (const row of (managementConversationsResult.data || []) as ConversationRef[]) {
    companyByConversation.set(`management:${row.id}`, row.company_id)
  }

  const linkedToCompany = (rows: QualityRow[], companyId: string) =>
    rows.filter((row) =>
      companyByConversation.get(`${row.conversation_type}:${row.conversation_id}`) === companyId
    )

  let rows = companyRows.map((company) => {
    const feedback = linkedToCompany((feedbackResult.data || []) as QualityRow[], company.id)
    const requests = linkedToCompany((requestsResult.data || []) as QualityRow[], company.id)
    const flags = linkedToCompany((flagsResult.data || []) as QualityRow[], company.id)
    const reviews = linkedToCompany((reviewsResult.data || []) as QualityRow[], company.id)

    const helpful = feedback.filter((row) => row.rating === 'helpful').length
    const notHelpful = feedback.filter((row) => row.rating && row.rating !== 'helpful').length
    const corrected = reviews.filter((row) => row.status === 'corrected').length
    const incorrect = reviews.filter((row) => row.status === 'incorrect').length
    const openFlags = flags.filter((row) => !['resolved'].includes(String(row.status || ''))).length
    const respondedRequests = requests.filter((row) => row.status === 'responded').length
    const attentionSignals: string[] = []

    if (notHelpful > 0) attentionSignals.push(`${notHelpful} not-helpful feedback signal${notHelpful === 1 ? '' : 's'}`)
    if (incorrect > 0) attentionSignals.push(`${incorrect} audit review${incorrect === 1 ? '' : 's'} marked incorrect`)
    if (openFlags > 0) attentionSignals.push(`${openFlags} unresolved or confirmed audit flag${openFlags === 1 ? '' : 's'}`)

    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      accountType: company.account_type,
      quality: {
        feedbackCount: feedback.length,
        helpful,
        notHelpful,
        feedbackRequests: requests.length,
        respondedRequests,
        auditFlags: flags.length,
        openFlags,
        auditReviews: reviews.length,
        corrected,
        incorrect,
      },
      attention: {
        needsAttention: attentionSignals.length > 0,
        signals: attentionSignals,
      },
    }
  })

  if (input.filters.attentionOnly === true) {
    rows = rows.filter((row) => row.attention.needsAttention)
  }

  const guidance = guidanceResult.data || []
  const verifiedSources = verifiedSourcesResult.data || []
  const learningRuns = learningRunsResult.data || []
  const sourceChecks = sourceChecksResult.data || []

  const platform = {
    guidance: {
      total: guidance.length,
      active: guidance.filter((row: any) => row.status === 'active').length,
      inactive: guidance.filter((row: any) => row.status !== 'active').length,
    },
    verifiedSources: {
      total: verifiedSources.length,
      current: verifiedSources.filter((row: any) => row.status === 'current').length,
      needsAttention: verifiedSources.filter((row: any) => row.status !== 'current').length,
    },
    sourceChecks: {
      total: sourceChecks.length,
      issues: sourceChecks.filter((row: any) => row.status && row.status !== 'ok').length,
    },
    learningRuns: {
      total: learningRuns.length,
      completed: learningRuns.filter((row: any) => row.status === 'completed').length,
      failed: learningRuns.filter((row: any) => row.status === 'failed').length,
      reviews: learningRuns.reduce((sum: number, row: any) => sum + Number(row.review_count || 0), 0),
      guidanceCreated: learningRuns.reduce((sum: number, row: any) => sum + Number(row.guidance_count || 0), 0),
      helpfulSignals: learningRuns.reduce((sum: number, row: any) => sum + Number(row.helpful_count || 0), 0),
      sourcesChecked: learningRuns.reduce((sum: number, row: any) => sum + Number(row.source_checked_count || 0), 0),
      sourceIssues: learningRuns.reduce((sum: number, row: any) => sum + Number(row.source_issue_count || 0), 0),
    },
  }

  const summary = {
    companies: rows.length,
    attentionCompanies: rows.filter((row) => row.attention.needsAttention).length,
    feedback: rows.reduce((sum, row) => sum + row.quality.feedbackCount, 0),
    helpfulFeedback: rows.reduce((sum, row) => sum + row.quality.helpful, 0),
    auditReviews: rows.reduce((sum, row) => sum + row.quality.auditReviews, 0),
    correctedReviews: rows.reduce((sum, row) => sum + row.quality.corrected, 0),
    openFlags: rows.reduce((sum, row) => sum + row.quality.openFlags, 0),
    activeGuidance: platform.guidance.active,
    verifiedSourcesCurrent: platform.verifiedSources.current,
    verifiedSourcesTotal: platform.verifiedSources.total,
    learningRunsCompleted: platform.learningRuns.completed,
  }

  return {
    reportType: 'learning_quality',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections: input.sections,
    scopeCompanyId: input.companyId,
    rows,
    summary,
    platform,
  }
}
