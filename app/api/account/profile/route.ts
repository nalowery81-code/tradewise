import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const authenticate = async (request: Request) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const accessToken = authHeader.slice('Bearer '.length)
  const { data: { user }, error } = await supabaseServer.auth.getUser(accessToken)
  return error || !user ? null : user
}

export async function GET(request: Request) {
  const user = await authenticate(request)
  if (!user) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabaseServer
    .from('UserProfiles')
    .select('preferred_name')
    .eq('auth_user_id', user.id)
    .single()

  if (error || !profile) {
    return jsonNoStore({ error: 'User profile not found.' }, { status: 404 })
  }

  const fullName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name.trim()
        : ''

  return jsonNoStore({
    email: user.email || '',
    fullName,
    preferredName: profile.preferred_name || '',
  })
}

export async function PATCH(request: Request) {
  const user = await authenticate(request)
  if (!user) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const preferredName =
    typeof body?.preferredName === 'string'
      ? body.preferredName.replace(/\s+/g, ' ').trim()
      : ''

  if (preferredName.length > 80) {
    return jsonNoStore({ error: 'Preferred name must be 80 characters or fewer.' }, { status: 400 })
  }

  const value = preferredName || null

  const { error: profileError } = await supabaseServer
    .from('UserProfiles')
    .update({ preferred_name: value })
    .eq('auth_user_id', user.id)

  if (profileError) {
    console.error('ACCOUNT PREFERRED NAME UPDATE ERROR:', profileError)
    return jsonNoStore({ error: 'Could not update preferred name.' }, { status: 500 })
  }

  const { error: authError } = await supabaseServer.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      preferred_name: value,
    },
  })

  if (authError) console.error('ACCOUNT PREFERRED NAME AUTH METADATA ERROR:', authError)

  return jsonNoStore({ updated: true, preferredName: preferredName })
}
