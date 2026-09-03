import { supabaseServer } from '../../../lib/supabase-server'

async function requireManager(request: Request) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: userError,
  } = await supabaseServer.auth.getUser(accessToken)

  if (userError || !user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from('UserProfiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || profile?.role !== 'manager') {
    return { error: Response.json({ error: 'Manager access required' }, { status: 403 }) }
  }

  return { user }
}

export async function GET(request: Request) {
  try {
    const auth = await requireManager(request)
    if ('error' in auth) return auth.error

    const { data, error } = await supabaseServer
      .from('ManagerFollowUps')
      .select('id, technician_id, technician_name, note, status, created_at, completed_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('MANAGER FOLLOW-UP LOAD ERROR:', error)
      return Response.json({ error: 'Could not load follow-ups.' }, { status: 500 })
    }

    return Response.json({ followUps: data || [] })
  } catch (error: any) {
    console.error('MANAGER FOLLOW-UP API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not load follow-ups.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireManager(request)
    if ('error' in auth) return auth.error

    const body = await request.json()
    const technicianId = typeof body?.technicianId === 'string' ? body.technicianId.trim() : ''
    const note = typeof body?.note === 'string' ? body.note.trim() : ''

    if (!technicianId || !note) {
      return Response.json({ error: 'Technician and follow-up note are required.' }, { status: 400 })
    }

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('id', technicianId)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    const { data, error } = await supabaseServer
      .from('ManagerFollowUps')
      .insert([
        {
          technician_id: technician.id,
          technician_name: technician.canonical_name,
          note,
          status: 'open',
        },
      ])
      .select('id, technician_id, technician_name, note, status, created_at, completed_at, updated_at')
      .single()

    if (error) {
      console.error('MANAGER FOLLOW-UP CREATE ERROR:', error)
      return Response.json({ error: 'Could not create follow-up.' }, { status: 500 })
    }

    return Response.json({ followUp: data }, { status: 201 })
  } catch (error: any) {
    console.error('MANAGER FOLLOW-UP CREATE API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not create follow-up.' },
      { status: 500 }
    )
  }
}
