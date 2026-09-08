import { supabaseServer } from './supabase-server'

export type ManagementProfile = {
  id: string
  role: 'owner' | 'manager'
  company_id: string
}

type ManagementAccess =
  | { profile: ManagementProfile; userId: string }
  | { error: Response }

const getCookie = (request: Request, name: string) => {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

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
    .select('id, auth_user_id, role, company_id, is_active, is_platform_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: Response.json({ error: 'Manager access required' }, { status: 403 }) }
  }

  if (profile.is_active === false) {
    return { error: Response.json({ error: 'Account inactive' }, { status: 403 }) }
  }

  if (!profile.company_id || !['owner', 'manager'].includes(profile.role || '')) {
    return { error: Response.json({ error: 'Manager access required' }, { status: 403 }) }
  }

  let effectiveProfile = {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    role: profile.role as 'owner' | 'manager',
    company_id: profile.company_id,
  }

  if (profile.is_platform_admin === true) {
    const impersonatedProfileId = getCookie(request, 'tradewise_platform_user')

    if (impersonatedProfileId) {
      const { data: target } = await supabaseServer
        .from('UserProfiles')
        .select('id, auth_user_id, role, company_id, is_active, is_platform_admin')
        .eq('id', impersonatedProfileId)
        .maybeSingle()

      if (
        target?.id &&
        target.is_active !== false &&
        target.is_platform_admin !== true &&
        target.company_id &&
        ['owner', 'manager'].includes(target.role || '')
      ) {
        const { data: targetCompany } = await supabaseServer
          .from('Companies')
          .select('id, status')
          .eq('id', target.company_id)
          .maybeSingle()

        if (targetCompany?.id && targetCompany.status !== 'disabled') {
          effectiveProfile = {
            id: target.id,
            auth_user_id: target.auth_user_id,
            role: target.role as 'owner' | 'manager',
            company_id: target.company_id,
          }
        }
      }
    } else {
      const requestedCompanyId = getCookie(request, 'tradewise_platform_company')

      if (requestedCompanyId) {
        const { data: targetCompany } = await supabaseServer
          .from('Companies')
          .select('id, status')
          .eq('id', requestedCompanyId)
          .single()

        if (targetCompany?.id && targetCompany.status !== 'disabled') {
          effectiveProfile.company_id = targetCompany.id
        }
      }
    }
  }

  if (options?.ownerOnly && effectiveProfile.role !== 'owner') {
    return { error: Response.json({ error: 'Owner access required' }, { status: 403 }) }
  }

  return {
    userId: effectiveProfile.auth_user_id,
    profile: {
      id: effectiveProfile.id,
      role: effectiveProfile.role,
      company_id: effectiveProfile.company_id,
    },
  }
}
