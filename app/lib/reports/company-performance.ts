import { supabaseServer } from '../supabase-server'
import { resolveReportRange } from './date-range'
import type { ReportRunInput, ReportRunResult } from './types'

const configuredJurisdictionLabel = (value: any) => {
  const locality = String(value?.locality || '').trim()
  const state = String(value?.state || '').trim().toUpperCase()
  const country = String(value?.country || '').trim().toUpperCase()
  return [locality, state, country].filter(Boolean).join(', ')
}

const groupByCompany = <T extends { company_id: string }>(rows: T[]) => {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.company_id)
    if (bucket) bucket.push(row)
    else grouped.set(row.company_id, [row])
  }
  return grouped
}

export async function runCompanyPerformanceReport(input: ReportRunInput): Promise<ReportRunResult> {
  const range = resolveReportRange(input.filters)

  let companyQuery = supabaseServer
    .from('Companies')
    .select('id, name, status, account_type, trades, jurisdictions')
    .order('name', { ascending: true })

  if (input.companyId) companyQuery = companyQuery.eq('id', input.companyId)

  const { data: companies, error: companyError } = await companyQuery
  if (companyError) throw new Error('Could not load report companies.')

  let companyRows = companies || []
  const requestedCompanyStatus = String(input.filters.companyStatus || 'all')
  if (requestedCompanyStatus !== 'all') {
    companyRows = companyRows.filter((company) => company.status === requestedCompanyStatus)
  }

  const companyIds = companyRows.map((company) => company.id)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  if (!companyIds.length) {
    return {
      reportType: 'company_performance',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      period: { preset: range.preset, start: startIso, end: endIso },
      sections: input.sections,
      scopeCompanyId: input.companyId,
      rows: [],
      summary: {
        companies: 0,
        attentionCompanies: 0,
        activeUsers: 0,
        rosterTechnicians: 0,
        conversations: 0,
        avgTechnicianAdoptionPct: 0,
        unassignedTechnicians: 0,
      },
    }
  }

  const [
    profilesResult,
    techniciansResult,
    assignmentsResult,
    techConversationResult,
    managementConversationResult,
  ] = await Promise.all([
    supabaseServer
      .from('UserProfiles')
      .select('id, company_id, role, is_active, technician_id')
      .in('company_id', companyIds)
      .eq('is_active', true),
    supabaseServer
      .from('Technicians')
      .select('id, company_id')
      .in('company_id', companyIds),
    supabaseServer
      .from('ManagerTechnicians')
      .select('company_id, manager_profile_id, technician_id')
      .in('company_id', companyIds),
    supabaseServer
      .from('Conversations')
      .select('company_id, technician_id, jurisdiction, created_at')
      .in('company_id', companyIds)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabaseServer
      .from('ManagementConversations')
      .select('company_id, user_role, created_at')
      .in('company_id', companyIds)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
  ])

  const loadError =
    profilesResult.error ||
    techniciansResult.error ||
    assignmentsResult.error ||
    techConversationResult.error ||
    managementConversationResult.error

  if (loadError) throw new Error('Could not build Company Performance report.')

  const profilesByCompany = groupByCompany(profilesResult.data || [])
  const techniciansByCompany = groupByCompany(techniciansResult.data || [])
  const assignmentsByCompany = groupByCompany(assignmentsResult.data || [])
  const techConversationsByCompany = groupByCompany(techConversationResult.data || [])
  const managementConversationsByCompany = groupByCompany(managementConversationResult.data || [])

  let rows = companyRows.map((company) => {
    const profiles = profilesByCompany.get(company.id) || []
    const technicians = techniciansByCompany.get(company.id) || []
    const assignments = assignmentsByCompany.get(company.id) || []
    const techConversations = techConversationsByCompany.get(company.id) || []
    const managementConversations = managementConversationsByCompany.get(company.id) || []

    const activeManagers = new Set(
      profiles.filter((row) => row.role === 'manager').map((row) => row.id)
    )
    const activeUsers = {
      owners: profiles.filter((row) => row.role === 'owner').length,
      managers: activeManagers.size,
      technicians: profiles.filter((row) => row.role === 'technician').length,
    }

    const rosterIds = new Set(technicians.map((row) => row.id))
    const assignedTechnicianIds = new Set(
      assignments
        .filter((row) => activeManagers.has(row.manager_profile_id))
        .map((row) => row.technician_id)
        .filter((id) => rosterIds.has(id))
    )
    const activeTechnicianIds = new Set(
      techConversations.map((row) => row.technician_id).filter(Boolean)
    )

    const rosterTechnicians = technicians.length
    const assignedTechnicians = assignedTechnicianIds.size
    const unassignedTechnicians = Math.max(0, rosterTechnicians - assignedTechnicians)
    const managerCoveragePct = rosterTechnicians
      ? Math.round((assignedTechnicians / rosterTechnicians) * 100)
      : 100
    const accountCoveragePct = rosterTechnicians
      ? Math.min(100, Math.round((activeUsers.technicians / rosterTechnicians) * 100))
      : 100
    const technicianAdoptionPct = activeUsers.technicians
      ? Math.min(100, Math.round((activeTechnicianIds.size / activeUsers.technicians) * 100))
      : 0

    const managerConversations = managementConversations.filter((row) => row.user_role === 'manager').length
    const ownerConversations = managementConversations.filter((row) => row.user_role === 'owner').length
    const totalConversations = techConversations.length + managerConversations + ownerConversations

    const jurisdictionUsage: Record<string, number> = {}
    for (const conversation of techConversations) {
      const state = String((conversation.jurisdiction as any)?.state || '').trim().toUpperCase()
      const locality = String((conversation.jurisdiction as any)?.locality || '').trim()
      const key = [locality, state].filter(Boolean).join(', ') || 'Unspecified'
      jurisdictionUsage[key] = (jurisdictionUsage[key] || 0) + 1
    }

    const configuredJurisdictions = Array.isArray(company.jurisdictions)
      ? company.jurisdictions.map(configuredJurisdictionLabel).filter(Boolean)
      : []

    const allActivityDates = [
      ...techConversations.map((row) => String(row.created_at || '')),
      ...managementConversations.map((row) => String(row.created_at || '')),
    ].filter(Boolean)

    const lastActivityAt = allActivityDates.length
      ? allActivityDates.reduce((latest, value) =>
          new Date(value).getTime() > new Date(latest).getTime() ? value : latest
        )
      : null

    const attentionSignals: string[] = []
    if (company.status !== 'active') attentionSignals.push('Company is not active')
    if (totalConversations === 0) attentionSignals.push('No conversation activity in this period')
    if (unassignedTechnicians > 0) {
      attentionSignals.push(
        `${unassignedTechnicians} technician${unassignedTechnicians === 1 ? '' : 's'} without active-manager coverage`
      )
    }
    if (activeUsers.technicians > 0 && technicianAdoptionPct < 25) {
      attentionSignals.push('Technician adoption is below 25% for this period')
    }

    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      accountType: company.account_type,
      peopleCoverage: {
        activeUsers,
        rosterTechnicians,
        assignedTechnicians,
        unassignedTechnicians,
        managerCoveragePct,
        accountCoveragePct,
      },
      engagement: {
        technicianConversations: techConversations.length,
        managerConversations,
        ownerConversations,
        totalConversations,
        activeTechnicians: activeTechnicianIds.size,
        technicianAdoptionPct,
        lastActivityAt,
      },
      configuration: {
        trades: Array.isArray(company.trades) ? company.trades : [],
        jurisdictions: configuredJurisdictions,
        jurisdictionUsage,
      },
      attention: {
        needsAttention: attentionSignals.length > 0,
        signals: attentionSignals,
      },
    }
  })

  if (input.filters.attentionOnly === true) {
    rows = rows.filter((row) => row.attention.needsAttention)
  }

  const summary = {
    companies: rows.length,
    attentionCompanies: rows.filter((row) => row.attention.needsAttention).length,
    activeUsers: rows.reduce(
      (sum, row) =>
        sum +
        row.peopleCoverage.activeUsers.owners +
        row.peopleCoverage.activeUsers.managers +
        row.peopleCoverage.activeUsers.technicians,
      0
    ),
    rosterTechnicians: rows.reduce((sum, row) => sum + row.peopleCoverage.rosterTechnicians, 0),
    conversations: rows.reduce((sum, row) => sum + row.engagement.totalConversations, 0),
    avgTechnicianAdoptionPct: rows.length
      ? Math.round(rows.reduce((sum, row) => sum + row.engagement.technicianAdoptionPct, 0) / rows.length)
      : 0,
    unassignedTechnicians: rows.reduce((sum, row) => sum + row.peopleCoverage.unassignedTechnicians, 0),
  }

  return {
    reportType: 'company_performance',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { preset: range.preset, start: startIso, end: endIso },
    sections: input.sections,
    scopeCompanyId: input.companyId,
    rows,
    summary,
  }
}
