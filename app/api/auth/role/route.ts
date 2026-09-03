import { supabaseServer } from '../../../lib/supabase-server'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .select('role, company_id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'User profile not found' }, { status: 404 })
    }

    return Response.json({
      // Existing manager UI checks role === 'manager'. Keep that contract while
      // exposing the true accountRole for owner-only screens and future routing.
      role: profile.role === 'owner' ? 'manager' : profile.role,
      accountRole: profile.role,
      companyId: profile.company_id,
    })
  } catch (error) {
    console.error('USER ROLE API ERROR:', error)
    return Response.json({ error: 'Could not load user role.' }, { status: 500 })
  }
}
