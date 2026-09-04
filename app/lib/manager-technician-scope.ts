import { supabaseServer } from './supabase-server'
import type { ManagementProfile } from './management-auth'

type TechnicianScopeResult =
  | { technicianIds: string[] | null }
  | { error: Response }

export async function getManagerTechnicianScope(
  profile: ManagementProfile
): Promise<TechnicianScopeResult> {
  if (profile.role === 'owner') {
    return { technicianIds: null }
  }

  const { data: assignments, error } = await supabaseServer
    .from('ManagerTechnicians')
    .select('technician_id')
    .eq('company_id', profile.company_id)
    .eq('manager_profile_id', profile.id)

  if (error) {
    console.error('MANAGER TECHNICIAN SCOPE ERROR:', error)
    return {
      error: Response.json(
        { error: 'Could not verify technician assignments.' },
        { status: 500 }
      ),
    }
  }

  return {
    technicianIds: (assignments || []).map((assignment) => assignment.technician_id),
  }
}

export function technicianIsInScope(
  technicianIds: string[] | null,
  technicianId: string
) {
  return technicianIds === null || technicianIds.includes(technicianId)
}
