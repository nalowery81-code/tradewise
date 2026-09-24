import { supabaseServer } from '../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../lib/technician-access'
import { requireManagementAccess } from '../../lib/management-auth'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const conversationType = String(body?.conversationType || '')
  const conversationId = String(body?.conversationId || '')
  const messageId = String(body?.messageId || '')
  const comment = String(body?.comment || '').trim()

  if (!['technician', 'management'].includes(conversationType) || !conversationId || !messageId || !comment) {
    return jsonNoStore({ error: 'Tell us what is wrong with this answer.' }, { status: 400 })
  }

  let reporterRole: 'technician' | 'manager' | 'owner'
  let reporterAuthUserId = ''

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
    const access = await requireManagementAccess(request)
    if ('error' in access) return access.error

    const { data: conversation } = await supabaseServer
      .from('ManagementConversations')
      .select('id')
      .eq('id', conversationId)
      .eq('company_id', access.profile.company_id)
      .eq('profile_id', access.profile.id)
      .maybeSingle()

    if (!conversation) return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })

    const { data: message } = await supabaseServer
      .from('ManagementMessages')
      .select('id')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .maybeSingle()

    if (!message) return jsonNoStore({ error: 'CraftCompass response not found.' }, { status: 404 })

    reporterAuthUserId = access.userId
    reporterRole = access.profile.role
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
