import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) },
  })

const getSetupRedirectUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://app.craftcompassai.com'
  return `${baseUrl.replace(/\/+$/, '')}/setup-account`
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  let createdAuthUserId: string | null = null

  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!name || name.length < 2 || name.length > 120) {
      return jsonNoStore({ error: 'Name must be between 2 and 120 characters.' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonNoStore({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        role: 'platform_admin',
        password_set: false,
      },
    })

    if (authError || !authData.user) {
      const message = authError?.message?.toLowerCase().includes('already')
        ? 'That email already has a CraftCompass account.'
        : authError?.message || 'Could not create the platform admin account.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

    createdAuthUserId = authData.user.id

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .insert({
        auth_user_id: createdAuthUserId,
        role: 'owner',
        company_id: null,
        is_active: true,
        is_platform_admin: true,
      })
      .select('id')
      .single()

    if (profileError || !profile) {
      throw profileError || new Error('Could not create the platform admin profile.')
    }

    const { error: setupError } = await supabaseServer.auth.resetPasswordForEmail(email, {
      redirectTo: getSetupRedirectUrl(),
    })

    if (setupError) {
      throw new Error(setupError.message || 'Could not send the setup email.')
    }

    return jsonNoStore(
      {
        created: true,
        profileId: profile.id,
        email,
        name,
        setupSent: true,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('PLATFORM ADMIN CREATE ERROR:', error)

    if (createdAuthUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', createdAuthUserId)
        await supabaseServer.auth.admin.deleteUser(createdAuthUserId)
      } catch (cleanupError) {
        console.error('PLATFORM ADMIN CREATE CLEANUP ERROR:', cleanupError)
      }
    }

    return jsonNoStore({ error: error?.message || 'Could not create the platform admin account.' }, { status: 500 })
  }
}
