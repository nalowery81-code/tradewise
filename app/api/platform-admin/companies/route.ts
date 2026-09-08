import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'
import {
  COMPANY_FEATURE_KEYS,
  DEFAULT_COMPANY_FEATURES,
  normalizeCompanyFeatureFlags,
} from '../../../lib/company-features'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {}),
    },
  })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [{ data: companies, error: companyError }, { data: profiles }, { data: technicians }] =
    await Promise.all([
      supabaseServer
        .from('Companies')
        .select('id, name, account_type, status, created_at, feature_flags')
        .order('created_at', { ascending: true }),
      supabaseServer
        .from('UserProfiles')
        .select('id, auth_user_id, company_id, role, is_active, technician_id'),
      supabaseServer.from('Technicians').select('id, company_id'),
    ])

  if (companyError) {
    console.error('PLATFORM ADMIN COMPANIES ERROR:', companyError)
    return jsonNoStore({ error: 'Could not load companies.' }, { status: 500 })
  }

  const companyRows = (companies || []).map((company) => {
    const companyProfiles = (profiles || []).filter((profile) => profile.company_id === company.id)

    // A promoted manager keeps their former technician row for historical
    // conversations/reflections. UserProfiles.technician_id identifies that old
    // technician identity, so it should not count as a current technician.
    const historicalManagerTechnicianIds = new Set(
      companyProfiles
        .filter((profile) => profile.role === 'manager')
        .map((profile) => profile.technician_id)
        .filter((id): id is string => Boolean(id))
    )

    const companyTechnicians = (technicians || []).filter(
      (tech) => tech.company_id === company.id && !historicalManagerTechnicianIds.has(tech.id)
    )

    return {
      ...company,
      feature_flags: normalizeCompanyFeatureFlags(company.feature_flags),
      users: companyProfiles.length,
      owners: companyProfiles.filter((profile) => profile.role === 'owner' && profile.is_active !== false).length,
      managers: companyProfiles.filter((profile) => profile.role === 'manager' && profile.is_active !== false).length,
      technicians: companyTechnicians.length,
    }
  })

  return jsonNoStore({ companies: companyRows })
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (name.length < 2 || name.length > 120) {
    return jsonNoStore({ error: 'Company name must be between 2 and 120 characters.' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('Companies')
    .insert({ name, account_type: 'demo', status: 'active', feature_flags: DEFAULT_COMPANY_FEATURES })
    .select('id, name, account_type, status, created_at, feature_flags')
    .single()

  if (error) {
    console.error('CREATE DEMO COMPANY ERROR:', error)
    return jsonNoStore({ error: 'Could not create demo company.' }, { status: 500 })
  }

  return jsonNoStore({
    company: {
      ...data,
      feature_flags: normalizeCompanyFeatureFlags(data.feature_flags),
      users: 0,
      owners: 0,
      managers: 0,
      technicians: 0,
    },
  }, { status: 201 })
}

export async function PATCH(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const companyId = String(body?.companyId || '').trim()
  const requestedFlags = body?.featureFlags

  if (!companyId) {
    return jsonNoStore({ error: 'Company is required.' }, { status: 400 })
  }

  if (!requestedFlags || typeof requestedFlags !== 'object' || Array.isArray(requestedFlags)) {
    return jsonNoStore({ error: 'Feature settings are required.' }, { status: 400 })
  }

  const rawFlags = requestedFlags as Record<string, unknown>
  const hasUnknownKey = Object.keys(rawFlags).some(
    (key) => !COMPANY_FEATURE_KEYS.includes(key as (typeof COMPANY_FEATURE_KEYS)[number])
  )

  if (hasUnknownKey) {
    return jsonNoStore({ error: 'Unknown company feature setting.' }, { status: 400 })
  }

  const { data: existingCompany, error: companyError } = await supabaseServer
    .from('Companies')
    .select('id, feature_flags')
    .eq('id', companyId)
    .single()

  if (companyError || !existingCompany) {
    return jsonNoStore({ error: 'Company not found.' }, { status: 404 })
  }

  const currentFlags = normalizeCompanyFeatureFlags(existingCompany.feature_flags)
  const nextFlags = { ...currentFlags }

  for (const key of COMPANY_FEATURE_KEYS) {
    if (rawFlags[key] !== undefined) {
      if (typeof rawFlags[key] !== 'boolean') {
        return jsonNoStore({ error: `Feature ${key} must be true or false.` }, { status: 400 })
      }
      nextFlags[key] = rawFlags[key] as boolean
    }
  }

  const { data, error } = await supabaseServer
    .from('Companies')
    .update({ feature_flags: nextFlags })
    .eq('id', companyId)
    .select('id, feature_flags')
    .single()

  if (error || !data) {
    console.error('UPDATE COMPANY FEATURES ERROR:', error)
    return jsonNoStore({ error: 'Could not update company feature settings.' }, { status: 500 })
  }

  return jsonNoStore({
    updated: true,
    companyId: data.id,
    featureFlags: normalizeCompanyFeatureFlags(data.feature_flags),
  })
}
