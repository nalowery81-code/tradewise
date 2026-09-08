import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [
    { data: profiles, error },
    { data: companies },
    { data: technicians },
    authResult,
  ] = await Promise.all([
    supabaseServer.from('UserProfiles').select('id, auth_user_id, company_id, role, is_active, is_platform_admin, created_at'),
    supabaseServer.from('Companies').select('id, name'),
    supabaseServer.from('Technicians').select('auth_user_id, canonical_name').not('auth_user_id', 'is', null),
    supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (error || authResult.error) return jsonNoStore({ error: 'Could not load users.' }, { status: 500 })

  const authById = new Map(authResult.data.users.map((user) => [user.id, user]))
  const companyById = new Map((companies || []).map((company) => [company.id, company.name]))
  const technicianNameByAuthId = new Map(
    (technicians || [])
      .filter((technician) => technician.auth_user_id)
      .map((technician) => [technician.auth_user_id as string, technician.canonical_name])
  )

  const users = (profiles || []).map((profile) => {
    const authUser = authById.get(profile.auth_user_id)
    const metadataName =
      typeof authUser?.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim()
        : typeof authUser?.user_metadata?.name === 'string'
          ? authUser.user_metadata.name.trim()
          : ''
    const technicianName = technicianNameByAuthId.get(profile.auth_user_id) || ''

    return {
      id: profile.id,
      authUserId: profile.auth_user_id,
      name: metadataName || technicianName,
      email: authUser?.email || 'Unknown email',
      companyId: profile.company_id,
      companyName: companyById.get(profile.company_id) || 'Unknown company',
      role: profile.role,
      isActive: profile.is_active !== false,
      isPlatformAdmin: profile.is_platform_admin === true,
      createdAt: profile.created_at,
      hasPassword: Boolean(authUser?.user_metadata?.password_set),
    }
  })

  return jsonNoStore({ users })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '')
  const isProfileEdit = ['name', 'email', 'companyId', 'role'].some((key) => body?.[key] !== undefined)

  if (!profileId) {
    return jsonNoStore({ error: 'User is required.' }, { status: 400 })
  }

  const { data: target, error: targetError } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, company_id, role, is_active, is_platform_admin')
    .eq('id', profileId)
    .single()

  if (targetError || !target) return jsonNoStore({ error: 'User not found.' }, { status: 404 })

  // Keep the existing lightweight active/inactive toggle behavior.
  if (!isProfileEdit) {
    const isActive = body?.isActive
    if (typeof isActive !== 'boolean') {
      return jsonNoStore({ error: 'Invalid user update.' }, { status: 400 })
    }

    if (target.is_platform_admin && !isActive) {
      return jsonNoStore({ error: 'Platform administrator cannot be deactivated here.' }, { status: 400 })
    }

    const { error } = await supabaseServer.from('UserProfiles').update({ is_active: isActive }).eq('id', profileId)
    if (error) return jsonNoStore({ error: 'Could not update user.' }, { status: 500 })

    return jsonNoStore({ updated: true })
  }

  if (target.is_platform_admin) {
    return jsonNoStore({ error: 'Edit the platform administrator account separately.' }, { status: 400 })
  }

  const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const companyId = String(body?.companyId || '').trim()
  const role = String(body?.role || '').trim().toLowerCase()
  const isActive = body?.isActive !== false

  if (!name || name.length < 2 || name.length > 120) {
    return jsonNoStore({ error: 'Name must be between 2 and 120 characters.' }, { status: 400 })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonNoStore({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!companyId) {
    return jsonNoStore({ error: 'Choose a company.' }, { status: 400 })
  }
  if (!['owner', 'manager', 'technician'].includes(role)) {
    return jsonNoStore({ error: 'Choose owner, manager, or technician.' }, { status: 400 })
  }

  const [{ data: company, error: companyError }, authUserResult] = await Promise.all([
    supabaseServer.from('Companies').select('id, name, status').eq('id', companyId).single(),
    supabaseServer.auth.admin.getUserById(target.auth_user_id),
  ])

  if (companyError || !company) return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  if (company.status === 'disabled') {
    return jsonNoStore({ error: 'You cannot move a user into a disabled company.' }, { status: 400 })
  }

  const authUser = authUserResult.data?.user
  if (authUserResult.error || !authUser) {
    return jsonNoStore({ error: 'Could not load the authentication account.' }, { status: 500 })
  }

  const oldCompanyId = target.company_id
  const oldRole = target.role
  const companyChanged = oldCompanyId !== companyId
  const roleChanged = oldRole !== role

  const { data: linkedTechnician, error: linkedTechnicianError } = await supabaseServer
    .from('Technicians')
    .select('id, company_id, canonical_name, auth_user_id')
    .eq('auth_user_id', target.auth_user_id)
    .maybeSingle()

  if (linkedTechnicianError) {
    return jsonNoStore({ error: 'Could not load the technician record.' }, { status: 500 })
  }

  try {
    // If a manager changes company or role, old manager-to-technician assignments
    // should not travel with that person into the new context.
    if (oldRole === 'manager' && (companyChanged || roleChanged)) {
      const { error: assignmentError } = await supabaseServer
        .from('ManagerTechnicians')
        .delete()
        .eq('manager_profile_id', profileId)
      if (assignmentError) throw assignmentError
    }

    // Preserve historical technician data when someone leaves the technician role
    // or moves to another company. The old technician record stays with its company,
    // but is detached from the login.
    if (linkedTechnician && (role !== 'technician' || companyChanged)) {
      const { error: detachError } = await supabaseServer
        .from('Technicians')
        .update({ auth_user_id: null })
        .eq('id', linkedTechnician.id)
        .eq('auth_user_id', target.auth_user_id)
      if (detachError) throw detachError
    }

    // A technician who remains in the same company keeps the existing technician
    // identity and history; only the displayed name changes.
    if (role === 'technician' && linkedTechnician && !companyChanged) {
      const { error: techUpdateError } = await supabaseServer
        .from('Technicians')
        .update({ canonical_name: name })
        .eq('id', linkedTechnician.id)
      if (techUpdateError) throw techUpdateError
    }

    // New technician role, or a technician moving companies: connect to an existing
    // unclaimed technician record with the same name when possible, otherwise create one.
    if (role === 'technician' && (!linkedTechnician || companyChanged)) {
      const { data: existingDestination, error: destinationError } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name')
        .eq('company_id', companyId)
        .is('auth_user_id', null)
        .ilike('canonical_name', name)
        .limit(1)
        .maybeSingle()

      if (destinationError) throw destinationError

      if (existingDestination) {
        const { error: connectError } = await supabaseServer
          .from('Technicians')
          .update({ canonical_name: name, auth_user_id: target.auth_user_id })
          .eq('id', existingDestination.id)
        if (connectError) throw connectError
      } else {
        const { error: createTechnicianError } = await supabaseServer
          .from('Technicians')
          .insert({ canonical_name: name, auth_user_id: target.auth_user_id, company_id: companyId })
        if (createTechnicianError) throw createTechnicianError
      }
    }

    const { error: profileError } = await supabaseServer
      .from('UserProfiles')
      .update({ company_id: companyId, role, is_active: isActive })
      .eq('id', profileId)
    if (profileError) throw profileError

    const { error: authError } = await supabaseServer.auth.admin.updateUserById(target.auth_user_id, {
      email,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        full_name: name,
        company_id: companyId,
        role,
      },
    })
    if (authError) throw authError

    return jsonNoStore({
      updated: true,
      user: {
        id: profileId,
        name,
        email,
        companyId,
        companyName: company.name,
        role,
        isActive,
        isPlatformAdmin: false,
      },
    })
  } catch (error: any) {
    console.error('PLATFORM USER PROFILE UPDATE ERROR:', error)
    return jsonNoStore({ error: error?.message || 'Could not update user profile.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '')

  const { data: target, error: targetError } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, is_platform_admin')
    .eq('id', profileId)
    .single()

  if (targetError || !target) return jsonNoStore({ error: 'User not found.' }, { status: 404 })
  if (target.is_platform_admin) {
    return jsonNoStore({ error: 'Platform administrator cannot be removed here.' }, { status: 400 })
  }

  const { error: profileError } = await supabaseServer.from('UserProfiles').delete().eq('id', profileId)
  if (profileError) return jsonNoStore({ error: 'Could not remove user profile.' }, { status: 500 })

  const { error: authError } = await supabaseServer.auth.admin.deleteUser(target.auth_user_id)
  if (authError) {
    console.error('PLATFORM USER AUTH DELETE ERROR:', authError)
    return jsonNoStore({ error: 'Profile removed, but authentication cleanup failed.' }, { status: 500 })
  }

  return jsonNoStore({ deleted: true })
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '')

  const { data: target, error: targetError } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, is_active')
    .eq('id', profileId)
    .single()

  if (targetError || !target || target.is_active === false) {
    return jsonNoStore({ error: 'Active user not found.' }, { status: 404 })
  }

  const { data: authUserResult, error: userError } =
    await supabaseServer.auth.admin.getUserById(target.auth_user_id)

  const email = authUserResult?.user?.email
  if (userError || !email) {
    return jsonNoStore({ error: 'Could not load the user email.' }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const { error: inviteError } = await supabaseServer.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/setup-account`,
  })

  if (inviteError) {
    console.error('PLATFORM RESEND SETUP ERROR:', inviteError)
    return jsonNoStore({ error: inviteError.message || 'Could not send setup email.' }, { status: 400 })
  }

  return jsonNoStore({ sent: true, email })
}
