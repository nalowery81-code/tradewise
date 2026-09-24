import { supabaseServer } from './supabase-server'

export type SeatRole = 'owner' | 'manager' | 'technician'
export type SeatBucket = { owners: number; managers: number; technicians: number }

export type CompanySeatSummary = {
  included: SeatBucket
  used: SeatBucket
  available: SeatBucket
  overage: SeatBucket
  overPlan: boolean
  limits: SeatBucket
}

export async function getCompanySeatSummary(companyId: string): Promise<CompanySeatSummary> {
  const [{ data: company, error: companyError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabaseServer.from('Companies').select('seat_limits').eq('id', companyId).single(),
      supabaseServer.from('UserProfiles').select('role, is_active').eq('company_id', companyId).eq('is_active', true),
    ])

  if (companyError || !company) throw companyError || new Error('Company not found.')
  if (profilesError) throw profilesError

  const rawIncluded = company.seat_limits || {}
  const included: SeatBucket = {
    owners: Number(rawIncluded.owners ?? 1),
    managers: Number(rawIncluded.managers ?? 2),
    technicians: Number(rawIncluded.technicians ?? 8),
  }

  const used: SeatBucket = {
    owners: (profiles || []).filter((profile) => profile.role === 'owner').length,
    managers: (profiles || []).filter((profile) => profile.role === 'manager').length,
    technicians: (profiles || []).filter((profile) => profile.role === 'technician').length,
  }

  const overage: SeatBucket = {
    owners: Math.max(0, used.owners - included.owners),
    managers: Math.max(0, used.managers - included.managers),
    technicians: Math.max(0, used.technicians - included.technicians),
  }

  return {
    included,
    used,
    available: {
      owners: Math.max(0, included.owners - used.owners),
      managers: Math.max(0, included.managers - used.managers),
      technicians: Math.max(0, included.technicians - used.technicians),
    },
    overage,
    overPlan: overage.owners > 0 || overage.managers > 0 || overage.technicians > 0,
    limits: included,
  }
}
