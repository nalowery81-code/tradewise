import { supabaseServer } from '../../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../../lib/management-auth'

const longBanDuration = '876000h'

async function countRows(table: string, column: string, value: string) {
  const { count, error } = await supabaseServer
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)

  if (error) throw error
  return count || 0
}

async function restoreAuthBan(authUserId: string, shouldBeBanned: boolean) {
  await supabaseServer.auth.admin.updateUserById(authUserId, {
    ban_duration: shouldBeBanned ? longBanDuration : '0s',
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const { profileId } = await params
    const body = await request.json().catch(() => ({}))

    if (body?.confirmation !== 'DELETE') {
      return Response.json({ error: 'Type DELETE to confirm permanent deletion.' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .select('id, created_at, auth_user_id, role, company_id, is_active, deactivated_at, technician_id')
      .eq('id', profileId)
      .eq('company_id', auth.profile.company_id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return Response.json({ error: 'Employee not found.' }, { status: 404 })
    if (profile.role === 'owner') {
      return Response.json({ error: 'Owner accounts cannot be permanently deleted here.' }, { status: 400 })
    }
    if (!profile.auth_user_id) {
      return Response.json({ error: 'This employee does not have a Tradewise login account.' }, { status: 400 })
    }

    let technician: any = null

    if (profile.technician_id) {
      const { data, error } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name, created_at, auth_user_id, company_id')
        .eq('id', profile.technician_id)
        .eq('company_id', profile.company_id)
        .maybeSingle()
      if (error) throw error
      technician = data || null
    } else {
      const { data, error } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name, created_at, auth_user_id, company_id')
        .eq('auth_user_id', profile.auth_user_id)
        .eq('company_id', profile.company_id)
        .maybeSingle()
      if (error) throw error
      technician = data || null
    }

    const managerAssignments = await countRows('ManagerTechnicians', 'manager_profile_id', profile.id)
    const history: Record<string, number> = { managerAssignments }

    if (technician?.id) {
      const [
        conversations,
        reflections,
        managerNotes,
        followUps,
        aliases,
        technicianAssignments,
        aiInsights,
      ] = await Promise.all([
        countRows('Conversations', 'technician_id', technician.id),
        countRows('Reflections', 'technician_id', technician.id),
        countRows('ManagerNotes', 'technician_id', technician.id),
        countRows('ManagerFollowUps', 'technician_id', technician.id),
        countRows('TechnicianAliases', 'technician_id', technician.id),
        countRows('ManagerTechnicians', 'technician_id', technician.id),
        countRows('ai_insights', 'technician_id', technician.id),
      ])

      Object.assign(history, {
        conversations,
        reflections,
        managerNotes,
        followUps,
        aliases,
        technicianAssignments,
        aiInsights,
      })
    }

    const meaningfulHistory = Object.values(history).reduce((sum, count) => sum + count, 0)

    if (meaningfulHistory > 0) {
      return Response.json(
        {
          error: 'Permanent delete is blocked because this employee has company history. Deactivate the account instead.',
          history,
        },
        { status: 409 }
      )
    }

    const { data: authData, error: authUserError } = await supabaseServer.auth.admin.getUserById(profile.auth_user_id)
    if (authUserError || !authData.user) throw authUserError || new Error('Could not load employee login.')

    const previouslyBannedUntil = authData.user.banned_until ? new Date(authData.user.banned_until).getTime() : 0
    const wasBanned = profile.is_active === false || previouslyBannedUntil > Date.now()

    const { error: banError } = await supabaseServer.auth.admin.updateUserById(profile.auth_user_id, {
      ban_duration: longBanDuration,
    })
    if (banError) throw banError

    const restoreProfile = async () => {
      if (technician) {
        await supabaseServer.from('Technicians').upsert({
          id: technician.id,
          canonical_name: technician.canonical_name,
          created_at: technician.created_at,
          auth_user_id: technician.auth_user_id,
          company_id: technician.company_id,
        })
      }

      await supabaseServer.from('UserProfiles').upsert({
        id: profile.id,
        created_at: profile.created_at,
        auth_user_id: profile.auth_user_id,
        role: profile.role,
        company_id: profile.company_id,
        is_active: profile.is_active,
        deactivated_at: profile.deactivated_at,
        technician_id: profile.technician_id,
      })

      await restoreAuthBan(profile.auth_user_id, wasBanned)
    }

    const { error: profileDeleteError } = await supabaseServer
      .from('UserProfiles')
      .delete()
      .eq('id', profile.id)
      .eq('company_id', profile.company_id)

    if (profileDeleteError) {
      await restoreAuthBan(profile.auth_user_id, wasBanned)
      throw profileDeleteError
    }

    if (technician?.id) {
      const { error: technicianDeleteError } = await supabaseServer
        .from('Technicians')
        .delete()
        .eq('id', technician.id)
        .eq('company_id', profile.company_id)

      if (technicianDeleteError) {
        await restoreProfile()
        throw technicianDeleteError
      }
    }

    const { error: authDeleteError } = await supabaseServer.auth.admin.deleteUser(profile.auth_user_id)

    if (authDeleteError) {
      await restoreProfile()
      throw authDeleteError
    }

    return Response.json({ deleted: true, profileId: profile.id })
  } catch (error: any) {
    console.error('OWNER EMPLOYEE PERMANENT DELETE ERROR:', error)
    return Response.json(
      { error: error?.message || 'Could not permanently delete employee.' },
      { status: typeof error?.status === 'number' ? error.status : 500 }
    )
  }
}
