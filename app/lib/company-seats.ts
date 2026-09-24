import { supabaseServer } from './supabase-server'

export type SeatRole = 'owner' | 'manager' | 'technician'

export type CompanySeatSummary = {
  limits: { owners: number; managers: number; technicians: number }
  used: { owners: number; managers: number; technicians: number }
  available: { owners: number; managers: number; technicians: number }
}

const roleKey = (role: SeatRole) =>
  role === 'owner' ? 'owners' : role === 'manager' ? 'managers' : 'technicians'

export async function getCompanySeatSummary(companyId: string): Promise<CompanySeatSummary> {
  const [{ data: company, error: companyError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabaseServer
        .from('Companies')
        .select('seat_limits')
        .eq('id', companyId)
        .single(),
      supabaseServer
        .from('UserProfiles')
        .select('role, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true),
    ])

  if (companyError || !company) throw companyError || new Error('Company not found.')
  if (profilesError) throw profilesError

  const rawLimits = company.seat_limits || {}
  const limits = {
    owners: Number(rawLimits.owners ?? 1),
    managers: Number(rawLimits.managers ?? 2),
    technicians: Number(rawLimits.technicians ?? 8),
  }

  const used = {
    owners: (profiles || []).filter((profile) => profile.role === 'owner').length,
    managers: (profiles || []).filter((profile) => profile.role === 'manager').length,
    technicians: (profiles || []).filter((profile) => profile.role === 'technician').length,
  }

  return {
    limits,
    used,
    available: {
      owners: Math.max(0, limits.owners - used.owners),
      managers: Math.max(0, limits.managers - used.managers),
      technicians: Math.max(0, limits.technicians - used.technicians),
    },
  }
}

export async function requireAvailableCompanySeat(companyId: string, role: SeatRole) {
  const summary = await getCompanySeatSummary(companyId)
  const key = roleKey(role)

  if (summary.used[key] >= summary.limits[key]) {
    return {
      ok: false as const,
      error: `This company has reached its ${role} seat limit (${summary.used[key]}/${summary.limits[key]}).`,
      summary,
    }
  }

  return { ok: true as const, summary }
}
