export type CompanyFeatureFlags = {
  manager_search: boolean
  manager_history: boolean
  manager_follow_up: boolean
  manager_technicians: boolean
  manager_notes: boolean
  owner_overview: boolean
  owner_company: boolean
  owner_assignments: boolean
  owner_add_manager: boolean
  owner_add_technician: boolean
}

export const DEFAULT_COMPANY_FEATURES: CompanyFeatureFlags = {
  manager_search: false,
  manager_history: false,
  manager_follow_up: true,
  manager_technicians: true,
  manager_notes: false,
  owner_overview: true,
  owner_company: true,
  owner_assignments: true,
  owner_add_manager: true,
  owner_add_technician: true,
}

export const COMPANY_FEATURE_KEYS = Object.keys(DEFAULT_COMPANY_FEATURES) as (keyof CompanyFeatureFlags)[]

export function normalizeCompanyFeatureFlags(value: unknown): CompanyFeatureFlags {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return COMPANY_FEATURE_KEYS.reduce((flags, key) => {
    flags[key] = typeof input[key] === 'boolean' ? input[key] as boolean : DEFAULT_COMPANY_FEATURES[key]
    return flags
  }, { ...DEFAULT_COMPANY_FEATURES })
}
