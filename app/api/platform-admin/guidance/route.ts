import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'
import { runWeeklyLearning } from '../../../lib/weekly-learning'

export const maxDuration = 60

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error
  const [
    { data, error },
    { data: weeklyRuns, error: weeklyRunsError },
  ] = await Promise.all([
    supabaseServer.from('GuidanceLibrary')
      .select('id, created_at, updated_at, title, guidance_text, scope, topic, priority, status, source_review_id, source_flag_id, source_weekly_run_id, activated_at')
      .order('updated_at', { ascending: false }).limit(500),
    supabaseServer.from('WeeklyLearningRuns')
      .select('id, created_at, completed_at, trigger_type, period_start, period_end, status, review_count, guidance_count, synopsis, model_name, error_text')
      .order('created_at', { ascending: false }).limit(12),
  ])
  if (error || weeklyRunsError) return jsonNoStore({ error: 'Could not load guidance library.' }, { status: 500 })
  return jsonNoStore({ guidance: data || [], weeklyRuns: weeklyRuns || [] })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return jsonNoStore({ error: 'Guidance item is required.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body?.status !== undefined) {
    const status = String(body.status || '')
    if (!['draft','active','inactive','superseded'].includes(status)) return jsonNoStore({ error: 'Invalid status.' }, { status: 400 })
    updates.status = status
    if (status === 'active') updates.activated_at = new Date().toISOString()
  }
  if (body?.title !== undefined) updates.title = String(body.title || '').trim()
  if (body?.guidanceText !== undefined) updates.guidance_text = String(body.guidanceText || '').trim()
  if (body?.topic !== undefined) updates.topic = String(body.topic || '').trim() || null
  if (body?.scope !== undefined) {
    const scope = String(body.scope || '')
    if (!['all','technician','management'].includes(scope)) return jsonNoStore({ error: 'Invalid scope.' }, { status: 400 })
    updates.scope = scope
  }
  if (body?.priority !== undefined) {
    const priority = Number(body.priority)
    if (!Number.isInteger(priority) || priority < 1 || priority > 100) return jsonNoStore({ error: 'Priority must be 1 to 100.' }, { status: 400 })
    updates.priority = priority
  }

  const { data, error } = await supabaseServer.from('GuidanceLibrary').update(updates).eq('id', id)
    .select('id, created_at, updated_at, title, guidance_text, scope, topic, priority, status, source_review_id, source_flag_id, source_weekly_run_id, activated_at').single()
  if (error) return jsonNoStore({ error: 'Could not update guidance.' }, { status: 500 })
  return jsonNoStore({ guidance: data })
}


export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')

  if (action !== 'run_weekly_learning') {
    return jsonNoStore({ error: 'Unknown guidance action.' }, { status: 400 })
  }

  try {
    const result = await runWeeklyLearning('manual', access.profileId)
    return jsonNoStore({ ok: true, ...result })
  } catch (error: any) {
    console.error('MANUAL WEEKLY LEARNING ERROR:', error)
    return jsonNoStore({ error: error?.message || 'Weekly learning failed.' }, { status: 500 })
  }
}
