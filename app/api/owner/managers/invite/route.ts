import { supabaseServer } from '../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../lib/management-auth'

const getInviteRedirectUrl = () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://tradewise-git-technician-mvp-nalowery81-2073s-projects.vercel.app'

  return `${baseUrl.replace(/\/+$/, '')}/setup-account`
}

export async function POST(request: Request) {
  let invitedUserId: string | null = null

  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const body = await request.json()
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!name || name.length < 2) {
      return Response.json({ error: 'Manager name is required.' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const { data: inviteData, error: inviteError } = await supabaseServer.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: getInviteRedirectUrl(),
        data: { full_name: name, company_id: companyId, role: 'manager' },
      }
    )

    if (inviteError || !inviteData.user) {
      console.error('MANAGER INVITE AUTH ERROR:', inviteError)
      const message = inviteError?.message?.toLowerCase().includes('already')
        ? 'That email already has a Tradewise account.'
        : inviteError?.message || 'Could not send the manager invite.'
      return Response.json({ error: message }, { status: 400 })
    }

    invitedUserId = inviteData.user.id

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .insert({
        auth_user_id: invitedUserId,
        role: 'manager',
        company_id: companyId,
      })
      .select('id, auth_user_id, role, company_id, created_at')
      .single()

    if (profileError || !profile) throw profileError || new Error('Could not create manager profile.')

    return Response.json({
      manager: {
        profileId: profile.id,
        authUserId: profile.auth_user_id,
        name,
        email,
        role: profile.role,
      },
      invited: true,
    })
  } catch (error: any) {
    console.error('OWNER MANAGER INVITE ERROR:', error)

    if (invitedUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', invitedUserId)
        await supabaseServer.auth.admin.deleteUser(invitedUserId)
      } catch (cleanupError) {
        console.error('MANAGER INVITE CLEANUP ERROR:', cleanupError)
      }
    }

    return Response.json({ error: error?.message || 'Could not invite manager.' }, { status: 500 })
  }
}
