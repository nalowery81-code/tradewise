import { supabaseServer } from '../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../lib/technician-access'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function POST(request: Request) {
  const access = await requireEffectiveTechnician(request)
  if ('error' in access) return access.error
  const technician = access.technician
  const effectiveAuthUserId = access.authUserId

  const body = await request.json().catch(() => ({}))
  const conversationId = String(body?.conversationId || '')
  const messageId = String(body?.messageId || '')
  if (!conversationId || !messageId) return jsonNoStore({ error: 'Conversation response is required.' }, { status: 400 })

  const { data: conversation } = await supabaseServer
    .from('Conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('technician_id', technician.id)
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

  const { data, error } = await supabaseServer
    .from('ConversationUserFeedback')
    .upsert({
      conversation_type: 'technician',
      conversation_id: conversationId,
      message_id: messageId,
      auth_user_id: effectiveAuthUserId,
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
