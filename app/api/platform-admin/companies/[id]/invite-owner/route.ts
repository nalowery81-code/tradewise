import { requirePlatformAdmin } from '../../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../../lib/supabase-server'

const getInviteRedirectUrl = () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://tradewise-git-main-nalowery81-2073s-projects.vercel.app'

  return `${baseUrl.replace(/\/+$/, '')}/setup-account`
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let invitedUserId: string | null = null

  try {
    const access = await requirePlatformAdmin(request)
    if ('error' in access) return access.error

    const { id: companyId } = await context.params
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!name || name.length < 2) {
      return Response.json({ error: 'Owner name is required.' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const { data: company, error: companyError } = await supabaseServer
      .from('Companies')
      .select('id, name, status')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return Response.json({ error: 'Company not found.' }, { status: 404 })
    }

    if (company.status === 'disabled') {
      return Response.json({ error: 'This company is disabled.' }, { status: 400 })
    }

    const { data: inviteData, error: inviteError } =
      await supabaseServer.auth.admin.inviteUserByEmail(email, {
        redirectTo: getInviteRedirectUrl(),
        data: { full_name: name, company_id: companyId, role: 'owner' },
      })

    if (inviteError || !inviteData.user) {
      console.error('PLATFORM OWNER INVITE AUTH ERROR:', inviteError)
      const message = inviteError?.message?.toLowerCase().includes('already')
        ? 'That email already has a Tradewise account.'
        : inviteError?.message || 'Could not send the owner invite.'
      return Response.json({ error: message }, { status: 400 })
    }

    invitedUserId = inviteData.user.id

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .insert({
        auth_user_id: invitedUserId,
        role: 'owner',
        company_id: companyId,
        is_active: true,
      })
      .select('id, auth_user_id, role, company_id, created_at')
      .single()

    if (profileError || !profile) {
      throw profileError || new Error('Could not create owner profile.')
    }

    return Response.json({
      invited: true,
      owner: {
        profileId: profile.id,
        authUserId: profile.auth_user_id,
        name,
        email,
        role: profile.role,
      },
    })
  } catch (error: any) {
    console.error('PLATFORM OWNER INVITE ERROR:', error)

    if (invitedUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', invitedUserId)
        await supabaseServer.auth.admin.deleteUser(invitedUserId)
      } catch (cleanupError) {
        console.error('PLATFORM OWNER INVITE CLEANUP ERROR:', cleanupError)
      }
    }

    return Response.json({ error: error?.message || 'Could not invite owner.' }, { status: 500 })
  }
}
