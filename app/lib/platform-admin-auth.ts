import { supabaseServer } from './supabase-server'

type PlatformAdminAccess =
  | { userId: string; profileId: string }
  | { error: Response }

export async function requirePlatformAdmin(request: Request): Promise<PlatformAdminAccess> {
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
    .select('id, is_active, is_platform_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile || profile.is_active === false || profile.is_platform_admin !== true) {
    return { error: Response.json({ error: 'Platform admin access required' }, { status: 403 }) }
  }

  return { userId: user.id, profileId: profile.id }
}
