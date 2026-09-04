import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

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
        .select('id, name, account_type, status, created_at')
        .order('created_at', { ascending: true }),
      supabaseServer.from('UserProfiles').select('id, company_id, role, is_active'),
      supabaseServer.from('Technicians').select('id, company_id'),
    ])

  if (companyError) {
    console.error('PLATFORM ADMIN COMPANIES ERROR:', companyError)
    return jsonNoStore({ error: 'Could not load companies.' }, { status: 500 })
  }

  const companyRows = (companies || []).map((company) => {
    const companyProfiles = (profiles || []).filter((profile) => profile.company_id === company.id)
    const companyTechnicians = (technicians || []).filter((tech) => tech.company_id === company.id)

    return {
      ...company,
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
    .insert({ name, account_type: 'demo', status: 'active' })
    .select('id, name, account_type, status, created_at')
    .single()

  if (error) {
    console.error('CREATE DEMO COMPANY ERROR:', error)
    return jsonNoStore({ error: 'Could not create demo company.' }, { status: 500 })
  }

  return jsonNoStore({ company: { ...data, users: 0, owners: 0, managers: 0, technicians: 0 } }, { status: 201 })
}
