export type Jurisdiction = {
  country: string
  state: string
  locality?: string
}

export const normalizeJurisdiction = (value: unknown): Jurisdiction | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const country = typeof input.country === 'string' ? input.country.trim().toUpperCase() : ''
  const state = typeof input.state === 'string' ? input.state.trim().toUpperCase() : ''
  const locality = typeof input.locality === 'string' ? input.locality.trim() : ''
  if (!country || !state) return null
  return locality ? { country, state, locality } : { country, state }
}

export const jurisdictionKey = (value: Jurisdiction | null | undefined) =>
  value
    ? [value.country.toUpperCase(), value.state.toUpperCase(), (value.locality || '').toLowerCase()].join('|')
    : ''

export const jurisdictionLabel = (value: Jurisdiction | null | undefined) => {
  if (!value) return 'Jurisdiction not selected'
  return value.locality ? `${value.locality}, ${value.state}` : value.state
}

export const jurisdictionAllowed = (
  allowed: Jurisdiction[],
  candidate: Jurisdiction | null | undefined
) => {
  if (!candidate) return false
  const key = jurisdictionKey(candidate)
  return allowed.some((item) => jurisdictionKey(item) === key)
}
