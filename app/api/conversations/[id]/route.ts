import { supabaseServer } from '../../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../../lib/technician-access'
import { jurisdictionAllowed, normalizeJurisdiction } from '../../../lib/jurisdiction'

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
        .select('id, jurisdiction')
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

    return Response.json({ messages, jurisdiction: conversation.jurisdiction || null })
  } catch (error) {
    console.error('CONVERSATION API ERROR:', error)

    return Response.json(
      { error: 'Could not load conversation.' },
      { status: 500 }
    )
  }
}


export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireEffectiveTechnician(request)
    if ('error' in access) return access.error

    const body = await request.json().catch(() => ({}))
    const jurisdiction = normalizeJurisdiction(body?.jurisdiction)
    if (!jurisdiction) {
      return Response.json({ error: 'Choose a valid jurisdiction.' }, { status: 400 })
    }

    const { data: company, error: companyError } = await supabaseServer
      .from('Companies')
      .select('jurisdictions')
      .eq('id', access.technician.company_id)
      .single()

    if (companyError || !company) {
      return Response.json({ error: 'Could not load company jurisdictions.' }, { status: 500 })
    }

    const allowed = (Array.isArray(company.jurisdictions) ? company.jurisdictions : [])
      .map(normalizeJurisdiction)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    if (!jurisdictionAllowed(allowed, jurisdiction)) {
      return Response.json({ error: 'That jurisdiction is not enabled for this company.' }, { status: 400 })
    }

    const { id } = await params
    const { data, error } = await supabaseServer
      .from('Conversations')
      .update({ jurisdiction, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('technician_id', access.technician.id)
      .select('id, jurisdiction')
      .single()

    if (error || !data) {
      return Response.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    return Response.json({ conversation: data })
  } catch (error) {
    console.error('CONVERSATION JURISDICTION UPDATE ERROR:', error)
    return Response.json({ error: 'Could not update conversation jurisdiction.' }, { status: 500 })
  }
}
