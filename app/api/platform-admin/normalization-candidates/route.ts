import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const priorityLabel = (score: number) =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: events, error: eventError }, { data: reviews, error: reviewError }] =
    await Promise.all([
      supabaseServer
        .from('NormalizationCandidateEvents')
        .select('id,created_at,normalized_key,question,code_family,route_mode,total_ms,primary_ms,assistant_message_id,code_references,sources')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabaseServer
        .from('NormalizationCandidateReviews')
        .select('normalized_key,status,notes,updated_at'),
    ])

  if (eventError || reviewError) {
    console.error('NORMALIZATION CANDIDATES LOAD ERROR:', eventError || reviewError)
    return jsonNoStore({ error: 'Could not load normalization candidates.' }, { status: 500 })
  }

  const messageIds = [...new Set((events || []).map((row) => row.assistant_message_id).filter(Boolean))]

  const [{ data: helpfulRows }, { data: flagRows }] = messageIds.length
    ? await Promise.all([
        supabaseServer
          .from('ConversationUserFeedback')
          .select('message_id,rating')
          .in('message_id', messageIds),
        supabaseServer
          .from('ConversationAuditFlags')
          .select('message_id,status')
          .eq('conversation_type', 'technician')
          .in('message_id', messageIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const helpfulByMessage = new Set(
    (helpfulRows || []).filter((row: any) => row.rating === 'helpful').map((row: any) => row.message_id)
  )
  const flaggedByMessage = new Set((flagRows || []).map((row: any) => row.message_id))
  const reviewByKey = new Map((reviews || []).map((row: any) => [row.normalized_key, row]))

  const grouped = new Map<string, any>()

  for (const row of events || []) {
    const current = grouped.get(row.normalized_key) || {
      normalizedKey: row.normalized_key,
      sampleQuestion: row.question,
      codeFamily: row.code_family || 'Plumbing',
      count: 0,
      totalMsSum: 0,
      primaryMsSum: 0,
      helpfulCount: 0,
      flaggedCount: 0,
      lastSeen: row.created_at,
      codeReferences: new Set<string>(),
      sourceTitles: new Set<string>(),
    }

    current.count += 1
    current.totalMsSum += Number(row.total_ms || 0)
    current.primaryMsSum += Number(row.primary_ms || 0)
    if (helpfulByMessage.has(row.assistant_message_id)) current.helpfulCount += 1
    if (flaggedByMessage.has(row.assistant_message_id)) current.flaggedCount += 1
    if (new Date(row.created_at).getTime() > new Date(current.lastSeen).getTime()) {
      current.lastSeen = row.created_at
      current.sampleQuestion = row.question
    }
    for (const ref of row.code_references || []) current.codeReferences.add(ref)
    for (const source of Array.isArray(row.sources) ? row.sources : []) {
      if (source?.title) current.sourceTitles.add(source.title)
    }
    grouped.set(row.normalized_key, current)
  }

  const candidates = [...grouped.values()]
    .map((item) => {
      const averageMs = item.count ? Math.round(item.totalMsSum / item.count) : 0
      const averagePrimaryMs = item.count ? Math.round(item.primaryMsSum / item.count) : 0
      const repeatScore = Math.min(30, item.count * 10)
      const latencyScore = Math.min(30, Math.round((averageMs / 1000) * 2))
      const helpfulScore = Math.min(20, item.helpfulCount * 5)
      const sourceScore = item.codeReferences.size > 0 ? 15 : 5
      const flaggedPenalty = Math.min(15, item.flaggedCount * 5)
      const score = Math.max(0, repeatScore + latencyScore + helpfulScore + sourceScore - flaggedPenalty)
      const review = reviewByKey.get(item.normalizedKey)

      return {
        normalizedKey: item.normalizedKey,
        sampleQuestion: item.sampleQuestion,
        codeFamily: item.codeFamily,
        count: item.count,
        averageMs,
        averagePrimaryMs,
        helpfulCount: item.helpfulCount,
        flaggedCount: item.flaggedCount,
        lastSeen: item.lastSeen,
        codeReferences: [...item.codeReferences].slice(0, 12),
        sourceTitles: [...item.sourceTitles].slice(0, 8),
        score,
        priority: priorityLabel(score),
        status: review?.status || 'candidate',
        notes: review?.notes || '',
        reviewedAt: review?.updated_at || null,
      }
    })
    .sort((a, b) => b.score - a.score || b.count - a.count)

  return jsonNoStore({ candidates, generatedAt: new Date().toISOString() })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const normalizedKey = String(body?.normalizedKey || '').trim()
  const status = String(body?.status || '').trim()
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null

  if (!normalizedKey || !['candidate','reviewed','approved','normalized','rejected'].includes(status)) {
    return jsonNoStore({ error: 'A valid candidate and status are required.' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('NormalizationCandidateReviews')
    .upsert({
      normalized_key: normalizedKey,
      status,
      notes,
      updated_at: new Date().toISOString(),
      updated_by_auth_user_id: access.user.id,
    }, { onConflict: 'normalized_key' })
    .select('normalized_key,status,notes,updated_at')
    .single()

  if (error) {
    console.error('NORMALIZATION CANDIDATE REVIEW ERROR:', error)
    return jsonNoStore({ error: 'Could not update candidate.' }, { status: 500 })
  }

  return jsonNoStore({ review: data })
}
