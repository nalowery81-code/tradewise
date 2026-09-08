import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [{ data: profiles, error }, { data: companies }, authResult] = await Promise.all([
    supabaseServer.from('UserProfiles').select('id, auth_user_id, company_id, role, is_active, is_platform_admin, created_at'),
    supabaseServer.from('Companies').select('id, name'),
    supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (error || authResult.error) return jsonNoStore({ error: 'Could not load users.' }, { status: 500 })

  const authById = new Map(authResult.data.users.map((user) => [user.id, user]))
  const companyById = new Map((companies || []).map((company) => [company.id, company.name]))

  const users = (profiles || []).map((profile) => {
    const authUser = authById.get(profile.auth_user_id)
    return {
      id: profile.id,
      authUserId: profile.auth_user_id,
      email: authUser?.email || 'Unknown email',
      companyId: profile.company_id,
      companyName: companyById.get(profile.company_id) || 'Unknown company',
      role: profile.role,
      isActive: profile.is_active !== false,
      isPlatformAdmin: profile.is_platform_admin === true,
      createdAt: profile.created_at,
    }
  })

  return jsonNoStore({ users })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '')
  const isActive = body?.isActive

  if (!profileId || typeof isActive !== 'boolean') {
    return jsonNoStore({ error: 'Invalid user update.' }, { status: 400 })
  }

  const { data: target, error: targetError } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, is_platform_admin')
    .eq('id', profileId)
    .single()

  if (targetError || !target) return jsonNoStore({ error: 'User not found.' }, { status: 404 })
  if (target.is_platform_admin && !isActive) {
    return jsonNoStore({ error: 'Platform administrator cannot be deactivated here.' }, { status: 400 })
  }

  const { error } = await supabaseServer.from('UserProfiles').update({ is_active: isActive }).eq('id', profileId)
  if (error) return jsonNoStore({ error: 'Could not update user.' }, { status: 500 })

  return jsonNoStore({ updated: true })
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
