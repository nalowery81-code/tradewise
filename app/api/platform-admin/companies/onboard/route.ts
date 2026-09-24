import { requirePlatformAdmin } from '../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../lib/supabase-server'
import {
  DEFAULT_COMPANY_FEATURES,
  normalizeCompanyFeatureFlags,
} from '../../../../lib/company-features'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

const getInviteRedirectUrl = () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://app.craftcompassai.com'

  return `${baseUrl.replace(/\/+$/, '')}/setup-account`
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  let companyId: string | null = null
  let invitedUserId: string | null = null

  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''
    const ownerName = typeof body?.ownerName === 'string' ? body.ownerName.replace(/\s+/g, ' ').trim() : ''
    const ownerEmail = typeof body?.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
    const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : 'America/Indiana/Indianapolis'
    const trades = Array.isArray(body?.trades)
      ? [...new Set(body.trades.filter((trade: unknown): trade is string => typeof trade === 'string').map((trade: string) => trade.trim().toLowerCase()).filter(Boolean))]
      : ['plumbing']
    const jurisdictions = Array.isArray(body?.jurisdictions) && body.jurisdictions.length
      ? body.jurisdictions
      : [{ country: 'US', state: 'IN' }]

    if (name.length < 2 || name.length > 120) {
      return jsonNoStore({ error: 'Company name must be between 2 and 120 characters.' }, { status: 400 })
    }

    if (ownerName.length < 2 || ownerName.length > 120) {
      return jsonNoStore({ error: 'Owner name must be between 2 and 120 characters.' }, { status: 400 })
    }

    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return jsonNoStore({ error: 'Enter a valid owner email address.' }, { status: 400 })
    }

    if (!trades.length) {
      return jsonNoStore({ error: 'At least one trade is required.' }, { status: 400 })
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    } catch {
      return jsonNoStore({ error: 'Enter a valid IANA timezone.' }, { status: 400 })
    }

    const normalizedJurisdictions = jurisdictions
      .filter((jurisdiction: unknown) => jurisdiction && typeof jurisdiction === 'object' && !Array.isArray(jurisdiction))
      .map((jurisdiction: Record<string, unknown>) => ({
        country: typeof jurisdiction.country === 'string' ? jurisdiction.country.trim().toUpperCase() : '',
        state: typeof jurisdiction.state === 'string' ? jurisdiction.state.trim().toUpperCase() : '',
        locality: typeof jurisdiction.locality === 'string' ? jurisdiction.locality.trim() : undefined,
      }))
      .filter((jurisdiction: { country: string; state: string }) => jurisdiction.country && jurisdiction.state)

    if (!normalizedJurisdictions.length) {
      return jsonNoStore({ error: 'At least one valid jurisdiction is required.' }, { status: 400 })
    }

    const { data: company, error: companyError } = await supabaseServer
      .from('Companies')
      .insert({
        name,
        account_type: 'demo',
        status: 'active',
        feature_flags: DEFAULT_COMPANY_FEATURES,
        timezone,
        trades,
        jurisdictions: normalizedJurisdictions,
        settings: {},
      })
      .select('id, name, account_type, status, created_at, feature_flags, timezone, trades, jurisdictions')
      .single()

    if (companyError || !company) {
      console.error('ONBOARD COMPANY CREATE ERROR:', companyError)
      return jsonNoStore({ error: 'Could not create company workspace.' }, { status: 500 })
    }

    companyId = company.id

    const { data: inviteData, error: inviteError } =
      await supabaseServer.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: getInviteRedirectUrl(),
        data: {
          full_name: ownerName,
          company_id: company.id,
          role: 'owner',
        },
      })

    if (inviteError || !inviteData.user) {
      const message = inviteError?.message?.toLowerCase().includes('already')
        ? 'That owner email already has a CraftCompass AI account.'
        : inviteError?.message || 'Could not send the owner invite.'
      throw new Error(message)
    }

    invitedUserId = inviteData.user.id

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .insert({
        auth_user_id: invitedUserId,
        role: 'owner',
        company_id: company.id,
        is_active: true,
      })
      .select('id')
      .single()

    if (profileError || !profile) {
      throw profileError || new Error('Could not create owner profile.')
    }

    return jsonNoStore({
      company: {
        ...company,
        feature_flags: normalizeCompanyFeatureFlags(company.feature_flags),
        users: 1,
        owners: 1,
        managers: 0,
        technicians: 0,
      },
      owner: {
        name: ownerName,
        email: ownerEmail,
        profileId: profile.id,
        status: 'pending_invite',
      },
      invited: true,
    }, { status: 201 })
  } catch (error: any) {
    console.error('COMPANY ONBOARDING ERROR:', error)

    if (invitedUserId) {
      try {
        await supabaseServer.from('UserProfiles').delete().eq('auth_user_id', invitedUserId)
        await supabaseServer.auth.admin.deleteUser(invitedUserId)
      } catch (cleanupError) {
        console.error('COMPANY ONBOARDING USER CLEANUP ERROR:', cleanupError)
      }
    }

    if (companyId) {
      try {
        await supabaseServer.from('Companies').delete().eq('id', companyId)
      } catch (cleanupError) {
        console.error('COMPANY ONBOARDING COMPANY CLEANUP ERROR:', cleanupError)
      }
    }

    return jsonNoStore(
      { error: error?.message || 'Could not onboard company.' },
      { status: 500 }
    )
  }
}
