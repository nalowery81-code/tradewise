import { supabaseServer } from '../../../../lib/supabase-server'

export async function GET(
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

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('id', id)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    let { data: reflections, error: reflectionError } = await supabaseServer
      .from('Reflections')
      .select('job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
      .eq('technician_id', technician.id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (reflectionError) {
      console.error('MANAGER TECHNICIAN PROFILE REFLECTION ERROR:', reflectionError)
      return Response.json({ error: 'Could not load technician history.' }, { status: 500 })
    }

    if (!reflections?.length) {
      const fallback = await supabaseServer
        .from('Reflections')
        .select('job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
        .eq('technician_name', technician.canonical_name)
        .order('created_at', { ascending: false })
        .limit(12)

      if (fallback.error) {
        console.error('MANAGER TECHNICIAN PROFILE NAME FALLBACK ERROR:', fallback.error)
      } else {
        reflections = fallback.data || []
      }
    }

    const { data: managerNote, error: noteError } = await supabaseServer
      .from('ManagerNotes')
      .select('note, updated_at')
      .eq('technician_name', technician.canonical_name)
      .maybeSingle()

    if (noteError) {
      console.error('MANAGER TECHNICIAN PROFILE NOTE ERROR:', noteError)
    }

    return Response.json({
      technician: {
        id: technician.id,
        name: technician.canonical_name,
      },
      reflections: reflections || [],
      managerNote: managerNote || null,
    })
  } catch (error: any) {
    console.error('MANAGER TECHNICIAN PROFILE API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not load technician profile.' },
      { status: 500 }
    )
  }
}
