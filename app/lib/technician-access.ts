import { supabaseServer } from './supabase-server'

const userCookieName = 'tradewise_platform_user'

const getCookie = (request: Request, name: string) => {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

type TechnicianAccess =
  | {
      authUserId: string
      technician: { id: string; canonical_name: string; company_id: string; default_jurisdiction: Record<string, unknown> | null }
      impersonating: boolean
      adminProfileId?: string
    }
  | { error: Response }

export async function requireEffectiveTechnician(request: Request): Promise<TechnicianAccess> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabaseServer.auth.getUser(accessToken)
  if (userError || !user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: requesterProfile } = await supabaseServer
    .from('UserProfiles')
    .select('id, is_active, is_platform_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (requesterProfile?.is_active !== false && requesterProfile?.is_platform_admin === true) {
    const targetProfileId = getCookie(request, userCookieName)

    if (targetProfileId) {
      const { data: targetProfile } = await supabaseServer
        .from('UserProfiles')
        .select('id, auth_user_id, role, is_active, is_platform_admin')
        .eq('id', targetProfileId)
        .maybeSingle()

      if (
        !targetProfile ||
        targetProfile.is_active === false ||
        targetProfile.is_platform_admin === true ||
        targetProfile.role !== 'technician'
      ) {
        return { error: Response.json({ error: 'Technician impersonation is not active.' }, { status: 403 }) }
      }

      const { data: technician } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name, company_id, default_jurisdiction')
        .eq('auth_user_id', targetProfile.auth_user_id)
        .maybeSingle()

      if (!technician) {
        return { error: Response.json({ error: 'Technician not found.' }, { status: 404 }) }
      }

      return {
        authUserId: targetProfile.auth_user_id,
        technician,
        impersonating: true,
        adminProfileId: requesterProfile.id,
      }
    }
  }

  const { data: technician } = await supabaseServer
    .from('Technicians')
    .select('id, canonical_name, company_id, default_jurisdiction')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!technician) {
    return { error: Response.json({ error: 'Technician not found.' }, { status: 404 }) }
  }

  return { authUserId: user.id, technician, impersonating: false }
}
