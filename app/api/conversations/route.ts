import { supabaseServer } from '../../lib/supabase-server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const technicianId = searchParams.get('technicianId')

    if (!technicianId) {
      return Response.json({ conversations: [] })
    }

    const { data, error } = await supabaseServer
      .from('Conversations')
      .select('id, title, created_at, updated_at, status')
      .eq('technician_id', technicianId)
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
