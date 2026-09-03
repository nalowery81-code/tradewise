import { supabaseServer } from '../../../../../lib/supabase-server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || profile?.role !== 'manager') {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const note = typeof body?.note === 'string' ? body.note.trim() : ''

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('id', id)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    const updatedAt = new Date().toISOString()

    const { error: noteError } = await supabaseServer
      .from('ManagerNotes')
      .upsert(
        [
          {
            technician_name: technician.canonical_name,
            note,
            updated_at: updatedAt,
          },
        ],
        { onConflict: 'technician_name' }
      )

    if (noteError) {
      console.error('MANAGER NOTE SAVE ERROR:', noteError)
      return Response.json({ error: 'Could not save manager note.' }, { status: 500 })
    }

    return Response.json({
      managerNote: {
        note,
        updated_at: updatedAt,
      },
    })
  } catch (error: any) {
    console.error('MANAGER NOTE API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not save manager note.' },
      { status: 500 }
    )
  }
}
