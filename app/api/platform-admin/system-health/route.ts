import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    companies,
    users,
    tech24h,
    management24h,
    ai24h,
    ai7d,
    learningRuns,
    sourceIssues,
    verifiedSources,
    costSnapshot,
  ] = await Promise.all([
    supabaseServer.from('Companies').select('id, status'),
    supabaseServer.from('UserProfiles').select('id, is_active'),
    supabaseServer.from('Conversations').select('id').gte('created_at', dayAgo),
    supabaseServer.from('ManagementConversations').select('id').gte('created_at', dayAgo),
    supabaseServer.from('AIUsageEvents').select('id, total_tokens').gte('created_at', dayAgo),
    supabaseServer.from('AIUsageEvents').select('id, total_tokens').gte('created_at', weekAgo),
    supabaseServer.from('WeeklyLearningRuns')
      .select('id, status, created_at, completed_at, review_count, guidance_count, source_checked_count, source_issue_count, error_text')
      .order('created_at', { ascending: false })
      .limit(8),
    supabaseServer.from('WeeklySourceChecks')
      .select('id, source_title, source_url, status, http_status, checked_at, error_text')
      .in('status', ['dead', 'blocked', 'unreachable', 'invalid'])
      .order('checked_at', { ascending: false })
      .limit(12),
    supabaseServer.from('VerifiedSourceDocuments').select('id, status, last_verified_at'),
    supabaseServer.from('PlatformAdminOpenAICostSnapshots')
      .select('fetched_at')
      .eq('cache_key', 'organization_cost_usage_v1')
      .maybeSingle(),
  ])

  const error =
    companies.error || users.error || tech24h.error || management24h.error ||
    ai24h.error || ai7d.error || learningRuns.error || sourceIssues.error ||
    verifiedSources.error || costSnapshot.error

  if (error) {
    console.error('SYSTEM HEALTH LOAD ERROR:', error)
    return jsonNoStore({ error: 'Could not load system health.' }, { status: 500 })
  }

  const runs = learningRuns.data || []
  const latestRun = runs[0] || null
  const failedRuns = runs.filter((run) => run.status === 'failed').length
  const sourceIssueRows = sourceIssues.data || []
  const verified = verifiedSources.data || []
  const sourceAttention = verified.filter((source) => source.status !== 'current').length
  const activeUsers = (users.data || []).filter((user) => user.is_active !== false).length
  const ai24Rows = ai24h.data || []
  const ai7Rows = ai7d.data || []

  const checks = {
    application: 'healthy',
    database: 'healthy',
    deployment: process.env.VERCEL_ENV === 'production' ? 'healthy' : 'attention',
    weeklyLearning: failedRuns > 0 ? 'attention' : latestRun ? 'healthy' : 'unknown',
    sources: sourceIssueRows.length > 0 || sourceAttention > 0 ? 'attention' : 'healthy',
    openAITracker: costSnapshot.data?.fetched_at ? 'healthy' : 'unknown',
  }

  const overall = Object.values(checks).includes('attention') ? 'attention' : 'healthy'

  return jsonNoStore({
    generatedAt: now.toISOString(),
    overall,
    checks,
    deployment: {
      environment: process.env.VERCEL_ENV || 'unknown',
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
      url: 'https://app.craftcompassai.com',
    },
    metrics: {
      companies: companies.data?.length || 0,
      activeUsers,
      conversations24h: (tech24h.data?.length || 0) + (management24h.data?.length || 0),
      aiCalls24h: ai24Rows.length,
      aiTokens24h: ai24Rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0),
      aiCalls7d: ai7Rows.length,
      aiTokens7d: ai7Rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0),
      verifiedSources: verified.length,
      sourceAttention,
      recentSourceIssues: sourceIssueRows.length,
    },
    latestLearningRun: latestRun,
    learningRuns: runs,
    sourceIssues: sourceIssueRows,
    openAICostSnapshotAt: costSnapshot.data?.fetched_at || null,
  })
}
