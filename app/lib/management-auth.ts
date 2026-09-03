import { supabaseServer } from './supabase-server'

export type ManagementProfile = {
  id: string
  role: 'owner' | 'manager'
  company_id: string
}

type ManagementAccess =
  | { profile: ManagementProfile; userId: string }
  | { error: Response }

export async function requireManagementAccess(
  request: Request,
  options?: { ownerOnly?: boolean }
): Promise<ManagementAccess> {
  const authHeader = request.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: userError,
  } = await supabaseServer.auth.getUser(accessToken)

  if (userError || !user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from('UserProfiles')
    .select('id, role, company_id, is_active')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: Response.json({ error: 'Manager access required' }, { status: 403 }) }
  }

  if (profile.is_active === false) {
    return { error: Response.json({ error: 'Account inactive' }, { status: 403 }) }
  }

  if (
    !profile.company_id ||
    !['owner', 'manager'].includes(profile.role || '')
  ) {
    return { error: Response.json({ error: 'Manager access required' }, { status: 403 }) }
  }

  if (options?.ownerOnly && profile.role !== 'owner') {
    return { error: Response.json({ error: 'Owner access required' }, { status: 403 }) }
  }

  return {
    userId: user.id,
    profile: profile as ManagementProfile,
  }
}
