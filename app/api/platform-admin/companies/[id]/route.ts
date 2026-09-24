import { requirePlatformAdmin } from '../../../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../../../lib/supabase-server'
import { getCompanySeatSummary } from '../../../../../lib/company-seats'
import {
  COMPANY_FEATURE_KEYS,
  normalizeCompanyFeatureFlags,
} from '../../../../../lib/company-features'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

const normalizeSeatLimits = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const owners = Number(raw.owners)
  const managers = Number(raw.managers)
  const technicians = Number(raw.technicians)

  if (![owners, managers, technicians].every((item) => Number.isInteger(item) && item >= 0)) {
    return null
  }

  return { owners, managers, technicians }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const { id } = await params
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000)
  since.setUTCHours(0, 0, 0, 0)

  const [
    { data: company, error: companyError },
    { data: profiles, error: profilesError },
    { data: usageRows, error: usageError },
    { data: verifiedJurisdictions, error: jurisdictionError },
    { data: verifiedEditions, error: editionsError },
  ] = await Promise.all([
    supabaseServer
      .from('Companies')
      .select('id, name, account_type, status, feature_flags, timezone, trades, jurisdictions, settings, plan_code, subscription_status, seat_limits, created_at, updated_at')
      .eq('id', id)
      .single(),
    supabaseServer
      .from('UserProfiles')
      .select('id, auth_user_id, role, is_active, created_at')
      .eq('company_id', id),
    supabaseServer
      .from('AIUsageEvents')
      .select('feature, total_tokens, web_search_calls, file_search_calls, created_at')
      .eq('company_id', id)
      .gte('created_at', since.toISOString()),
    supabaseServer
      .from('VerifiedJurisdictions')
      .select('id, name, state_code, country_code, jurisdiction_type'),
    supabaseServer
      .from('VerifiedCodeEditions')
      .select('id, jurisdiction_id, code_family, status, last_verified_at'),
  ])

  if (companyError || !company) {
    return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  if (profilesError || usageError || jurisdictionError || editionsError) {
    console.error('COMPANY CONTROL CENTER LOAD ERROR:', profilesError || usageError || jurisdictionError || editionsError)
    return jsonNoStore({ error: 'Could not load company control center.' }, { status: 500 })
  }

  const authIds = (profiles || []).map((profile) => profile.auth_user_id).filter(Boolean)
  const authMap = new Map<string, { last_sign_in_at?: string | null }>()
  if (authIds.length > 0) {
    const { data: authUsers, error: authError } = await supabaseServer.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (authError) {
      console.error('COMPANY CONTROL CENTER AUTH USERS ERROR:', authError)
    } else {
      for (const user of authUsers.users) {
        if (authIds.includes(user.id)) authMap.set(user.id, { last_sign_in_at: user.last_sign_in_at })
      }
    }
  }

  const pendingInvites = (profiles || []).filter((profile) => {
    if (profile.is_active === false || !profile.auth_user_id) return false
    return !authMap.get(profile.auth_user_id)?.last_sign_in_at
  }).length

  const seats = await getCompanySeatSummary(id)

  const usage = (usageRows || []).reduce(
    (total, row) => ({
      calls: total.calls + 1,
      totalTokens: total.totalTokens + Number(row.total_tokens || 0),
      webSearchCalls: total.webSearchCalls + Number(row.web_search_calls || 0),
      fileSearchCalls: total.fileSearchCalls + Number(row.file_search_calls || 0),
    }),
    { calls: 0, totalTokens: 0, webSearchCalls: 0, fileSearchCalls: 0 }
  )

  const editionsByJurisdiction = new Map<string, { codeFamilies: Set<string>; lastVerifiedAt: string | null }>()
  for (const edition of verifiedEditions || []) {
    if (edition.status !== 'current') continue
    const current = editionsByJurisdiction.get(edition.jurisdiction_id) || {
      codeFamilies: new Set<string>(),
      lastVerifiedAt: null,
    }
    if (edition.code_family) current.codeFamilies.add(edition.code_family)
    if (edition.last_verified_at && (!current.lastVerifiedAt || edition.last_verified_at > current.lastVerifiedAt)) {
      current.lastVerifiedAt = edition.last_verified_at
    }
    editionsByJurisdiction.set(edition.jurisdiction_id, current)
  }

  const configuredJurisdictions = Array.isArray(company.jurisdictions) ? company.jurisdictions : []
  const sourceCoverage = configuredJurisdictions.map((configured: any) => {
    const match = (verifiedJurisdictions || []).find(
      (item) =>
        String(item.country_code || '').toUpperCase() === String(configured?.country || '').toUpperCase() &&
        String(item.state_code || '').toUpperCase() === String(configured?.state || '').toUpperCase()
    )
    const editionSummary = match ? editionsByJurisdiction.get(match.id) : undefined

    return {
      country: configured?.country || '',
      state: configured?.state || '',
      locality: configured?.locality || null,
      name: match?.name || configured?.state || 'Unknown',
      verified: Boolean(match && editionSummary && editionSummary.codeFamilies.size > 0),
      codeFamilies: editionSummary ? [...editionSummary.codeFamilies].sort() : [],
      lastVerifiedAt: editionSummary?.lastVerifiedAt || null,
    }
  })

  return jsonNoStore({
    company: {
      ...company,
      feature_flags: normalizeCompanyFeatureFlags(company.feature_flags),
    },
    seats,
    pendingInvites,
    usage: {
      ...usage,
      windowDays: 14,
    },
    sourceCoverage,
    health: {
      tenantIsolation: 'healthy',
      companyStatus: company.status,
      sourceCoverageVerified: sourceCoverage.filter((item) => item.verified).length,
      sourceCoverageTotal: sourceCoverage.length,
    },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  if (Object.prototype.hasOwnProperty.call(body, 'planCode')) {
    const planCode = String(body.planCode || '').trim().toLowerCase()
    if (!planCode || planCode.length > 40) {
      return jsonNoStore({ error: 'Enter a valid plan code.' }, { status: 400 })
    }
    updates.plan_code = planCode
  }

  if (Object.prototype.hasOwnProperty.call(body, 'subscriptionStatus')) {
    const subscriptionStatus = String(body.subscriptionStatus || '').trim()
    const allowedStatuses = ['manual', 'trialing', 'active', 'past_due', 'canceled', 'paused']
    if (!allowedStatuses.includes(subscriptionStatus)) {
      return jsonNoStore({ error: 'Invalid subscription status.' }, { status: 400 })
    }
    updates.subscription_status = subscriptionStatus
  }

  if (Object.prototype.hasOwnProperty.call(body, 'seatLimits')) {
    const seatLimits = normalizeSeatLimits(body.seatLimits)
    if (!seatLimits) {
      return jsonNoStore({ error: 'Seat limits must be whole numbers of zero or more.' }, { status: 400 })
    }

    const current = await getCompanySeatSummary(id)
    if (
      seatLimits.owners < current.used.owners ||
      seatLimits.managers < current.used.managers ||
      seatLimits.technicians < current.used.technicians
    ) {
      return jsonNoStore(
        { error: 'Seat limits cannot be lower than currently active or pending seats.', seats: current },
        { status: 409 }
      )
    }
    updates.seat_limits = seatLimits
  }

  if (Object.prototype.hasOwnProperty.call(body, 'featureFlags')) {
    if (!body.featureFlags || typeof body.featureFlags !== 'object' || Array.isArray(body.featureFlags)) {
      return jsonNoStore({ error: 'Feature settings are required.' }, { status: 400 })
    }
    const raw = body.featureFlags as Record<string, unknown>
    if (Object.keys(raw).some((key) => !COMPANY_FEATURE_KEYS.includes(key as any))) {
      return jsonNoStore({ error: 'Unknown company feature setting.' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabaseServer
      .from('Companies')
      .select('feature_flags')
      .eq('id', id)
      .single()

    if (existingError || !existing) {
      return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
    }

    const nextFlags = normalizeCompanyFeatureFlags(existing.feature_flags)
    for (const key of COMPANY_FEATURE_KEYS) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'boolean') {
          return jsonNoStore({ error: `Feature ${key} must be true or false.` }, { status: 400 })
        }
        nextFlags[key] = raw[key] as boolean
      }
    }
    updates.feature_flags = nextFlags
  }

  if (Object.keys(updates).length === 0) {
    return jsonNoStore({ error: 'No company controls were provided.' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseServer
    .from('Companies')
    .update(updates)
    .eq('id', id)
    .select('id, plan_code, subscription_status, seat_limits, feature_flags, updated_at')
    .single()

  if (error || !data) {
    console.error('COMPANY CONTROL CENTER UPDATE ERROR:', error)
    return jsonNoStore({ error: 'Could not update company controls.' }, { status: 500 })
  }

  return jsonNoStore({
    updated: true,
    company: {
      ...data,
      feature_flags: normalizeCompanyFeatureFlags(data.feature_flags),
    },
  })
}
