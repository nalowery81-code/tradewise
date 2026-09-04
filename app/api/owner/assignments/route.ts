import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'

export async function GET(request: Request) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id

    const [{ data: managerProfiles, error: managerError }, { data: technicians, error: technicianError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabaseServer.from('UserProfiles').select('id, auth_user_id, role, is_active').eq('company_id', companyId).eq('role', 'manager').eq('is_active', true).order('created_at', { ascending: true }),
      supabaseServer.from('Technicians').select('id, canonical_name').eq('company_id', companyId).order('canonical_name', { ascending: true }),
      supabaseServer.from('ManagerTechnicians').select('manager_profile_id, technician_id').eq('company_id', companyId),
    ])

    if (managerError || technicianError || assignmentError) {
      console.error('OWNER ASSIGNMENTS LOAD ERROR:', managerError || technicianError || assignmentError)
      return Response.json({ error: 'Could not load manager assignments.' }, { status: 500 })
    }

    const { data: authUsers, error: authUsersError } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (authUsersError) return Response.json({ error: 'Could not load managers.' }, { status: 500 })

    const authUserMap = new Map(authUsers.users.map((user) => [user.id, user]))
    const managers = (managerProfiles || []).map((profile) => {
      const user = profile.auth_user_id ? authUserMap.get(profile.auth_user_id) : null
      const email = user?.email || ''
      const name = String(user?.user_metadata?.full_name || '').trim() || (email ? email.split('@')[0] : 'Manager')
      return { id: profile.id, name, email }
    })

    return Response.json({ managers, technicians: (technicians || []).map((technician) => ({ id: technician.id, name: technician.canonical_name })), assignments: assignments || [] })
  } catch (error: any) {
    console.error('OWNER ASSIGNMENTS API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not load manager assignments.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const body = await request.json()
    const managerProfileId = typeof body?.managerProfileId === 'string' ? body.managerProfileId : ''
    const technicianIds = Array.isArray(body?.technicianIds)
      ? [...new Set(body.technicianIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))]
      : []

    if (!managerProfileId) return Response.json({ error: 'Manager is required.' }, { status: 400 })

    const { data: managerProfile } = await supabaseServer.from('UserProfiles').select('id, role, company_id, is_active').eq('id', managerProfileId).eq('company_id', companyId).single()
    if (!managerProfile || managerProfile.role !== 'manager' || managerProfile.is_active === false) return Response.json({ error: 'Manager not found.' }, { status: 404 })

    if (technicianIds.length) {
      const { data: validTechnicians, error: techniciansError } = await supabaseServer.from('Technicians').select('id').eq('company_id', companyId).in('id', technicianIds)
      if (techniciansError || (validTechnicians || []).length !== technicianIds.length) return Response.json({ error: 'One or more technicians are invalid for this company.' }, { status: 400 })
    }

    const { error: deleteError } = await supabaseServer.from('ManagerTechnicians').delete().eq('company_id', companyId).eq('manager_profile_id', managerProfileId)
    if (deleteError) return Response.json({ error: 'Could not update assignments.' }, { status: 500 })

    if (technicianIds.length) {
      const { error: insertError } = await supabaseServer.from('ManagerTechnicians').insert(technicianIds.map((technicianId) => ({ company_id: companyId, manager_profile_id: managerProfileId, technician_id: technicianId })))
      if (insertError) return Response.json({ error: 'Could not update assignments.' }, { status: 500 })
    }

    return Response.json({ managerProfileId, technicianIds })
  } catch (error: any) {
    console.error('OWNER ASSIGNMENTS UPDATE API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not update manager assignments.' }, { status: 500 })
  }
}
