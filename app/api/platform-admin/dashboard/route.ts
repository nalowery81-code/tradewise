import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  try {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      companies,
      profiles,
      technicians,
      techConversations,
      managementConversations,
      pendingFlags,
      helpful,
      recentReviews,
      draftGuidance,
      activeGuidance,
      weeklyRuns,
      sourceIssues,
      pendingFeedback,
    ] = await Promise.all([
      supabaseServer.from('Companies').select('id, name, status, account_type, trades, jurisdictions'),
      supabaseServer.from('UserProfiles').select('id, company_id, role, is_active'),
      supabaseServer.from('Technicians').select('id, company_id'),
      supabaseServer.from('Conversations').select('id, company_id, jurisdiction, created_at').gte('created_at', weekAgo),
      supabaseServer.from('ManagementConversations').select('id, company_id, user_role, created_at').gte('created_at', weekAgo),
      supabaseServer.from('ConversationAuditFlags').select('id, created_at').eq('status', 'pending'),
      supabaseServer.from('ConversationUserFeedback').select('id, updated_at').eq('rating', 'helpful').gte('updated_at', weekAgo),
      supabaseServer.from('ConversationAuditReviews').select('id, status, updated_at').gte('updated_at', weekAgo),
      supabaseServer.from('GuidanceLibrary').select('id, title, updated_at').eq('status', 'draft'),
      supabaseServer.from('GuidanceLibrary').select('id, title, activated_at, updated_at').eq('status', 'active').order('updated_at', { ascending: false }).limit(8),
      supabaseServer.from('WeeklyLearningRuns').select('id, created_at, completed_at, trigger_type, status, review_count, helpful_count, guidance_count, source_checked_count, source_issue_count, synopsis, error_text').order('created_at', { ascending: false }).limit(8),
      supabaseServer.from('WeeklySourceChecks').select('id, source_title, source_url, status, http_status, checked_at').in('status', ['dead','blocked','unreachable','invalid']).gte('checked_at', weekAgo).order('checked_at', { ascending: false }).limit(20),
      supabaseServer.from('ConversationFeedbackRequests').select('id, created_at').eq('status', 'pending'),
    ])

    const errors = [companies, profiles, technicians, techConversations, managementConversations, pendingFlags, helpful, recentReviews, draftGuidance, activeGuidance, weeklyRuns, sourceIssues, pendingFeedback].filter((result) => result.error)
    if (errors.length) {
      console.error('PLATFORM DASHBOARD LOAD ERROR:', errors.map((result) => result.error))
      return jsonNoStore({ error: 'Could not load platform health.' }, { status: 500 })
    }

    const runs = weeklyRuns.data || []
    const latestRun = runs[0] || null
    const failedRuns = runs.filter((run) => run.status === 'failed')
    const reviews = recentReviews.data || []
    const reviewedCount = reviews.filter((review) => ['good','corrected','resolved'].includes(review.status)).length
    const sourceIssueRows = sourceIssues.data || []

    const needsAttention = {
      auditFlags: pendingFlags.data?.length || 0,
      sourceExceptions: sourceIssueRows.length,
      draftGuidance: draftGuidance.data?.length || 0,
      failedRuns: failedRuns.length,
      pendingFeedback: pendingFeedback.data?.length || 0,
    }
    const attentionTotal = Object.values(needsAttention).reduce((sum, value) => sum + value, 0)

    const changes: { kind: string; title: string; at: string | null; href: string }[] = []

    for (const item of (activeGuidance.data || []).slice(0, 4)) {
      changes.push({ kind: 'guidance', title: `Guidance active: ${item.title}`, at: item.activated_at || item.updated_at, href: '/platform-admin/guidance' })
    }
    for (const run of runs.slice(0, 4)) {
      changes.push({
        kind: run.status === 'failed' ? 'error' : 'learning',
        title: run.status === 'failed'
          ? 'Sunday cycle failed'
          : `Sunday cycle: ${run.review_count || 0} reviews, ${run.helpful_count || 0} Helpful, ${run.source_checked_count || 0} sources checked`,
        at: run.completed_at || run.created_at,
        href: '/platform-admin/guidance',
      })
    }
    for (const issue of sourceIssueRows.slice(0, 4)) {
      changes.push({ kind: 'source', title: `Source exception: ${issue.source_title || issue.source_url}`, at: issue.checked_at, href: '/platform-admin/guidance' })
    }
    changes.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())

    const vercelEnvironment = process.env.VERCEL_ENV || 'unknown'
    const deployment = {
      state: vercelEnvironment === 'production' ? 'READY' : vercelEnvironment.toUpperCase(),
      environment: vercelEnvironment,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
      url: 'https://app.craftcompassai.com',
    }

    const health = failedRuns.length > 0 ? 'attention' : 'healthy'

    const companyBreakdown = (companies.data || []).map((company: any) => {
      const companyProfiles = (profiles.data || []).filter((profile: any) => profile.company_id === company.id)
      const companyTechnicians = (technicians.data || []).filter((technician: any) => technician.company_id === company.id)
      const companyTechConversations = (techConversations.data || []).filter((conversation: any) => conversation.company_id === company.id)
      const companyManagementConversations = (managementConversations.data || []).filter((conversation: any) => conversation.company_id === company.id)
      const jurisdictionCounts: Record<string, number> = {}

      for (const conversation of companyTechConversations) {
        const state = String((conversation.jurisdiction as any)?.state || '').toUpperCase()
        if (state) jurisdictionCounts[state] = (jurisdictionCounts[state] || 0) + 1
      }

      return {
        id: company.id,
        name: company.name,
        status: company.status,
        accountType: company.account_type,
        trades: Array.isArray(company.trades) ? company.trades : [],
        jurisdictions: Array.isArray(company.jurisdictions) ? company.jurisdictions : [],
        activeUsers: companyProfiles.filter((profile: any) => profile.is_active !== false).length,
        technicians: companyTechnicians.length,
        technicianConversations7d: companyTechConversations.length,
        managementConversations7d: companyManagementConversations.length,
        jurisdictionConversationCounts7d: jurisdictionCounts,
      }
    })

    return jsonNoStore({
      generatedAt: now.toISOString(),
      health,
      attentionTotal,
      needsAttention,
      deployment,
      companyBreakdown,
      counts: {
        companies: companies.data?.length || 0,
        activeUsers: (profiles.data || []).filter((profile) => profile.is_active !== false).length,
        technicians: technicians.data?.length || 0,
        technicianConversations7d: techConversations.data?.length || 0,
        managementConversations7d: managementConversations.data?.length || 0,
      },
      quality: {
        helpful7d: helpful.data?.length || 0,
        flagsPending: pendingFlags.data?.length || 0,
        reviewed7d: reviewedCount,
        draftGuidance: draftGuidance.data?.length || 0,
        sourcesCheckedLatest: latestRun?.source_checked_count || 0,
        sourceIssuesLatest: latestRun?.source_issue_count || 0,
      },
      latestRun,
      sourceIssues: sourceIssueRows.slice(0, 6),
      changes: changes.slice(0, 8),
    })
  } catch (error) {
    console.error('PLATFORM DASHBOARD ERROR:', error)
    return jsonNoStore({ error: 'Could not load platform health.' }, { status: 500 })
  }
}
