import { supabaseServer } from '../../lib/supabase-server'

export async function GET(request: Request) {
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

    const { data, error } = await supabaseServer
      .from('Conversations')
      .select('id, title, created_at, updated_at, status')
      .eq('technician_id', technician.id)
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
