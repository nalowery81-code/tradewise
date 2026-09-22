import { supabaseServer } from '../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../lib/technician-access'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabaseServer.auth.getUser(token)
  if (userError || !user) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const conversationType = String(body?.conversationType || '')
  const conversationId = String(body?.conversationId || '')
  const messageId = String(body?.messageId || '')
  const comment = String(body?.comment || '').trim()

  if (!['technician', 'management'].includes(conversationType) || !conversationId || !messageId || !comment) {
    return jsonNoStore({ error: 'Tell us what is wrong with this answer.' }, { status: 400 })
  }

  let reporterRole: 'technician' | 'manager' | 'owner'
  let reporterAuthUserId = user.id

  if (conversationType === 'technician') {
    const access = await requireEffectiveTechnician(request)
    if ('error' in access) return access.error
    const technician = access.technician
    reporterAuthUserId = access.authUserId

    const { data: conversation } = await supabaseServer.from('Conversations').select('id').eq('id', conversationId).eq('technician_id', technician.id).maybeSingle()
    if (!conversation) return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })

    const { data: message } = await supabaseServer.from('Messages').select('id').eq('id', messageId).eq('conversation_id', conversationId).eq('role', 'assistant').maybeSingle()
    if (!message) return jsonNoStore({ error: 'CraftCompass response not found.' }, { status: 404 })
    reporterRole = 'technician'
  } else {
    const { data: profile } = await supabaseServer.from('UserProfiles').select('id, role').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle()
    if (!profile || !['manager', 'owner'].includes(profile.role || '')) return jsonNoStore({ error: 'Management access required.' }, { status: 403 })

    const { data: conversation } = await supabaseServer.from('ManagementConversations').select('id').eq('id', conversationId).eq('profile_id', profile.id).maybeSingle()
    if (!conversation) return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })

    const { data: message } = await supabaseServer.from('ManagementMessages').select('id').eq('id', messageId).eq('conversation_id', conversationId).eq('role', 'assistant').maybeSingle()
    if (!message) return jsonNoStore({ error: 'CraftCompass response not found.' }, { status: 404 })
    reporterRole = profile.role as 'manager' | 'owner'
  }

  const { data, error } = await supabaseServer.from('ConversationAuditFlags').insert({
    conversation_type: conversationType,
    conversation_id: conversationId,
    message_id: messageId,
    reporter_auth_user_id: reporterAuthUserId,
    reporter_role: reporterRole,
    comment,
    status: 'pending',
  }).select('id, status, created_at').single()

  if (error) {
    if (error.code === '23505') return jsonNoStore({ error: 'You already flagged this answer for Admin review.' }, { status: 409 })
    console.error('CONVERSATION AUDIT FLAG ERROR:', error)
    return jsonNoStore({ error: 'Could not flag this answer.' }, { status: 500 })
  }
  return jsonNoStore({ flag: data })
}
