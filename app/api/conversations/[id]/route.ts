import { supabaseServer } from '../../../lib/supabase-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: technician, error: technicianError } =
      await supabaseServer
        .from('Technicians')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

    if (technicianError || !technician) {
      return Response.json(
        { error: 'Technician not found' },
        { status: 404 }
      )
    }

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

    const { data, error } = await supabaseServer
      .from('Messages')
      .select('id, role, content, image_url, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('CONVERSATION MESSAGES LOAD ERROR:', error)
      throw error
    }

    const messages = (data || []).map((message) => ({
      role: message.role,
      text: message.content,
      image: message.image_url || undefined,
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
