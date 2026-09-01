import { supabaseServer } from '../../../lib/supabase-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
