import { supabaseServer } from '../../lib/supabase-server'

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('Conversations')
      .select('id, title, created_at, updated_at, status')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('CONVERSATIONS LOAD ERROR:', error)
      throw error
    }

    return Response.json({ conversations: data })
  } catch (error) {
    console.error('CONVERSATIONS API ERROR:', error)

    return Response.json(
      { error: 'Could not load conversations.' },
      { status: 500 }
    )
  }
}
