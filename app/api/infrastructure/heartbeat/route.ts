import { createHash } from 'crypto'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const finiteNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!token) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const tokenHash = hashToken(token)
  const { data: source, error: sourceError } = await supabaseServer
    .from('InfrastructureHeartbeatSources')
    .select('id, source_key, display_name, is_active')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (sourceError) {
    console.error('INFRASTRUCTURE HEARTBEAT AUTH ERROR:', sourceError)
    return Response.json({ error: 'Heartbeat could not be accepted.' }, { status: 500 })
  }

  if (!source || source.is_active !== true) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))

  const payload = {
    hostname: String(body.hostname || '').slice(0, 120) || null,
    uptime_seconds: finiteNumber(body.uptime_seconds),
    memory_used_mb: finiteNumber(body.memory_used_mb),
    memory_total_mb: finiteNumber(body.memory_total_mb),
    storage_used_gb: finiteNumber(body.storage_used_gb),
    storage_total_gb: finiteNumber(body.storage_total_gb),
    storage_free_gb: finiteNumber(body.storage_free_gb),
    cpu_percent: finiteNumber(body.cpu_percent),
    temperature_c: finiteNumber(body.temperature_c),
    web_server_active: typeof body.web_server_active === 'boolean' ? body.web_server_active : null,
    dashboard_api_active: typeof body.dashboard_api_active === 'boolean' ? body.dashboard_api_active : null,
    agent_version: String(body.agent_version || '').slice(0, 40) || null,
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabaseServer
    .from('InfrastructureHeartbeatSources')
    .update({
      last_heartbeat_at: now,
      last_payload: payload,
    })
    .eq('id', source.id)

  if (updateError) {
    console.error('INFRASTRUCTURE HEARTBEAT UPDATE ERROR:', updateError)
    return Response.json({ error: 'Heartbeat could not be saved.' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    source: source.source_key,
    receivedAt: now,
  })
}
