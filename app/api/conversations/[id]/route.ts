import { supabaseServer } from '../../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../../lib/technician-access'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireEffectiveTechnician(request)
    if ('error' in access) return access.error
    const technician = access.technician
    const effectiveAuthUserId = access.authUserId

    const { id } = await params

    const { data: conversation, error: conversationError } =
      await supabaseServer
        .from('Conversations')
        .select('id')
        .eq('id', id)
        .eq('technician_id', technician.id)
        .single()

    if (conversationError || !conversation) {
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const [
      { data, error },
      { data: helpfulRows, error: helpfulError },
    ] = await Promise.all([
      supabaseServer
        .from('Messages')
        .select('id, role, content, image_url, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
      supabaseServer
        .from('ConversationUserFeedback')
        .select('message_id')
        .eq('conversation_type', 'technician')
        .eq('conversation_id', id)
        .eq('auth_user_id', effectiveAuthUserId)
        .eq('rating', 'helpful'),
    ])

    if (error || helpfulError) {
      console.error('CONVERSATION MESSAGES LOAD ERROR:', error || helpfulError)
      throw error || helpfulError
    }

    const helpfulMessageIds = new Set((helpfulRows || []).map((row) => row.message_id))

    const messages = (data || []).map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
      image: message.image_url || undefined,
      helpful: helpfulMessageIds.has(message.id),
    }))

    return Response.json({ messages })
  } catch (error) {
    console.error('CONVERSATION API ERROR:', error)

    return Response.json(
      { error: 'Could not load conversation.' },
      { status: 500 }
    )
  }
}
