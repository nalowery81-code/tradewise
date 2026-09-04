import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'
import { getManagerTechnicianScope, technicianIsInScope } from '../../../lib/manager-technician-scope'

export async function GET(request: Request) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const scope = await getManagerTechnicianScope(auth.profile)
    if ('error' in scope) return scope.error

    let query = supabaseServer
      .from('ManagerFollowUps')
      .select('id, technician_id, technician_name, note, status, created_at, completed_at, updated_at')
      .eq('company_id', auth.profile.company_id)
      .order('created_at', { ascending: false })

    if (scope.technicianIds !== null) {
      if (scope.technicianIds.length === 0) return Response.json({ followUps: [] })
      query = query.in('technician_id', scope.technicianIds)
    }

    const { data, error } = await query

    if (error) {
      console.error('MANAGER FOLLOW-UP LOAD ERROR:', error)
      return Response.json({ error: 'Could not load follow-ups.' }, { status: 500 })
    }

    return Response.json({ followUps: data || [] })
  } catch (error: any) {
    console.error('MANAGER FOLLOW-UP API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not load follow-ups.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const body = await request.json()
    const technicianId = typeof body?.technicianId === 'string' ? body.technicianId.trim() : ''
    const note = typeof body?.note === 'string' ? body.note.trim() : ''

    if (!technicianId || !note) {
      return Response.json({ error: 'Technician and follow-up note are required.' }, { status: 400 })
    }

    const scope = await getManagerTechnicianScope(auth.profile)
    if ('error' in scope) return scope.error

    if (!technicianIsInScope(scope.technicianIds, technicianId)) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('company_id', companyId)
      .eq('id', technicianId)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    const { data, error } = await supabaseServer
      .from('ManagerFollowUps')
      .insert([
        {
          company_id: companyId,
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
    return Response.json({ error: error?.message || 'Could not create follow-up.' }, { status: 500 })
  }
}
