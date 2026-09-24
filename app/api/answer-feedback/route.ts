import { supabaseServer } from '../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../lib/technician-access'
import { requireManagementAccess } from '../../lib/management-auth'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const conversationType = body?.conversationType === 'management' ? 'management' : 'technician'
  const conversationId = String(body?.conversationId || '')
  const messageId = String(body?.messageId || '')

  if (!conversationId || !messageId) {
    return jsonNoStore({ error: 'Conversation response is required.' }, { status: 400 })
  }

  let authUserId = ''

  if (conversationType === 'management') {
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
    authUserId = access.userId
  } else {
    const access = await requireEffectiveTechnician(request)
    if ('error' in access) return access.error

    const { data: conversation } = await supabaseServer
      .from('Conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('technician_id', access.technician.id)
      .maybeSingle()

    if (!conversation) return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })

    const { data: message } = await supabaseServer
      .from('Messages')
      .select('id')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .maybeSingle()

    if (!message) return jsonNoStore({ error: 'CraftCompass response not found.' }, { status: 404 })
    authUserId = access.authUserId
  }

  const { data, error } = await supabaseServer
    .from('ConversationUserFeedback')
    .upsert({
      conversation_type: conversationType,
      conversation_id: conversationId,
      message_id: messageId,
      auth_user_id: authUserId,
      rating: 'helpful',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_type,message_id,auth_user_id' })
    .select('id, message_id, rating, created_at, updated_at')
    .single()

  if (error) {
    console.error('ANSWER FEEDBACK SAVE ERROR:', error)
    return jsonNoStore({ error: 'Could not save feedback.' }, { status: 500 })
  }

  return jsonNoStore({ feedback: data })
}
