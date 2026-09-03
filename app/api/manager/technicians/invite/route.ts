import { supabaseServer } from '../../../../lib/supabase-server'

export async function POST(request: Request) {
  let invitedUserId: string | null = null

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
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile || !['manager', 'owner'].includes(profile.role || '')) {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!name || name.length < 2) {
      return Response.json({ error: 'Technician name is required.' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const { data: existingTechnician, error: existingTechnicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name, auth_user_id')
      .ilike('canonical_name', name)
      .maybeSingle()

    if (existingTechnicianError) throw existingTechnicianError

    if (existingTechnician?.auth_user_id) {
      return Response.json(
        { error: `${existingTechnician.canonical_name} already has a Tradewise login.` },
        { status: 409 }
      )
    }

    const origin = new URL(request.url).origin
    const { data: inviteData, error: inviteError } = await supabaseServer.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${origin}/setup-account`,
        data: { full_name: name },
      }
    )

    if (inviteError || !inviteData.user) {
      console.error('TECHNICIAN INVITE AUTH ERROR:', inviteError)
      const message = inviteError?.message?.toLowerCase().includes('already')
        ? 'That email already has a Tradewise account.'
        : inviteError?.message || 'Could not send the technician invite.'
      return Response.json({ error: message }, { status: 400 })
    }

    invitedUserId = inviteData.user.id

    const { error: userProfileError } = await supabaseServer.from('UserProfiles').insert({
      auth_user_id: invitedUserId,
      role: 'technician',
    })

    if (userProfileError) throw userProfileError

    let technician

    if (existingTechnician) {
      const { data, error } = await supabaseServer
        .from('Technicians')
        .update({
          canonical_name: name,
          auth_user_id: invitedUserId,
        })
        .eq('id', existingTechnician.id)
        .select('id, canonical_name, auth_user_id')
        .single()

      if (error) throw error
      technician = data
    } else {
      const { data, error } = await supabaseServer
        .from('Technicians')
        .insert({
          canonical_name: name,
          auth_user_id: invitedUserId,
        })
        .select('id, canonical_name, auth_user_id')
        .single()

      if (error) throw error
      technician = data
    }

    return Response.json({
      technician: {
        id: technician.id,
        name: technician.canonical_name,
      },
      email,
      invited: true,
    })
  } catch (error: any) {
    console.error('MANAGER TECHNICIAN INVITE ERROR:', error)

    if (invitedUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', invitedUserId)
        await supabaseServer
          .from('Technicians')
          .update({ auth_user_id: null })
          .eq('auth_user_id', invitedUserId)
        await supabaseServer.auth.admin.deleteUser(invitedUserId)
      } catch (cleanupError) {
        console.error('TECHNICIAN INVITE CLEANUP ERROR:', cleanupError)
      }
    }

    return Response.json(
      { error: error?.message || 'Could not invite technician.' },
      { status: 500 }
    )
  }
}
