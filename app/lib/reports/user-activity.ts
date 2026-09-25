import { supabaseServer } from '../supabase-server'
import { resolveReportRange } from './date-range'
import type { ReportRunInput, ReportRunResult } from './types'

type ProfileRow = {
  id: string
  auth_user_id: string
  company_id: string | null
  role: string
  is_active: boolean | null
  technician_id: string | null
  preferred_name: string | null
  created_at: string
  deactivated_at: string | null
}

type TechnicianRow = {
  id: string
  auth_user_id: string | null
  canonical_name: string
}

type ActivityRow = {
  created_at: string
}

const latestDate = (dates: string[]) =>
  dates.length
    ? dates.reduce((latest, value) =>
        new Date(value).getTime() > new Date(latest).getTime() ? value : latest
      )
    : null

export async function runUserActivityReport(input: ReportRunInput): Promise<ReportRunResult> {
  const range = resolveReportRange(input.filters)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  let companyQuery = supabaseServer
    .from('Companies')
    .select('id, name, status, account_type')
    .order('name', { ascending: true })

  if (input.companyId) companyQuery = companyQuery.eq('id', input.companyId)

  const { data: companies, error: companyError } = await companyQuery
  if (companyError) throw new Error('Could not load report companies.')

  const companyRows = companies || []
  const companyIds = companyRows.map((company) => company.id)

  let profileQuery = supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, company_id, role, is_active, technician_id, preferred_name, created_at, deactivated_at')

  if (input.companyId) {
    profileQuery = profileQuery.eq('company_id', input.companyId)
  } else if (companyIds.length) {
    profileQuery = profileQuery.in('company_id', companyIds)
  }

  const [
    profilesResult,
    techniciansResult,
    authResult,
    techConversationsResult,
    managementConversationsResult,
  ] = await Promise.all([
    profileQuery,
    supabaseServer
      .from('Technicians')
      .select('id, auth_user_id, canonical_name'),
    supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    companyIds.length
      ? supabaseServer
          .from('Conversations')
          .select('technician_id, company_id, created_at')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabaseServer
          .from('ManagementConversations')
          .select('profile_id, company_id, created_at')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
      : Promise.resolve({ data: [], error: null }),
  ])

  const loadError =
    profilesResult.error ||
    techniciansResult.error ||
    authResult.error ||
    techConversationsResult.error ||
    managementConversationsResult.error

  if (loadError) throw new Error('Could not build User Activity report.')

  const profiles = (profilesResult.data || []) as ProfileRow[]
  const technicians = (techniciansResult.data || []) as TechnicianRow[]
  const companyById = new Map(companyRows.map((company) => [company.id, company]))
  const authById = new Map(authResult.data.users.map((user) => [user.id, user]))
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]))
  const technicianByAuthId = new Map(
    technicians
      .filter((technician) => technician.auth_user_id)
      .map((technician) => [technician.auth_user_id as string, technician])
  )

  const technicianActivity = new Map<string, ActivityRow[]>()
  for (const row of techConversationsResult.data || []) {
    if (!row.technician_id) continue
    const current = technicianActivity.get(row.technician_id) || []
    current.push({ created_at: row.created_at })
    technicianActivity.set(row.technician_id, current)
  }

  const managementActivity = new Map<string, ActivityRow[]>()
  for (const row of managementConversationsResult.data || []) {
    if (!row.profile_id) continue
    const current = managementActivity.get(row.profile_id) || []
    current.push({ created_at: row.created_at })
    managementActivity.set(row.profile_id, current)
  }

  let rows = profiles.map((profile) => {
    const authUser = authById.get(profile.auth_user_id)
    const metadataName =
      typeof authUser?.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim()
        : typeof authUser?.user_metadata?.name === 'string'
          ? authUser.user_metadata.name.trim()
          : ''

    const technician =
      (profile.technician_id ? technicianById.get(profile.technician_id) : null) ||
      technicianByAuthId.get(profile.auth_user_id) ||
      null

    const displayName =
      profile.preferred_name?.trim() ||
      metadataName ||
      technician?.canonical_name?.trim() ||
      authUser?.email ||
      `${profile.role || 'User'} account`

    const activity =
      profile.role === 'technician' && technician
        ? technicianActivity.get(technician.id) || []
        : managementActivity.get(profile.id) || []

    const activityDates = activity.map((item) => item.created_at).filter(Boolean)
    const lastActivityAt = latestDate(activityDates)
    const lastSignInAt = authUser?.last_sign_in_at || null

    const attentionSignals: string[] = []
    if (profile.is_active === false) attentionSignals.push('Account is inactive')
    if (!lastSignInAt) attentionSignals.push('User has never signed in')
    if (activity.length === 0) attentionSignals.push('No conversation activity in this period')
    if (profile.role === 'technician' && !technician) {
      attentionSignals.push('Technician account is not linked to a technician record')
    }

    const company = profile.company_id ? companyById.get(profile.company_id) : null

    return {
      profileId: profile.id,
      authUserId: profile.auth_user_id,
      displayName,
      preferredName: profile.preferred_name || '',
      email: authUser?.email || '',
      companyId: profile.company_id,
      companyName: company?.name || 'No company',
      companyStatus: company?.status || 'unassigned',
      accountType: company?.account_type || '',
      role: profile.role,
      isActive: profile.is_active !== false,
      isPlatformAdmin: false,
      accountCreatedAt: profile.created_at,
      deactivatedAt: profile.deactivated_at,
      lastSignInAt,
      engagement: {
        conversations: activity.length,
        lastActivityAt,
      },
      attention: {
        needsAttention: attentionSignals.length > 0,
        signals: attentionSignals,
      },
    }
  })

  const roleFilter = String(input.filters.role || 'all')
  if (roleFilter !== 'all') rows = rows.filter((row) => row.role === roleFilter)

  const accountStatus = String(input.filters.accountStatus || 'all')
  if (accountStatus === 'active') rows = rows.filter((row) => row.isActive)
  if (accountStatus === 'inactive') rows = rows.filter((row) => !row.isActive)

  const activityStatus = String(input.filters.activityStatus || 'all')
  if (activityStatus === 'with_activity') rows = rows.filter((row) => row.engagement.conversations > 0)
  if (activityStatus === 'no_activity') rows = rows.filter((row) => row.engagement.conversations === 0)
  if (activityStatus === 'never_signed_in') rows = rows.filter((row) => !row.lastSignInAt)

  rows.sort((a, b) =>
    a.companyName.localeCompare(b.companyName) ||
    a.role.localeCompare(b.role) ||
    a.displayName.localeCompare(b.displayName)
  )

  const summary = {
    users: rows.length,
    activeAccounts: rows.filter((row) => row.isActive).length,
    inactiveAccounts: rows.filter((row) => !row.isActive).length,
    usersWithActivity: rows.filter((row) => row.engagement.conversations > 0).length,
    noActivityUsers: rows.filter((row) => row.engagement.conversations === 0).length,
    neverSignedIn: rows.filter((row) => !row.lastSignInAt).length,
    conversations: rows.reduce((sum, row) => sum + row.engagement.conversations, 0),
    owners: rows.filter((row) => row.role === 'owner').length,
    managers: rows.filter((row) => row.role === 'manager').length,
    technicians: rows.filter((row) => row.role === 'technician').length,
    attentionUsers: rows.filter((row) => row.attention.needsAttention).length,
  }

  return {
    reportType: 'user_activity',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections: input.sections,
    scopeCompanyId: input.companyId,
    rows,
    summary,
  }
}
