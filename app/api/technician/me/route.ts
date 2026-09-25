import { supabaseServer } from '../../../lib/supabase-server'
import { requireEffectiveTechnician } from '../../../lib/technician-access'
import { jurisdictionAllowed, normalizeJurisdiction } from '../../../lib/jurisdiction'

export async function GET(request: Request) {
  const access = await requireEffectiveTechnician(request)
  if ('error' in access) return access.error

  const { data: userProfile } = await supabaseServer
    .from('UserProfiles')
    .select('preferred_name')
    .eq('auth_user_id', access.authUserId)
    .maybeSingle()

  const { data: company, error } = await supabaseServer
    .from('Companies')
    .select('jurisdictions')
    .eq('id', access.technician.company_id)
    .single()

  if (error || !company) {
    return Response.json({ error: 'Could not load company jurisdictions.' }, { status: 500 })
  }

  const companyJurisdictions = (Array.isArray(company.jurisdictions) ? company.jurisdictions : [])
    .map(normalizeJurisdiction)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return Response.json(
    {
      technician: {
        ...access.technician,
        display_name: userProfile?.preferred_name || access.technician.canonical_name,
      },
      companyJurisdictions,
      impersonating: access.impersonating,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PATCH(request: Request) {
  const access = await requireEffectiveTechnician(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const requested =
    body?.defaultJurisdiction === null
      ? null
      : normalizeJurisdiction(body?.defaultJurisdiction)

  if (body?.defaultJurisdiction !== null && !requested) {
    return Response.json({ error: 'Enter a valid default jurisdiction.' }, { status: 400 })
  }

  const { data: company, error: companyError } = await supabaseServer
    .from('Companies')
    .select('jurisdictions')
    .eq('id', access.technician.company_id)
    .single()

  if (companyError || !company) {
    return Response.json({ error: 'Could not load company jurisdictions.' }, { status: 500 })
  }

  const allowed = (Array.isArray(company.jurisdictions) ? company.jurisdictions : [])
    .map(normalizeJurisdiction)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (requested && !jurisdictionAllowed(allowed, requested)) {
    return Response.json({ error: 'That jurisdiction is not enabled for this company.' }, { status: 400 })
  }

  const { data: technician, error } = await supabaseServer
    .from('Technicians')
    .update({ default_jurisdiction: requested })
    .eq('id', access.technician.id)
    .eq('company_id', access.technician.company_id)
    .select('id, canonical_name, company_id, default_jurisdiction')
    .single()

  if (error || !technician) {
    return Response.json({ error: 'Could not update default jurisdiction.' }, { status: 500 })
  }

  return Response.json({ technician })
}
