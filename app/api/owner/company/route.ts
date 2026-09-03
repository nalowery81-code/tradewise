import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'

export async function GET(request: Request) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id

    const [{ data: company, error: companyError }, { data: profiles, error: profilesError }, { data: technicians, error: techniciansError }] = await Promise.all([
      supabaseServer
        .from('Companies')
        .select('id, name, created_at, updated_at')
        .eq('id', companyId)
        .single(),
      supabaseServer
        .from('UserProfiles')
        .select('id, auth_user_id, role, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),
      supabaseServer
        .from('Technicians')
        .select('id, canonical_name, auth_user_id')
        .eq('company_id', companyId)
        .order('canonical_name', { ascending: true }),
    ])

    if (companyError || !company) {
      console.error('OWNER COMPANY LOAD ERROR:', companyError)
      return Response.json({ error: 'Could not load company.' }, { status: 500 })
    }

    if (profilesError || techniciansError) {
      console.error('OWNER COMPANY MEMBERS LOAD ERROR:', profilesError || techniciansError)
      return Response.json({ error: 'Could not load company members.' }, { status: 500 })
    }

    const { data: authUsers, error: authUsersError } = await supabaseServer.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })

    if (authUsersError) {
      console.error('OWNER AUTH USERS LOAD ERROR:', authUsersError)
      return Response.json({ error: 'Could not load company members.' }, { status: 500 })
    }

    const authUserMap = new Map(authUsers.users.map((user) => [user.id, user]))
    const technicianByAuthId = new Map(
      (technicians || [])
        .filter((technician) => technician.auth_user_id)
        .map((technician) => [technician.auth_user_id as string, technician])
    )

    const members = (profiles || []).map((profile) => {
      const user = profile.auth_user_id ? authUserMap.get(profile.auth_user_id) : null
      const technician = profile.auth_user_id ? technicianByAuthId.get(profile.auth_user_id) : null
      const email = user?.email || ''
      const metadataName = String(user?.user_metadata?.full_name || '').trim()
      const fallbackName = email ? email.split('@')[0] : 'Tradewise user'

      return {
        profileId: profile.id,
        authUserId: profile.auth_user_id,
        role: profile.role,
        name: technician?.canonical_name || metadataName || fallbackName,
        email,
        technicianId: technician?.id || null,
        createdAt: profile.created_at,
      }
    })

    return Response.json({
      company,
      members,
      counts: {
        owners: members.filter((member) => member.role === 'owner').length,
        managers: members.filter((member) => member.role === 'manager').length,
        technicians: members.filter((member) => member.role === 'technician').length,
      },
    })
  } catch (error: any) {
    console.error('OWNER COMPANY API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not load company.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''

    if (!name || name.length < 2) {
      return Response.json({ error: 'Company name is required.' }, { status: 400 })
    }

    const updatedAt = new Date().toISOString()
    const { data, error } = await supabaseServer
      .from('Companies')
      .update({ name, updated_at: updatedAt })
      .eq('id', auth.profile.company_id)
      .select('id, name, created_at, updated_at')
      .single()

    if (error || !data) {
      console.error('OWNER COMPANY UPDATE ERROR:', error)
      return Response.json({ error: 'Could not update company.' }, { status: 500 })
    }

    return Response.json({ company: data })
  } catch (error: any) {
    console.error('OWNER COMPANY UPDATE API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not update company.' }, { status: 500 })
  }
}
