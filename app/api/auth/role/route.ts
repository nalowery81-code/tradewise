import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

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
      .select('role, company_id, is_active, is_platform_admin')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonNoStore({ error: 'User profile not found' }, { status: 404 })
    }

    if (profile.is_active === false) {
      return jsonNoStore({ error: 'Account inactive' }, { status: 403 })
    }

    return jsonNoStore({
      // Existing manager UI checks role === 'manager'. Keep that contract while
      // exposing the true accountRole for owner-only screens and future routing.
      role: profile.role === 'owner' ? 'manager' : profile.role,
      accountRole: profile.role,
      companyId: profile.company_id,
      isPlatformAdmin: profile.is_platform_admin === true,
    })
  } catch (error) {
    console.error('USER ROLE API ERROR:', error)
    return jsonNoStore({ error: 'Could not load user role.' }, { status: 500 })
  }
}
