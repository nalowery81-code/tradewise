import { requirePlatformAdmin } from '../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../lib/supabase-server'

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
  let technicianId: string | null = null
  let technicianWasExisting = false

  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const companyId = String(body?.companyId || '').trim()
    const role = String(body?.role || '').trim().toLowerCase()
    const isActive = body?.isActive !== false
    const sendSetup = body?.sendSetup === true

    if (!name || name.length < 2 || name.length > 120) {
      return jsonNoStore({ error: 'Name must be between 2 and 120 characters.' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonNoStore({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    if (!companyId) {
      return jsonNoStore({ error: 'Choose a company.' }, { status: 400 })
    }

    if (!['owner', 'manager', 'technician'].includes(role)) {
      return jsonNoStore({ error: 'Choose owner, manager, or technician.' }, { status: 400 })
    }

    const { data: company, error: companyError } = await supabaseServer
      .from('Companies')
      .select('id, name, status')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
    }

    if (company.status === 'disabled') {
      return jsonNoStore({ error: 'You cannot add users to a disabled company.' }, { status: 400 })
    }

    if (role === 'technician') {
      const { data: existingTechnician, error: technicianLookupError } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name, auth_user_id')
        .eq('company_id', companyId)
        .ilike('canonical_name', name)
        .maybeSingle()

      if (technicianLookupError) throw technicianLookupError
      if (existingTechnician?.auth_user_id) {
        return jsonNoStore(
          { error: `${existingTechnician.canonical_name} already has a CraftCompass login.` },
          { status: 409 }
        )
      }

      if (existingTechnician) {
        technicianId = existingTechnician.id
        technicianWasExisting = true
      }
    }

    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        company_id: companyId,
        role,
        password_set: false,
      },
    })

    if (authError || !authData.user) {
      const message = authError?.message?.toLowerCase().includes('already')
        ? 'That email already has a CraftCompass account.'
        : authError?.message || 'Could not create the user account.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

    createdAuthUserId = authData.user.id

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .insert({
        auth_user_id: createdAuthUserId,
        role,
        company_id: companyId,
        is_active: isActive,
      })
      .select('id, auth_user_id, company_id, role, is_active')
      .single()

    if (profileError || !profile) throw profileError || new Error('Could not create the user profile.')

    if (role === 'technician') {
      if (technicianId) {
        const { error } = await supabaseServer
          .from('Technicians')
          .update({ canonical_name: name, auth_user_id: createdAuthUserId, company_id: companyId })
          .eq('id', technicianId)
          .eq('company_id', companyId)
        if (error) throw error
      } else {
        const { data: technician, error } = await supabaseServer
          .from('Technicians')
          .insert({ canonical_name: name, auth_user_id: createdAuthUserId, company_id: companyId })
          .select('id')
          .single()
        if (error || !technician) throw error || new Error('Could not create technician record.')
        technicianId = technician.id
      }
    }

    if (sendSetup) {
      const { error: setupError } = await supabaseServer.auth.resetPasswordForEmail(email, {
        redirectTo: getSetupRedirectUrl(),
      })
      if (setupError) throw new Error(setupError.message || 'Could not send setup email.')
    }

    return jsonNoStore(
      {
        user: {
          id: profile.id,
          authUserId: profile.auth_user_id,
          email,
          name,
          companyId,
          companyName: company.name,
          role: profile.role,
          isActive: profile.is_active !== false,
          isPlatformAdmin: false,
        },
        setupSent: sendSetup,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('PLATFORM MANUAL USER CREATE ERROR:', error)

    if (createdAuthUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', createdAuthUserId)

        if (technicianId) {
          if (technicianWasExisting) {
            await supabaseServer
              .from('Technicians')
              .update({ auth_user_id: null })
              .eq('id', technicianId)
              .eq('auth_user_id', createdAuthUserId)
          } else {
            await supabaseServer
              .from('Technicians')
              .delete()
              .eq('id', technicianId)
              .eq('auth_user_id', createdAuthUserId)
          }
        }

        await supabaseServer.auth.admin.deleteUser(createdAuthUserId)
      } catch (cleanupError) {
        console.error('PLATFORM MANUAL USER CLEANUP ERROR:', cleanupError)
      }
    }

    return jsonNoStore({ error: error?.message || 'Could not create user.' }, { status: 500 })
  }
}
