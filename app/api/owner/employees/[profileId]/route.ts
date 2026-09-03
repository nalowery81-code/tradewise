import { supabaseServer } from '../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../lib/management-auth'

type LifecycleAction = 'promote' | 'demote' | 'deactivate' | 'reactivate'

const longBanDuration = '876000h'

const cleanName = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''

async function loadTargetProfile(profileId: string, companyId: string) {
  return supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, role, company_id, is_active, deactivated_at, technician_id')
    .eq('id', profileId)
    .eq('company_id', companyId)
    .maybeSingle()
}

async function getTechnicianForProfile(profile: any) {
  if (profile.technician_id) {
    const { data, error } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name, auth_user_id, company_id')
      .eq('id', profile.technician_id)
      .eq('company_id', profile.company_id)
      .maybeSingle()

    if (error) throw error
    if (data) return data
  }

  if (!profile.auth_user_id) return null

  const { data, error } = await supabaseServer
    .from('Technicians')
    .select('id, canonical_name, auth_user_id, company_id')
    .eq('auth_user_id', profile.auth_user_id)
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function createTechnicianForProfile(profile: any) {
  if (!profile.auth_user_id) throw new Error('Employee does not have a login account.')

  const { data: authData, error: authError } = await supabaseServer.auth.admin.getUserById(profile.auth_user_id)
  if (authError || !authData.user) throw authError || new Error('Could not load employee login.')

  const user = authData.user
  const metadataName = cleanName(user.user_metadata?.full_name) || cleanName(user.user_metadata?.name)
  const emailLocal = cleanName(user.email?.split('@')[0]?.replace(/[._-]+/g, ' '))
  const canonicalName = metadataName || emailLocal || 'Tradewise Technician'

  const { data: nameConflict, error: conflictError } = await supabaseServer
    .from('Technicians')
    .select('id')
    .eq('company_id', profile.company_id)
    .eq('canonical_name', canonicalName)
    .maybeSingle()

  if (conflictError) throw conflictError
  if (nameConflict) {
    const conflict: any = new Error('A technician record with this name already exists. Link that technician record before changing this employee to Technician.')
    conflict.status = 409
    throw conflict
  }

  const { data: technician, error: technicianError } = await supabaseServer
    .from('Technicians')
    .insert({
      canonical_name: canonicalName,
      company_id: profile.company_id,
      auth_user_id: profile.auth_user_id,
    })
    .select('id, canonical_name, auth_user_id, company_id')
    .single()

  if (technicianError || !technician) throw technicianError || new Error('Could not create technician record.')
  return { technician, created: true }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const { profileId } = await params
    const body = await request.json()
    const action = body?.action as LifecycleAction

    if (!['promote', 'demote', 'deactivate', 'reactivate'].includes(action)) {
      return Response.json({ error: 'Invalid lifecycle action.' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await loadTargetProfile(profileId, auth.profile.company_id)

    if (profileError) {
      console.error('OWNER EMPLOYEE LOAD ERROR:', profileError)
      return Response.json({ error: 'Could not load employee.' }, { status: 500 })
    }

    if (!profile) return Response.json({ error: 'Employee not found.' }, { status: 404 })
    if (profile.role === 'owner') {
      return Response.json({ error: 'Owner accounts cannot be changed from employee lifecycle controls.' }, { status: 400 })
    }
    if (!profile.auth_user_id) {
      return Response.json({ error: 'This employee does not have a Tradewise login account.' }, { status: 400 })
    }

    if (action === 'promote') {
      if (profile.role !== 'technician') {
        return Response.json({ error: 'Only technicians can be promoted to Manager.' }, { status: 400 })
      }

      const technician = await getTechnicianForProfile(profile)
      if (!technician) {
        return Response.json({ error: 'Technician identity not found. Promotion was not changed.' }, { status: 409 })
      }

      const { error: detachError } = await supabaseServer
        .from('Technicians')
        .update({ auth_user_id: null })
        .eq('id', technician.id)
        .eq('company_id', profile.company_id)

      if (detachError) throw detachError

      const { data: updatedProfile, error: roleError } = await supabaseServer
        .from('UserProfiles')
        .update({ role: 'manager', technician_id: technician.id })
        .eq('id', profile.id)
        .eq('company_id', profile.company_id)
        .select('id, role, is_active, deactivated_at, technician_id')
        .single()

      if (roleError || !updatedProfile) {
        await supabaseServer
          .from('Technicians')
          .update({ auth_user_id: profile.auth_user_id })
          .eq('id', technician.id)
          .eq('company_id', profile.company_id)
        throw roleError || new Error('Could not promote employee.')
      }

      return Response.json({ employee: updatedProfile, action })
    }

    if (action === 'demote') {
      if (profile.role !== 'manager') {
        return Response.json({ error: 'Only managers can be changed to Technician.' }, { status: 400 })
      }

      let technician = await getTechnicianForProfile(profile)
      let createdTechnician = false
      let previousTechnicianAuthUserId: string | null = null

      if (!technician) {
        const created = await createTechnicianForProfile(profile)
        technician = created.technician
        createdTechnician = created.created
      } else {
        previousTechnicianAuthUserId = technician.auth_user_id || null

        if (technician.auth_user_id && technician.auth_user_id !== profile.auth_user_id) {
          return Response.json({ error: 'The linked Technician record belongs to another login account.' }, { status: 409 })
        }

        const { error: relinkError } = await supabaseServer
          .from('Technicians')
          .update({ auth_user_id: profile.auth_user_id })
          .eq('id', technician.id)
          .eq('company_id', profile.company_id)

        if (relinkError) throw relinkError
      }

      const { data: updatedProfile, error: roleError } = await supabaseServer
        .from('UserProfiles')
        .update({ role: 'technician', technician_id: technician.id })
        .eq('id', profile.id)
        .eq('company_id', profile.company_id)
        .select('id, role, is_active, deactivated_at, technician_id')
        .single()

      if (roleError || !updatedProfile) {
        if (createdTechnician) {
          await supabaseServer.from('Technicians').delete().eq('id', technician.id)
        } else {
          await supabaseServer
            .from('Technicians')
            .update({ auth_user_id: previousTechnicianAuthUserId })
            .eq('id', technician.id)
            .eq('company_id', profile.company_id)
        }
        throw roleError || new Error('Could not change employee to Technician.')
      }

      return Response.json({ employee: updatedProfile, action })
    }

    if (action === 'deactivate') {
      if (profile.is_active === false) {
        return Response.json({
          employee: {
            id: profile.id,
            role: profile.role,
            is_active: false,
            deactivated_at: profile.deactivated_at,
            technician_id: profile.technician_id,
          },
          action,
        })
      }

      const deactivatedAt = new Date().toISOString()
      const { data: updatedProfile, error: statusError } = await supabaseServer
        .from('UserProfiles')
        .update({ is_active: false, deactivated_at: deactivatedAt })
        .eq('id', profile.id)
        .eq('company_id', profile.company_id)
        .select('id, role, is_active, deactivated_at, technician_id')
        .single()

      if (statusError || !updatedProfile) throw statusError || new Error('Could not deactivate employee.')

      const { error: banError } = await supabaseServer.auth.admin.updateUserById(profile.auth_user_id, {
        ban_duration: longBanDuration,
      })

      if (banError) {
        await supabaseServer
          .from('UserProfiles')
          .update({ is_active: true, deactivated_at: null })
          .eq('id', profile.id)
          .eq('company_id', profile.company_id)
        throw banError
      }

      return Response.json({ employee: updatedProfile, action })
    }

    if (profile.is_active !== false) {
      return Response.json({
        employee: {
          id: profile.id,
          role: profile.role,
          is_active: true,
          deactivated_at: null,
          technician_id: profile.technician_id,
        },
        action,
      })
    }

    const { error: unbanError } = await supabaseServer.auth.admin.updateUserById(profile.auth_user_id, {
      ban_duration: '0s',
    })

    if (unbanError) throw unbanError

    const { data: updatedProfile, error: statusError } = await supabaseServer
      .from('UserProfiles')
      .update({ is_active: true, deactivated_at: null })
      .eq('id', profile.id)
      .eq('company_id', profile.company_id)
      .select('id, role, is_active, deactivated_at, technician_id')
      .single()

    if (statusError || !updatedProfile) {
      await supabaseServer.auth.admin.updateUserById(profile.auth_user_id, {
        ban_duration: longBanDuration,
      })
      throw statusError || new Error('Could not reactivate employee.')
    }

    return Response.json({ employee: updatedProfile, action })
  } catch (error: any) {
    console.error('OWNER EMPLOYEE LIFECYCLE ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not update employee.' },
      { status: typeof error?.status === 'number' ? error.status : 500 }
    )
  }
}
