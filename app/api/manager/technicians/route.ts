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

    const [{ data: reflections, error: reflectionError }, { data: conversations, error: conversationError }] = await Promise.all([
      supabaseServer
        .from('Reflections')
        .select('technician_id, technician_name, created_at')
        .order('created_at', { ascending: false }),
      supabaseServer
        .from('Conversations')
        .select('technician_id, created_at, updated_at')
        .order('created_at', { ascending: false }),
    ])

    if (reflectionError) {
      console.error('MANAGER TECHNICIAN REFLECTION LOAD ERROR:', reflectionError)
      return Response.json({ error: 'Could not load technician activity.' }, { status: 500 })
    }

    if (conversationError) {
      console.error('MANAGER TECHNICIAN CONVERSATION LOAD ERROR:', conversationError)
      return Response.json({ error: 'Could not load technician activity.' }, { status: 500 })
    }

    const reflectionActivity = new Map<string, { count: number; latest: string | null }>()
    const conversationActivity = new Map<string, { count: number; latest: string | null }>()

    for (const reflection of reflections || []) {
      const key = reflection.technician_id || reflection.technician_name
      if (!key) continue

      const current = reflectionActivity.get(key) || { count: 0, latest: null }
      current.count += 1
      if (!current.latest) current.latest = reflection.created_at || null
      reflectionActivity.set(key, current)
    }

    for (const conversation of conversations || []) {
      if (!conversation.technician_id) continue

      const current = conversationActivity.get(conversation.technician_id) || { count: 0, latest: null }
      current.count += 1
      if (!current.latest) current.latest = conversation.updated_at || conversation.created_at || null
      conversationActivity.set(conversation.technician_id, current)
    }

    const directory = (technicians || []).map((technician) => {
      const reflectionById = reflectionActivity.get(technician.id)
      const reflectionByName = reflectionActivity.get(technician.canonical_name)
      const reflectionSummary = reflectionById || reflectionByName || { count: 0, latest: null }
      const conversationSummary = conversationActivity.get(technician.id) || { count: 0, latest: null }

      return {
        id: technician.id,
        name: technician.canonical_name,
        reflectionCount: reflectionSummary.count,
        latestReflectionAt: reflectionSummary.latest,
        conversationCount: conversationSummary.count,
        latestConversationAt: conversationSummary.latest,
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
