import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [companies, profiles] = await Promise.all([
    supabaseServer.from('Companies')
      .select('id, name, status, account_type, plan_code, subscription_status, seat_limits, created_at')
      .order('name', { ascending: true }),
    supabaseServer.from('UserProfiles')
      .select('id, company_id, role, is_active'),
  ])

  if (companies.error || profiles.error) {
    console.error('BILLING PLANS LOAD ERROR:', companies.error || profiles.error)
    return jsonNoStore({ error: 'Could not load billing and plan data.' }, { status: 500 })
  }

  const rows = (companies.data || []).map((company) => {
    const companyProfiles = (profiles.data || []).filter(
      (profile) => profile.company_id === company.id && profile.is_active !== false
    )
    const included = {
      owners: Number(company.seat_limits?.owners ?? 1),
      managers: Number(company.seat_limits?.managers ?? 2),
      technicians: Number(company.seat_limits?.technicians ?? 8),
    }
    const used = {
      owners: companyProfiles.filter((profile) => profile.role === 'owner').length,
      managers: companyProfiles.filter((profile) => profile.role === 'manager').length,
      technicians: companyProfiles.filter((profile) => profile.role === 'technician').length,
    }
    const overage = {
      owners: Math.max(0, used.owners - included.owners),
      managers: Math.max(0, used.managers - included.managers),
      technicians: Math.max(0, used.technicians - included.technicians),
    }

    return {
      id: company.id,
      name: company.name,
      status: company.status,
      accountType: company.account_type,
      planCode: company.plan_code || 'mvp',
      subscriptionStatus: company.subscription_status || 'manual',
      included,
      used,
      overage,
      overPlan: Object.values(overage).some((value) => value > 0),
      createdAt: company.created_at,
    }
  })

  const planCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.planCode] = (counts[row.planCode] || 0) + 1
    return counts
  }, {})

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    companies: rows,
    summary: {
      companies: rows.length,
      activeCompanies: rows.filter((row) => row.status === 'active').length,
      overPlanCompanies: rows.filter((row) => row.overPlan).length,
      activeSeats: rows.reduce((sum, row) => sum + row.used.owners + row.used.managers + row.used.technicians, 0),
      planCounts,
    },
    note: 'Plan and seat configuration is currently managed from each company control page. This page is the platform-wide billing and allowance view.',
  })
}
