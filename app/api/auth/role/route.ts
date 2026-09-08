import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

const getCookie = (request: Request, name: string) => {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .select('id, role, company_id, is_active, is_platform_admin')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonNoStore({ error: 'User profile not found' }, { status: 404 })
    }

    if (profile.is_active === false) {
      return jsonNoStore({ error: 'Account inactive' }, { status: 403 })
    }

    let effectiveProfile = profile
    let isImpersonating = false
    let impersonatedEmail: string | null = null

    if (profile.is_platform_admin === true) {
      const targetProfileId = getCookie(request, 'tradewise_platform_user')

      if (targetProfileId) {
        const { data: target } = await supabaseServer
          .from('UserProfiles')
          .select('id, auth_user_id, role, company_id, is_active, is_platform_admin')
          .eq('id', targetProfileId)
          .maybeSingle()

        if (
          target &&
          target.is_active !== false &&
          target.is_platform_admin !== true &&
          ['owner', 'manager'].includes(target.role || '')
        ) {
          effectiveProfile = target
          isImpersonating = true

          const { data: targetAuth } = await supabaseServer.auth.admin.getUserById(target.auth_user_id)
          impersonatedEmail = targetAuth?.user?.email || null
        }
      }
    }

    const { data: company } = await supabaseServer
      .from('Companies')
      .select('name')
      .eq('id', effectiveProfile.company_id)
      .maybeSingle()

    return jsonNoStore({
      role: effectiveProfile.role === 'owner' ? 'manager' : effectiveProfile.role,
      accountRole: effectiveProfile.role,
      companyId: effectiveProfile.company_id,
      companyName: company?.name || null,
      isPlatformAdmin: profile.is_platform_admin === true,
      isImpersonating,
      impersonatedEmail,
    })
  } catch (error) {
    console.error('USER ROLE API ERROR:', error)
    return jsonNoStore({ error: 'Could not load user role.' }, { status: 500 })
  }
}
