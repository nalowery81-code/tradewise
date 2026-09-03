import { supabaseServer } from '../../../lib/supabase-server'

export async function GET(request: Request) {
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

    const { data: technicians, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .order('canonical_name', { ascending: true })

    if (technicianError) {
      console.error('MANAGER TECHNICIAN LOAD ERROR:', technicianError)
      return Response.json({ error: 'Could not load technicians.' }, { status: 500 })
    }

    const { data: reflections, error: reflectionError } = await supabaseServer
      .from('Reflections')
      .select('technician_id, technician_name, created_at')
      .order('created_at', { ascending: false })

    if (reflectionError) {
      console.error('MANAGER TECHNICIAN REFLECTION LOAD ERROR:', reflectionError)
      return Response.json({ error: 'Could not load technician activity.' }, { status: 500 })
    }

    const activity = new Map<string, { count: number; latest: string | null }>()

    for (const reflection of reflections || []) {
      const key = reflection.technician_id || reflection.technician_name
      if (!key) continue

      const current = activity.get(key) || { count: 0, latest: null }
      current.count += 1
      if (!current.latest) current.latest = reflection.created_at || null
      activity.set(key, current)
    }

    const directory = (technicians || []).map((technician) => {
      const byId = activity.get(technician.id)
      const byName = activity.get(technician.canonical_name)
      const summary = byId || byName || { count: 0, latest: null }

      return {
        id: technician.id,
        name: technician.canonical_name,
        reflectionCount: summary.count,
        latestReflectionAt: summary.latest,
      }
    })

    return Response.json({ technicians: directory })
  } catch (error: any) {
    console.error('MANAGER TECHNICIAN DIRECTORY API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not load technicians.' },
      { status: 500 }
    )
  }
}
