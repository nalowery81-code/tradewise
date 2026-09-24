import { requirePlatformAdmin } from '../../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

const getSetupRedirectUrl = (request: Request) => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const baseUrl = configured || new URL(request.url).origin
  return `${baseUrl.replace(/\/+$/, '')}/setup-account`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const { id: companyId } = await params
  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '').trim()
  const action = String(body?.action || '').trim()

  if (!profileId || !['resend', 'delete'].includes(action)) {
    return jsonNoStore({ error: 'A valid pending invite action is required.' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, company_id, role, is_active, is_platform_admin')
    .eq('id', profileId)
    .eq('company_id', companyId)
    .single()

  if (profileError || !profile) {
    return jsonNoStore({ error: 'Pending invite not found for this company.' }, { status: 404 })
  }

  if (profile.is_platform_admin || profile.is_active === false || !profile.auth_user_id) {
    return jsonNoStore({ error: 'This account is not an active pending invite.' }, { status: 409 })
  }

  const { data: authResult, error: authError } =
    await supabaseServer.auth.admin.getUserById(profile.auth_user_id)

  const authUser = authResult?.user
  if (authError || !authUser) {
    return jsonNoStore({ error: 'Could not load the pending authentication account.' }, { status: 500 })
  }

  if (authUser.last_sign_in_at) {
    return jsonNoStore({ error: 'This user has already signed in and is no longer a pending invite.' }, { status: 409 })
  }

  const email = authUser.email || ''
  const name =
    typeof authUser.user_metadata?.full_name === 'string'
      ? authUser.user_metadata.full_name.trim()
      : email.split('@')[0] || 'Pending user'

  if (action === 'resend') {
    if (!email) return jsonNoStore({ error: 'The pending account does not have an email address.' }, { status: 400 })

    const { error } = await supabaseServer.auth.resetPasswordForEmail(email, {
      redirectTo: getSetupRedirectUrl(request),
    })

    if (error) {
      console.error('PENDING INVITE RESEND ERROR:', error)
      return jsonNoStore({ error: error.message || 'Could not resend invite.' }, { status: 400 })
    }

    const { error: auditError } = await supabaseServer.from('PlatformAdminUserAudit').insert({
      admin_profile_id: access.profileId,
      target_profile_id: profile.id,
      action: 'pending_invite_resend',
      before_state: { companyId, role: profile.role, email },
      after_state: { resent: true },
      note: 'Pending company invite resent from Company Control Center.',
    })
    if (auditError) console.error('PENDING INVITE RESEND AUDIT ERROR:', auditError)

    return jsonNoStore({ resent: true, email })
  }

  if (profile.role === 'manager') {
    const { error: assignmentError } = await supabaseServer
      .from('ManagerTechnicians')
      .delete()
      .eq('manager_profile_id', profile.id)
    if (assignmentError) {
      console.error('PENDING MANAGER ASSIGNMENT CLEANUP ERROR:', assignmentError)
      return jsonNoStore({ error: 'Could not cancel the pending manager invite.' }, { status: 500 })
    }
  }

  if (profile.role === 'technician') {
    const { error: technicianError } = await supabaseServer
      .from('Technicians')
      .update({ auth_user_id: null })
      .eq('company_id', companyId)
      .eq('auth_user_id', profile.auth_user_id)
    if (technicianError) {
      console.error('PENDING TECHNICIAN DETACH ERROR:', technicianError)
      return jsonNoStore({ error: 'Could not preserve the technician roster while cancelling the invite.' }, { status: 500 })
    }
  }

  const { error: profileUpdateError } = await supabaseServer
    .from('UserProfiles')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .eq('company_id', companyId)

  if (profileUpdateError) {
    console.error('PENDING INVITE PROFILE CANCEL ERROR:', profileUpdateError)
    return jsonNoStore({ error: 'Could not cancel the pending invite.' }, { status: 500 })
  }

  const { error: deleteAuthError } =
    await supabaseServer.auth.admin.deleteUser(profile.auth_user_id)

  if (deleteAuthError) {
    console.error('PENDING INVITE AUTH DELETE ERROR:', deleteAuthError)
    return jsonNoStore({
      error: 'The invite was cancelled in CraftCompass, but the unused authentication record could not be deleted.',
      cancelled: true,
    }, { status: 500 })
  }

  const { error: auditError } = await supabaseServer.from('PlatformAdminUserAudit').insert({
    admin_profile_id: access.profileId,
    target_profile_id: profile.id,
    action: 'pending_invite_cancel',
    before_state: { companyId, role: profile.role, email, name, pending: true },
    after_state: { isActive: false, authDeleted: true },
    note: 'Pending company invite cancelled from Company Control Center.',
  })
  if (auditError) console.error('PENDING INVITE CANCEL AUDIT ERROR:', auditError)

  return jsonNoStore({ deleted: true, profileId: profile.id })
}
