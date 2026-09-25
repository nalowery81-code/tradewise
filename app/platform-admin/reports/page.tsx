'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

type CompanyOption = {
  id: string
  name: string
  status: string
  account_type: string
}

type CatalogSection = {
  key: string
  label: string
  description: string
}

type CatalogFilter = {
  key: string
  label: string
  type: 'select' | 'boolean'
  options?: { value: string; label: string }[]
  defaultValue?: string | boolean
}

type CatalogItem = {
  type: string
  label: string
  description: string
  status: 'live' | 'planned'
  schemaVersion: number
  defaultSections: string[]
  sections: CatalogSection[]
  filters: CatalogFilter[]
}

type ReportDefinition = {
  id: string
  name: string
  report_type: string
  schema_version: number
  scope_company_id: string | null
  filters: Record<string, unknown>
  sections: string[]
  created_at: string
  updated_at: string
}

type ReportRun = {
  id: string
  definition_id: string | null
  report_type: string
  schema_version: number
  scope_company_id: string | null
  filters: Record<string, unknown>
  sections: string[]
  status: 'running' | 'completed' | 'failed'
  row_count: number
  summary: Record<string, number>
  started_at: string
  completed_at: string | null
  error_text: string | null
}

type BillingUsageRow = {
  companyId: string
  companyName: string
  companyStatus: string
  accountType: string
  planCode: string
  subscriptionStatus: string
  included: { owners: number; managers: number; technicians: number }
  used: { owners: number; managers: number; technicians: number }
  overage: { owners: number; managers: number; technicians: number }
  overPlan: boolean
  activity: {
    technicianConversations: number
    managerConversations: number
    ownerConversations: number
  }
  aiUsage: {
    calls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    webSearchCalls: number
    fileSearchCalls: number
  }
}

type CompanyPerformanceRow = {
  companyId: string
  companyName: string
  companyStatus: string
  accountType: string
  peopleCoverage: {
    activeUsers: { owners: number; managers: number; technicians: number }
    rosterTechnicians: number
    assignedTechnicians: number
    unassignedTechnicians: number
    managerCoveragePct: number
    accountCoveragePct: number
  }
  engagement: {
    technicianConversations: number
    managerConversations: number
    ownerConversations: number
    totalConversations: number
    activeTechnicians: number
    technicianAdoptionPct: number
    lastActivityAt: string | null
  }
  configuration: {
    trades: string[]
    jurisdictions: string[]
    jurisdictionUsage: Record<string, number>
  }
  attention: {
    needsAttention: boolean
    signals: string[]
  }
}

type AIUsageCostRow = {
  companyId: string
  companyName: string
  companyStatus: string
  accountType: string
  usage: {
    calls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    webSearchCalls: number
    fileSearchCalls: number
    lastUsageAt: string | null
  }
  features: { key: string; calls: number; totalTokens: number }[]
  models: { key: string; calls: number; totalTokens: number }[]
}

type LearningQualityRow = {
  companyId: string
  companyName: string
  companyStatus: string
  accountType: string
  quality: {
    feedbackCount: number
    helpful: number
    notHelpful: number
    feedbackRequests: number
    respondedRequests: number
    auditFlags: number
    openFlags: number
    auditReviews: number
    corrected: number
    incorrect: number
  }
  attention: {
    needsAttention: boolean
    signals: string[]
  }
}

type LearningQualityPlatform = {
  guidance: { total: number; active: number; inactive: number }
  verifiedSources: { total: number; current: number; needsAttention: number }
  sourceChecks: { total: number; issues: number }
  learningRuns: {
    total: number
    completed: number
    failed: number
    reviews: number
    guidanceCreated: number
    helpfulSignals: number
    sourcesChecked: number
    sourceIssues: number
  }
}

type ReportResult = {
  reportType: string
  schemaVersion: number
  generatedAt: string
  period: { preset: string; start: string; end: string }
  sections: string[]
  scopeCompanyId: string | null
  rows: Array<BillingUsageRow | CompanyPerformanceRow | AIUsageCostRow | LearningQualityRow>
  summary: Record<string, number>
  runId?: string
  billingNote?: string
  aiCostNote?: string
  platform?: LearningQualityPlatform
}

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([])
  const [recentRuns, setRecentRuns] = useState<ReportRun[]>([])

  const [reportType, setReportType] = useState('billing_usage')
  const [companyId, setCompanyId] = useState('')
  const [datePreset, setDatePreset] = useState('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string | boolean>>({})
  const [sections, setSections] = useState<string[]>([])
  const [reportName, setReportName] = useState('Billing & Usage')
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')

  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const activeCatalogItem = useMemo(
    () => catalog.find((item) => item.type === reportType) || null,
    [catalog, reportType]
  )
  const resultCatalogItem = useMemo(
    () => result ? catalog.find((item) => item.type === result.reportType) || null : null,
    [catalog, result]
  )

  const filters = useMemo(() => ({
    datePreset,
    ...(datePreset === 'custom' ? { startDate, endDate } : {}),
    ...filterValues,
  }), [datePreset, startDate, endDate, filterValues])

  const applyCatalogDefaults = (item: CatalogItem) => {
    setSections(item.defaultSections || [])
    setFilterValues(Object.fromEntries(
      item.filters.map((filter) => [
        filter.key,
        filter.defaultValue ?? (filter.type === 'boolean' ? false : '')
      ])
    ))
    setReportName(item.label)
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const response = await fetch('/api/platform-admin/reports', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not load reports.')

      const nextCatalog = (data.catalog || []) as CatalogItem[]
      setCatalog(nextCatalog)
      setCompanies(data.companies || [])
      setDefinitions(data.definitions || [])
      setRecentRuns(data.recentRuns || [])

      const current = nextCatalog.find((item) => item.type === reportType)
      if (current && sections.length === 0) applyCatalogDefaults(current)
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const refreshRunHistory = async () => {
    try {
      const token = await getToken()
      const response = await fetch('/api/platform-admin/reports', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setDefinitions(data.definitions || [])
        setRecentRuns(data.recentRuns || [])
      }
    } catch {}
  }

  const executeReport = async (config?: {
    reportType?: string
    companyId?: string | null
    filters?: Record<string, unknown>
    sections?: string[]
    definitionId?: string | null
  }) => {
    const requestedCompanyId =
      config && Object.prototype.hasOwnProperty.call(config, 'companyId')
        ? config.companyId ?? null
        : companyId || null
    const requestedDefinitionId =
      config && Object.prototype.hasOwnProperty.call(config, 'definitionId')
        ? config.definitionId ?? null
        : selectedDefinitionId || null

    setRunning(true)
    setError('')
    setStatus('')
    try {
      const token = await getToken()
      const response = await fetch('/api/platform-admin/reports/run', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportType: config?.reportType || reportType,
          companyId: requestedCompanyId,
          filters: config?.filters || filters,
          sections: config?.sections || sections,
          definitionId: requestedDefinitionId,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not run report.')
      setResult(data)
      setStatus(`Report generated · ${data.rows?.length || 0} compan${data.rows?.length === 1 ? 'y' : 'ies'}`)
      await refreshRunHistory()
    } catch (runError: any) {
      setError(runError?.message || 'Could not run report.')
      await refreshRunHistory()
    } finally {
      setRunning(false)
    }
  }

  const saveDefinition = async (saveAsNew = false) => {
    if (!reportName.trim()) {
      setError('Enter a report name before saving.')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')

    const updateExisting = Boolean(selectedDefinitionId && !saveAsNew)

    try {
      const token = await getToken()
      const response = await fetch('/api/platform-admin/reports', {
        method: updateExisting ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(updateExisting ? { id: selectedDefinitionId } : {}),
          name: reportName.trim(),
          reportType,
          companyId: companyId || null,
          filters,
          sections,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save report.')

      const saved = data.definition as ReportDefinition
      setSelectedDefinitionId(saved.id)
      setDefinitions((current) => {
        const without = current.filter((item) => item.id !== saved.id)
        return [saved, ...without]
      })
      setStatus(updateExisting ? 'Saved report updated.' : 'Report definition saved.')
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save report.')
    } finally {
      setSaving(false)
    }
  }

  const chooseFamily = (item: CatalogItem) => {
    if (item.status !== 'live') return
    setReportType(item.type)
    setCompanyId('')
    setDatePreset('30d')
    setStartDate('')
    setEndDate('')
    setSelectedDefinitionId('')
    setResult(null)
    applyCatalogDefaults(item)
    setStatus('')
    setError('')
  }

  const loadDefinition = (definition: ReportDefinition) => {
    setReportType(definition.report_type)
    setCompanyId(definition.scope_company_id || '')
    setDatePreset(String(definition.filters?.datePreset || '30d'))
    setStartDate(String(definition.filters?.startDate || ''))
    setEndDate(String(definition.filters?.endDate || ''))
    const family = catalog.find((item) => item.type === definition.report_type)
    const loadedFilterValues: Record<string, string | boolean> = {}
    for (const filter of family?.filters || []) {
      const savedValue = definition.filters?.[filter.key]
      loadedFilterValues[filter.key] =
        filter.type === 'boolean'
          ? savedValue === true || (savedValue === undefined && filter.defaultValue === true)
          : String(savedValue ?? filter.defaultValue ?? '')
    }
    setFilterValues(loadedFilterValues)
    setSections(Array.isArray(definition.sections) ? definition.sections : [])
    setReportName(definition.name)
    setSelectedDefinitionId(definition.id)
    setResult(null)
    setStatus(`Loaded “${definition.name}”. Run it to refresh the data.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const newReport = () => {
    const item = activeCatalogItem || catalog.find((entry) => entry.status === 'live')
    if (!item) return
    setSelectedDefinitionId('')
    setCompanyId('')
    setDatePreset('30d')
    setStartDate('')
    setEndDate('')
    setResult(null)
    applyCatalogDefaults(item)
    setStatus('New report started.')
  }

  const runSavedDefinition = async (definition: ReportDefinition) => {
    await executeReport({
      reportType: definition.report_type,
      companyId: definition.scope_company_id,
      filters: definition.filters,
      sections: definition.sections,
      definitionId: definition.id,
    })
  }

  const archiveDefinition = async (definition: ReportDefinition) => {
    if (!window.confirm(`Archive saved report “${definition.name}”?`)) return
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`/api/platform-admin/reports?id=${encodeURIComponent(definition.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not archive report.')
      setDefinitions((current) => current.filter((item) => item.id !== definition.id))
      if (selectedDefinitionId === definition.id) setSelectedDefinitionId('')
      setStatus('Saved report archived.')
    } catch (archiveError: any) {
      setError(archiveError?.message || 'Could not archive report.')
    }
  }

  const toggleSection = (key: string) => {
    setSections((current) =>
      current.includes(key)
        ? current.length === 1 ? current : current.filter((item) => item !== key)
        : [...current, key]
    )
  }

  const exportCsv = () => {
    if (!result?.rows?.length) return

    let headers: string[] = []
    let exportRows: unknown[][] = []

    if (result.reportType === 'billing_usage') {
      headers = [
        'Company','Plan','Subscription Status',
        ...(result.sections.includes('plan_seats') ? [
          'Owners Used','Owners Included','Owners Overage',
          'Managers Used','Managers Included','Managers Overage',
          'Technicians Used','Technicians Included','Technicians Overage','Over Plan'
        ] : []),
        ...(result.sections.includes('activity') ? ['Technician Conversations','Manager Conversations','Owner Conversations'] : []),
        ...(result.sections.includes('ai_usage') ? ['AI Calls','Total Tokens','Cached Input Tokens','Web Searches','File Searches'] : []),
      ]
      exportRows = (result.rows as BillingUsageRow[]).map((row) => [
        row.companyName,
        row.planCode,
        row.subscriptionStatus,
        ...(result.sections.includes('plan_seats') ? [
          row.used.owners,row.included.owners,row.overage.owners,
          row.used.managers,row.included.managers,row.overage.managers,
          row.used.technicians,row.included.technicians,row.overage.technicians,
          row.overPlan ? 'Yes' : 'No'
        ] : []),
        ...(result.sections.includes('activity') ? [
          row.activity.technicianConversations,
          row.activity.managerConversations,
          row.activity.ownerConversations,
        ] : []),
        ...(result.sections.includes('ai_usage') ? [
          row.aiUsage.calls,
          row.aiUsage.totalTokens,
          row.aiUsage.cachedInputTokens,
          row.aiUsage.webSearchCalls,
          row.aiUsage.fileSearchCalls,
        ] : []),
      ])
    } else if (result.reportType === 'company_performance') {
      headers = [
        'Company','Company Status',
        ...(result.sections.includes('people_coverage') ? [
          'Owners','Managers','Technician Accounts','Technician Roster','Assigned Technicians','Unassigned Technicians','Manager Coverage %','Account Coverage %'
        ] : []),
        ...(result.sections.includes('engagement') ? [
          'Technician Conversations','Manager Conversations','Owner Conversations','Active Technicians','Technician Adoption %','Last Activity'
        ] : []),
        ...(result.sections.includes('jurisdictions_trades') ? ['Trades','Configured Jurisdictions','Jurisdiction Usage'] : []),
        ...(result.sections.includes('attention') ? ['Needs Attention','Attention Signals'] : []),
      ]
      exportRows = (result.rows as CompanyPerformanceRow[]).map((row) => [
        row.companyName,
        row.companyStatus,
        ...(result.sections.includes('people_coverage') ? [
          row.peopleCoverage.activeUsers.owners,
          row.peopleCoverage.activeUsers.managers,
          row.peopleCoverage.activeUsers.technicians,
          row.peopleCoverage.rosterTechnicians,
          row.peopleCoverage.assignedTechnicians,
          row.peopleCoverage.unassignedTechnicians,
          row.peopleCoverage.managerCoveragePct,
          row.peopleCoverage.accountCoveragePct,
        ] : []),
        ...(result.sections.includes('engagement') ? [
          row.engagement.technicianConversations,
          row.engagement.managerConversations,
          row.engagement.ownerConversations,
          row.engagement.activeTechnicians,
          row.engagement.technicianAdoptionPct,
          row.engagement.lastActivityAt || '',
        ] : []),
        ...(result.sections.includes('jurisdictions_trades') ? [
          row.configuration.trades.join('; '),
          row.configuration.jurisdictions.join('; '),
          Object.entries(row.configuration.jurisdictionUsage).map(([name,count]) => `${name}: ${count}`).join('; '),
        ] : []),
        ...(result.sections.includes('attention') ? [
          row.attention.needsAttention ? 'Yes' : 'No',
          row.attention.signals.join('; '),
        ] : []),
      ])
    } else if (result.reportType === 'ai_usage_cost') {
      headers = [
        'Company','Company Status',
        ...(result.sections.includes('token_usage') ? [
          'AI Calls','Input Tokens','Cached Input Tokens','Output Tokens','Total Tokens','Last AI Usage'
        ] : []),
        ...(result.sections.includes('features_models') ? ['Features','Models'] : []),
        ...(result.sections.includes('search_usage') ? ['Web Searches','File Searches'] : []),
      ]
      exportRows = (result.rows as AIUsageCostRow[]).map((row) => [
        row.companyName,
        row.companyStatus,
        ...(result.sections.includes('token_usage') ? [
          row.usage.calls,
          row.usage.inputTokens,
          row.usage.cachedInputTokens,
          row.usage.outputTokens,
          row.usage.totalTokens,
          row.usage.lastUsageAt || '',
        ] : []),
        ...(result.sections.includes('features_models') ? [
          row.features.map((item) => `${item.key}: ${item.calls} calls / ${item.totalTokens} tokens`).join('; '),
          row.models.map((item) => `${item.key}: ${item.calls} calls / ${item.totalTokens} tokens`).join('; '),
        ] : []),
        ...(result.sections.includes('search_usage') ? [
          row.usage.webSearchCalls,
          row.usage.fileSearchCalls,
        ] : []),
      ])
    } else if (result.reportType === 'learning_quality') {
      headers = [
        'Company','Company Status',
        ...(result.sections.includes('conversation_quality') ? [
          'Feedback','Helpful','Not Helpful','Feedback Requests','Responded Requests','Audit Flags','Open Flags','Audit Reviews'
        ] : []),
        ...(result.sections.includes('corrections_guidance') ? ['Corrected Reviews','Incorrect Reviews'] : []),
        'Needs Attention','Attention Signals'
      ]
      exportRows = (result.rows as LearningQualityRow[]).map((row) => [
        row.companyName,
        row.companyStatus,
        ...(result.sections.includes('conversation_quality') ? [
          row.quality.feedbackCount,
          row.quality.helpful,
          row.quality.notHelpful,
          row.quality.feedbackRequests,
          row.quality.respondedRequests,
          row.quality.auditFlags,
          row.quality.openFlags,
          row.quality.auditReviews,
        ] : []),
        ...(result.sections.includes('corrections_guidance') ? [
          row.quality.corrected,
          row.quality.incorrect,
        ] : []),
        row.attention.needsAttention ? 'Yes' : 'No',
        row.attention.signals.join('; '),
      ])
    } else {
      return
    }

    const escape = (value: unknown) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text
    }

    const csv = [headers, ...exportRows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `craftcompass-${result.reportType.replaceAll('_','-')}-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <PlatformAdminShell maxWidth={1380}>
      <div style={headerRowStyle}>
        <div>
          <div style={eyebrowStyle}>CraftCompass Platform</div>
          <h1 style={{ margin:'7px 0 7px', fontSize:34 }}>Report Center</h1>
          <p style={subtleStyle}>Reusable report definitions, current-data runs, exports, and execution history.</p>
        </div>
        <button type="button" onClick={newReport} style={secondaryButtonStyle}>+ New report</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={statusStyle}>{status}</div>}

      <div style={familyGridStyle}>
        {catalog.map((item) => (
          <button
            key={item.type}
            type="button"
            disabled={item.status !== 'live'}
            onClick={() => chooseFamily(item)}
            style={{
              ...familyCardStyle,
              opacity: item.status === 'live' ? 1 : 0.58,
              cursor: item.status === 'live' ? 'pointer' : 'default',
              borderColor: reportType === item.type ? '#086195' : '#dbe3ec',
            }}
          >
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <strong>{item.label}</strong>
              <span style={item.status === 'live' ? liveBadgeStyle : plannedBadgeStyle}>{item.status === 'live' ? 'Live' : 'Planned'}</span>
            </div>
            <div style={{ marginTop:7, color:'#64748b', fontSize:11, lineHeight:1.45 }}>{item.description}</div>
          </button>
        ))}
      </div>

      <section style={{ ...cardStyle, marginTop:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={sectionHeadingStyle}>{selectedDefinitionId ? 'Edit saved report' : 'Build report'}</div>
            <div style={subtleStyle}>{activeCatalogItem?.label || 'Report'} · schema v{activeCatalogItem?.schemaVersion || 1}</div>
          </div>
          {selectedDefinitionId && <span style={editingBadgeStyle}>Editing saved definition</span>}
        </div>

        <div style={builderGridStyle}>
          <label style={labelStyle}>
            Company scope
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} style={inputStyle}>
              <option value="">All companies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Date range
            <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} style={inputStyle}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">Month to date</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          {(activeCatalogItem?.filters || []).filter((filter) => filter.type === 'select').map((filter) => (
            <label key={filter.key} style={labelStyle}>
              {filter.label}
              <select
                value={String(filterValues[filter.key] ?? filter.defaultValue ?? '')}
                onChange={(event) => setFilterValues((current) => ({ ...current, [filter.key]: event.target.value }))}
                style={inputStyle}
              >
                {(filter.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}

          {datePreset === 'custom' && (
            <>
              <label style={labelStyle}>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={inputStyle} /></label>
              <label style={labelStyle}>End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={inputStyle} /></label>
            </>
          )}
        </div>

        {(activeCatalogItem?.filters || []).filter((filter) => filter.type === 'boolean').map((filter) => (
          <label key={filter.key} style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={Boolean(filterValues[filter.key] ?? filter.defaultValue ?? false)}
              onChange={(event) => setFilterValues((current) => ({ ...current, [filter.key]: event.target.checked }))}
            />
            <span>
              <strong>{filter.label}</strong>
              <small>{filter.key === 'overPlanOnly'
                ? 'Useful for billing review and account follow-up.'
                : 'Show only companies with one or more report attention signals.'}</small>
            </span>
          </label>
        ))}

        <div style={{ marginTop:18, fontSize:13, fontWeight:850 }}>Include sections</div>
        <div style={sectionGridStyle}>
          {(activeCatalogItem?.sections || []).map((section) => {
            const active = sections.includes(section.key)
            return (
              <button key={section.key} type="button" onClick={() => toggleSection(section.key)} style={{ ...sectionButtonStyle, borderColor: active ? '#086195' : '#dbe3ec', background: active ? '#effaff' : '#fff' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                  <span style={{ fontWeight:850 }}>{section.label}</span>
                  <span style={{ ...checkPillStyle, background: active ? '#082B4D' : '#cbd5e1' }}>{active ? '✓' : ''}</span>
                </div>
                <div style={{ marginTop:5, color:'#64748b', fontSize:11, lineHeight:1.45 }}>{section.description}</div>
              </button>
            )
          })}
        </div>

        <div style={builderActionsStyle}>
          <label style={{ ...labelStyle, flex:'1 1 260px', margin:0 }}>
            Report name
            <input value={reportName} onChange={(event) => setReportName(event.target.value)} maxLength={120} style={inputStyle} />
          </label>
          {selectedDefinitionId && (
            <button type="button" onClick={() => void saveDefinition(true)} disabled={saving || loading} style={secondaryButtonStyle}>
              Save as new
            </button>
          )}
          <button type="button" onClick={() => void saveDefinition(false)} disabled={saving || loading} style={secondaryButtonStyle}>
            {saving ? 'Saving…' : selectedDefinitionId ? 'Update saved report' : 'Save report'}
          </button>
          <button type="button" onClick={() => void executeReport()} disabled={running || loading} style={primaryButtonStyle}>
            {running ? 'Building report…' : 'Run report'}
          </button>
        </div>
      </section>

      {result && (
        <section style={{ ...cardStyle, marginTop:16 }}>
          <div style={resultHeaderStyle}>
            <div>
              <div style={sectionHeadingStyle}>{resultCatalogItem?.label || 'Report'} results</div>
              <div style={subtleStyle}>
                {new Date(result.period.start).toLocaleDateString()} – {new Date(result.period.end).toLocaleDateString()} · generated {new Date(result.generatedAt).toLocaleString()}
              </div>
            </div>
            <button type="button" onClick={exportCsv} disabled={!result.rows.length} style={secondaryButtonStyle}>Export CSV</button>
          </div>

          <div style={summaryGridStyle}>
            {result.reportType === 'billing_usage' ? (
              <>
                <SummaryMetric label="Companies" value={result.summary.companies || 0} />
                <SummaryMetric label="Over plan" value={result.summary.overPlanCompanies || 0} />
                <SummaryMetric label="Active seats" value={result.summary.activeSeats || 0} />
                <SummaryMetric label="Conversations" value={result.summary.conversations || 0} />
                <SummaryMetric label="AI calls" value={result.summary.aiCalls || 0} />
                <SummaryMetric label="Tokens" value={result.summary.totalTokens || 0} format />
              </>
            ) : result.reportType === 'company_performance' ? (
              <>
                <SummaryMetric label="Companies" value={result.summary.companies || 0} />
                <SummaryMetric label="Need attention" value={result.summary.attentionCompanies || 0} />
                <SummaryMetric label="Active users" value={result.summary.activeUsers || 0} />
                <SummaryMetric label="Roster techs" value={result.summary.rosterTechnicians || 0} />
                <SummaryMetric label="Conversations" value={result.summary.conversations || 0} />
                <SummaryMetric label="Avg tech adoption" value={result.summary.avgTechnicianAdoptionPct || 0} suffix="%" />
                <SummaryMetric label="Unassigned techs" value={result.summary.unassignedTechnicians || 0} />
              </>
            ) : result.reportType === 'ai_usage_cost' ? (
              <>
                <SummaryMetric label="Companies" value={result.summary.companies || 0} />
                <SummaryMetric label="Using AI" value={result.summary.companiesWithUsage || 0} />
                <SummaryMetric label="AI calls" value={result.summary.aiCalls || 0} />
                <SummaryMetric label="Tokens" value={result.summary.totalTokens || 0} format />
                <SummaryMetric label="Cached tokens" value={result.summary.cachedInputTokens || 0} format />
                <SummaryMetric label="Web searches" value={result.summary.webSearchCalls || 0} />
                <SummaryMetric label="File searches" value={result.summary.fileSearchCalls || 0} />
                <SummaryMetric label="Models" value={result.summary.models || 0} />
              </>
            ) : (
              <>
                <SummaryMetric label="Companies" value={result.summary.companies || 0} />
                <SummaryMetric label="Need attention" value={result.summary.attentionCompanies || 0} />
                <SummaryMetric label="Helpful feedback" value={result.summary.helpfulFeedback || 0} />
                <SummaryMetric label="Audit reviews" value={result.summary.auditReviews || 0} />
                <SummaryMetric label="Corrected" value={result.summary.correctedReviews || 0} />
                <SummaryMetric label="Open flags" value={result.summary.openFlags || 0} />
                <SummaryMetric label="Active guidance" value={result.summary.activeGuidance || 0} />
                <SummaryMetric label="Verified sources" value={result.summary.verifiedSourcesCurrent || 0} />
              </>
            )}
          </div>

          {result.billingNote && <div style={infoStyle}><strong>Billing:</strong> {result.billingNote}</div>}
          {result.aiCostNote && <div style={infoStyle}><strong>AI cost:</strong> {result.aiCostNote}</div>}

          {result.reportType === 'learning_quality' && result.platform && (
            <div style={{ ...cardStyle, marginTop:14, background:'#f8fafc' }}>
              <div style={{ fontSize:14, fontWeight:900 }}>Platform learning & source health</div>
              <div style={subtleStyle}>These are platform-wide signals and are intentionally not assigned to an individual company.</div>
              <div style={summaryGridStyle}>
                {result.sections.includes('corrections_guidance') && (
                  <>
                    <SummaryMetric label="Guidance total" value={result.platform.guidance.total} />
                    <SummaryMetric label="Guidance active" value={result.platform.guidance.active} />
                  </>
                )}
                {result.sections.includes('source_health') && (
                  <>
                    <SummaryMetric label="Verified sources" value={result.platform.verifiedSources.total} />
                    <SummaryMetric label="Sources current" value={result.platform.verifiedSources.current} />
                    <SummaryMetric label="Source checks" value={result.platform.sourceChecks.total} />
                    <SummaryMetric label="Source issues" value={result.platform.sourceChecks.issues} />
                  </>
                )}
                {result.sections.includes('learning_runs') && (
                  <>
                    <SummaryMetric label="Learning runs" value={result.platform.learningRuns.total} />
                    <SummaryMetric label="Runs completed" value={result.platform.learningRuns.completed} />
                    <SummaryMetric label="Guidance generated" value={result.platform.learningRuns.guidanceCreated} />
                  </>
                )}
              </div>
            </div>
          )}

          <div style={reportTableWrapStyle}>
            {result.reportType === 'billing_usage' ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Company</th>
                    <th style={thStyle}>Plan</th>
                    {result.sections.includes('plan_seats') && <th style={thStyle}>Users / allowance</th>}
                    {result.sections.includes('activity') && <th style={thStyle}>Conversation activity</th>}
                    {result.sections.includes('ai_usage') && <th style={thStyle}>AI usage</th>}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as BillingUsageRow[]).map((row) => (
                    <tr key={row.companyId}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight:850 }}>{row.companyName}</div>
                        <div style={cellSubtleStyle}>{row.companyStatus} · {row.accountType}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight:800 }}>{row.planCode}</div>
                        <div style={cellSubtleStyle}>{row.subscriptionStatus}</div>
                        {row.overPlan && <span style={overPlanStyle}>Over plan</span>}
                      </td>
                      {result.sections.includes('plan_seats') && (
                        <td style={tdStyle}>
                          <div>Owners: <strong>{row.used.owners}</strong> / {row.included.owners} {row.overage.owners ? <em style={overageStyle}>+{row.overage.owners}</em> : null}</div>
                          <div>Managers: <strong>{row.used.managers}</strong> / {row.included.managers} {row.overage.managers ? <em style={overageStyle}>+{row.overage.managers}</em> : null}</div>
                          <div>Techs: <strong>{row.used.technicians}</strong> / {row.included.technicians} {row.overage.technicians ? <em style={overageStyle}>+{row.overage.technicians}</em> : null}</div>
                        </td>
                      )}
                      {result.sections.includes('activity') && (
                        <td style={tdStyle}>
                          <div>Technician: <strong>{row.activity.technicianConversations}</strong></div>
                          <div>Manager: <strong>{row.activity.managerConversations}</strong></div>
                          <div>Owner: <strong>{row.activity.ownerConversations}</strong></div>
                        </td>
                      )}
                      {result.sections.includes('ai_usage') && (
                        <td style={tdStyle}>
                          <div><strong>{row.aiUsage.calls.toLocaleString()}</strong> calls</div>
                          <div><strong>{row.aiUsage.totalTokens.toLocaleString()}</strong> tokens</div>
                          <div style={cellSubtleStyle}>{row.aiUsage.webSearchCalls} web · {row.aiUsage.fileSearchCalls} file searches</div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!result.rows.length && <tr><td colSpan={5} style={{ ...tdStyle, color:'#64748b' }}>No companies matched this report.</td></tr>}
                </tbody>
              </table>
            ) : result.reportType === 'company_performance' ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Company</th>
                    {result.sections.includes('people_coverage') && <th style={thStyle}>People & coverage</th>}
                    {result.sections.includes('engagement') && <th style={thStyle}>Engagement</th>}
                    {result.sections.includes('jurisdictions_trades') && <th style={thStyle}>Jurisdictions & trades</th>}
                    {result.sections.includes('attention') && <th style={thStyle}>Attention</th>}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as CompanyPerformanceRow[]).map((row) => (
                    <tr key={row.companyId}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight:850 }}>{row.companyName}</div>
                        <div style={cellSubtleStyle}>{row.companyStatus} · {row.accountType}</div>
                      </td>
                      {result.sections.includes('people_coverage') && (
                        <td style={tdStyle}>
                          <div>Users: <strong>{row.peopleCoverage.activeUsers.owners}</strong> owner · <strong>{row.peopleCoverage.activeUsers.managers}</strong> manager · <strong>{row.peopleCoverage.activeUsers.technicians}</strong> tech</div>
                          <div>Roster techs: <strong>{row.peopleCoverage.rosterTechnicians}</strong></div>
                          <div>Manager coverage: <strong>{row.peopleCoverage.managerCoveragePct}%</strong></div>
                          <div style={cellSubtleStyle}>Account coverage: {row.peopleCoverage.accountCoveragePct}% · {row.peopleCoverage.unassignedTechnicians} unassigned</div>
                        </td>
                      )}
                      {result.sections.includes('engagement') && (
                        <td style={tdStyle}>
                          <div>Tech: <strong>{row.engagement.technicianConversations}</strong> · Manager: <strong>{row.engagement.managerConversations}</strong> · Owner: <strong>{row.engagement.ownerConversations}</strong></div>
                          <div>Active techs: <strong>{row.engagement.activeTechnicians}</strong> · Adoption: <strong>{row.engagement.technicianAdoptionPct}%</strong></div>
                          <div style={cellSubtleStyle}>Last activity: {row.engagement.lastActivityAt ? new Date(row.engagement.lastActivityAt).toLocaleString() : 'None in period'}</div>
                        </td>
                      )}
                      {result.sections.includes('jurisdictions_trades') && (
                        <td style={tdStyle}>
                          <div><strong>Trades:</strong> {row.configuration.trades.length ? row.configuration.trades.join(', ') : 'None configured'}</div>
                          <div style={{ marginTop:4 }}><strong>Jurisdictions:</strong> {row.configuration.jurisdictions.length ? row.configuration.jurisdictions.join(' · ') : 'None configured'}</div>
                          <div style={cellSubtleStyle}>
                            Usage: {Object.entries(row.configuration.jurisdictionUsage).length
                              ? Object.entries(row.configuration.jurisdictionUsage).map(([name,count]) => `${name}: ${count}`).join(' · ')
                              : 'No technician jurisdiction activity'}
                          </div>
                        </td>
                      )}
                      {result.sections.includes('attention') && (
                        <td style={tdStyle}>
                          {row.attention.needsAttention
                            ? <div style={{ display:'grid', gap:4 }}>{row.attention.signals.map((signal) => <span key={signal} style={attentionSignalStyle}>{signal}</span>)}</div>
                            : <span style={healthySignalStyle}>No attention signals</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!result.rows.length && <tr><td colSpan={5} style={{ ...tdStyle, color:'#64748b' }}>No companies matched this report.</td></tr>}
                </tbody>
              </table>
            ) : result.reportType === 'ai_usage_cost' ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Company</th>
                    {result.sections.includes('token_usage') && <th style={thStyle}>Token usage</th>}
                    {result.sections.includes('features_models') && <th style={thStyle}>Features & models</th>}
                    {result.sections.includes('search_usage') && <th style={thStyle}>Search usage</th>}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as AIUsageCostRow[]).map((row) => (
                    <tr key={row.companyId}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight:850 }}>{row.companyName}</div>
                        <div style={cellSubtleStyle}>{row.companyStatus} · {row.accountType}</div>
                      </td>
                      {result.sections.includes('token_usage') && (
                        <td style={tdStyle}>
                          <div><strong>{row.usage.calls.toLocaleString()}</strong> calls · <strong>{row.usage.totalTokens.toLocaleString()}</strong> total tokens</div>
                          <div>Input: <strong>{row.usage.inputTokens.toLocaleString()}</strong> · Cached: <strong>{row.usage.cachedInputTokens.toLocaleString()}</strong> · Output: <strong>{row.usage.outputTokens.toLocaleString()}</strong></div>
                          <div style={cellSubtleStyle}>Last AI usage: {row.usage.lastUsageAt ? new Date(row.usage.lastUsageAt).toLocaleString() : 'None in period'}</div>
                        </td>
                      )}
                      {result.sections.includes('features_models') && (
                        <td style={tdStyle}>
                          <div><strong>Features:</strong> {row.features.length ? row.features.map((item) => `${item.key} (${item.calls})`).join(' · ') : 'No usage'}</div>
                          <div style={{ marginTop:4 }}><strong>Models:</strong> {row.models.length ? row.models.map((item) => `${item.key} (${item.calls})`).join(' · ') : 'No usage'}</div>
                        </td>
                      )}
                      {result.sections.includes('search_usage') && (
                        <td style={tdStyle}>
                          <div>Web searches: <strong>{row.usage.webSearchCalls.toLocaleString()}</strong></div>
                          <div>File searches: <strong>{row.usage.fileSearchCalls.toLocaleString()}</strong></div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!result.rows.length && <tr><td colSpan={4} style={{ ...tdStyle, color:'#64748b' }}>No companies matched this report.</td></tr>}
                </tbody>
              </table>
            ) : result.reportType === 'learning_quality' ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Company</th>
                    {result.sections.includes('conversation_quality') && <th style={thStyle}>Conversation quality</th>}
                    {result.sections.includes('corrections_guidance') && <th style={thStyle}>Corrections</th>}
                    <th style={thStyle}>Attention</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as LearningQualityRow[]).map((row) => (
                    <tr key={row.companyId}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight:850 }}>{row.companyName}</div>
                        <div style={cellSubtleStyle}>{row.companyStatus} · {row.accountType}</div>
                      </td>
                      {result.sections.includes('conversation_quality') && (
                        <td style={tdStyle}>
                          <div>Feedback: <strong>{row.quality.feedbackCount}</strong> · Helpful: <strong>{row.quality.helpful}</strong> · Other: <strong>{row.quality.notHelpful}</strong></div>
                          <div>Requests: <strong>{row.quality.feedbackRequests}</strong> · Responded: <strong>{row.quality.respondedRequests}</strong></div>
                          <div>Flags: <strong>{row.quality.auditFlags}</strong> · Open/confirmed: <strong>{row.quality.openFlags}</strong> · Reviews: <strong>{row.quality.auditReviews}</strong></div>
                        </td>
                      )}
                      {result.sections.includes('corrections_guidance') && (
                        <td style={tdStyle}>
                          <div>Corrected: <strong>{row.quality.corrected}</strong></div>
                          <div>Incorrect: <strong>{row.quality.incorrect}</strong></div>
                        </td>
                      )}
                      <td style={tdStyle}>
                        {row.attention.needsAttention
                          ? <div style={{ display:'grid', gap:4 }}>{row.attention.signals.map((signal) => <span key={signal} style={attentionSignalStyle}>{signal}</span>)}</div>
                          : <span style={healthySignalStyle}>No quality attention signals</span>}
                      </td>
                    </tr>
                  ))}
                  {!result.rows.length && <tr><td colSpan={4} style={{ ...tdStyle, color:'#64748b' }}>No companies matched this report.</td></tr>}
                </tbody>
              </table>
            ) : (
              <div style={emptyStyle}>This report family does not have a results renderer yet.</div>
            )}
          </div>
        </section>
      )}

      <div style={twoColumnStyle}>
        <section style={cardStyle}>
          <div style={sectionHeadingStyle}>Saved reports</div>
          <div style={subtleStyle}>Definitions store configuration, not stale results. Every run uses current platform data.</div>

          <div style={{ display:'grid', gap:9, marginTop:14 }}>
            {definitions.map((definition) => {
              const company = companies.find((item) => item.id === definition.scope_company_id)
              const family = catalog.find((item) => item.type === definition.report_type)
              return (
                <div key={definition.id} style={savedRowStyle}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:850 }}>{definition.name}</div>
                    <div style={cellSubtleStyle}>
                      {family?.label || definition.report_type} · {company?.name || 'All companies'} · {String(definition.filters?.datePreset || '30d')} · v{definition.schema_version}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                    <button type="button" onClick={() => void runSavedDefinition(definition)} disabled={running} style={secondaryButtonStyle}>Run</button>
                    <button type="button" onClick={() => loadDefinition(definition)} style={secondaryButtonStyle}>Edit</button>
                    <button type="button" onClick={() => void archiveDefinition(definition)} style={dangerButtonStyle}>Archive</button>
                  </div>
                </div>
              )
            })}
            {!loading && definitions.length === 0 && <div style={emptyStyle}>No saved reports yet.</div>}
            {loading && <div style={emptyStyle}>Loading reports…</div>}
          </div>
        </section>

        <section style={cardStyle}>
          <div style={sectionHeadingStyle}>Recent runs</div>
          <div style={subtleStyle}>Execution history is retained without storing full report row payloads.</div>

          <div style={{ display:'grid', gap:8, marginTop:14 }}>
            {recentRuns.slice(0, 12).map((run) => {
              const company = companies.find((item) => item.id === run.scope_company_id)
              const definition = definitions.find((item) => item.id === run.definition_id)
              return (
                <div key={run.id} style={runRowStyle}>
                  <div>
                    <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
                      <strong>{definition?.name || catalog.find((item) => item.type === run.report_type)?.label || run.report_type}</strong>
                      <span style={run.status === 'completed' ? completedBadgeStyle : run.status === 'failed' ? failedBadgeStyle : runningBadgeStyle}>{run.status}</span>
                    </div>
                    <div style={cellSubtleStyle}>
                      {company?.name || 'All companies'} · {new Date(run.started_at).toLocaleString()} · {run.row_count} row{run.row_count === 1 ? '' : 's'}
                    </div>
                    {run.error_text && <div style={{ marginTop:4, color:'#991b1b', fontSize:10 }}>{run.error_text}</div>}
                  </div>
                </div>
              )
            })}
            {!loading && recentRuns.length === 0 && <div style={emptyStyle}>No report runs yet.</div>}
          </div>
        </section>
      </div>
    </PlatformAdminShell>
  )
}

function SummaryMetric({ label, value, format = false, suffix = '' }: { label: string; value: number; format?: boolean; suffix?: string }) {
  return (
    <div style={summaryMetricStyle}>
      <div style={{ fontSize:22, fontWeight:900 }}>{format ? value.toLocaleString() : value}{suffix}</div>
      <div style={{ marginTop:3, color:'#64748b', fontSize:10, fontWeight:800 }}>{label}</div>
    </div>
  )
}

const headerRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:18, flexWrap:'wrap' }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:13, lineHeight:1.45 }
const familyGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginTop:22 }
const familyCardStyle: React.CSSProperties = { padding:14, border:'1px solid #dbe3ec', borderRadius:12, background:'#fff', textAlign:'left', fontFamily:'inherit', color:'#172033' }
const liveBadgeStyle: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#ecfdf5', color:'#166534', fontSize:10, fontWeight:900, textTransform:'uppercase' }
const plannedBadgeStyle: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#f1f5f9', color:'#64748b', fontSize:10, fontWeight:900, textTransform:'uppercase' }
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const sectionHeadingStyle: React.CSSProperties = { fontSize:19, fontWeight:900 }
const builderGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginTop:14 }
const labelStyle: React.CSSProperties = { display:'grid', gap:6, color:'#334155', fontSize:12, fontWeight:800 }
const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', border:'1px solid #cbd5e1', borderRadius:9, padding:'10px 11px', background:'#fff', color:'#172033', fontSize:13 }
const checkboxRowStyle: React.CSSProperties = { display:'flex', alignItems:'flex-start', gap:9, marginTop:14, padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc', fontSize:12, cursor:'pointer' }
const sectionGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:9, marginTop:9 }
const sectionButtonStyle: React.CSSProperties = { border:'1px solid #dbe3ec', borderRadius:11, padding:12, textAlign:'left', fontFamily:'inherit', color:'#172033', cursor:'pointer' }
const checkPillStyle: React.CSSProperties = { width:22, height:22, display:'grid', placeItems:'center', borderRadius:999, color:'#fff', fontSize:12, fontWeight:900 }
const builderActionsStyle: React.CSSProperties = { display:'flex', gap:9, alignItems:'flex-end', flexWrap:'wrap', marginTop:18, paddingTop:16, borderTop:'1px solid #e2e8f0' }
const primaryButtonStyle: React.CSSProperties = { border:0, borderRadius:9, padding:'11px 15px', background:'#082B4D', color:'#fff', fontSize:13, fontWeight:850, cursor:'pointer' }
const secondaryButtonStyle: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#172033', fontSize:12, fontWeight:800, cursor:'pointer' }
const dangerButtonStyle: React.CSSProperties = { border:'1px solid #fecaca', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#b91c1c', fontSize:12, fontWeight:800, cursor:'pointer' }
const editingBadgeStyle: React.CSSProperties = { padding:'5px 8px', borderRadius:999, background:'#eff6ff', color:'#1d4ed8', fontSize:10, fontWeight:900, textTransform:'uppercase' }
const resultHeaderStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }
const summaryGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:8, marginTop:14 }
const summaryMetricStyle: React.CSSProperties = { padding:'11px 12px', border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }
const infoStyle: React.CSSProperties = { marginTop:10, padding:'9px 11px', border:'1px solid #bae6fd', borderRadius:9, background:'#f0f9ff', color:'#075985', fontSize:11, lineHeight:1.45 }
const reportTableWrapStyle: React.CSSProperties = { overflowX:'auto', marginTop:14, border:'1px solid #e2e8f0', borderRadius:11 }
const tableStyle: React.CSSProperties = { width:'100%', minWidth:840, borderCollapse:'collapse', fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.55 }
const cellSubtleStyle: React.CSSProperties = { marginTop:3, color:'#64748b', fontSize:11 }
const overPlanStyle: React.CSSProperties = { display:'inline-block', marginTop:5, padding:'3px 6px', borderRadius:999, background:'#fff7ed', color:'#9a3412', fontSize:9, fontWeight:900, textTransform:'uppercase' }
const overageStyle: React.CSSProperties = { color:'#9a3412', fontStyle:'normal', fontWeight:900 }
const attentionSignalStyle: React.CSSProperties = { display:'inline-block', padding:'4px 6px', borderRadius:7, background:'#fff7ed', color:'#9a3412', fontSize:10, fontWeight:750 }
const healthySignalStyle: React.CSSProperties = { display:'inline-block', padding:'4px 6px', borderRadius:7, background:'#ecfdf5', color:'#166534', fontSize:10, fontWeight:800 }
const twoColumnStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))', gap:16, marginTop:16 }
const savedRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:12, border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }
const runRowStyle: React.CSSProperties = { padding:11, border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }
const completedBadgeStyle: React.CSSProperties = { padding:'3px 6px', borderRadius:999, background:'#ecfdf5', color:'#166534', fontSize:9, fontWeight:900, textTransform:'uppercase' }
const failedBadgeStyle: React.CSSProperties = { padding:'3px 6px', borderRadius:999, background:'#fef2f2', color:'#991b1b', fontSize:9, fontWeight:900, textTransform:'uppercase' }
const runningBadgeStyle: React.CSSProperties = { padding:'3px 6px', borderRadius:999, background:'#eff6ff', color:'#1d4ed8', fontSize:9, fontWeight:900, textTransform:'uppercase' }
const emptyStyle: React.CSSProperties = { padding:14, border:'1px dashed #cbd5e1', borderRadius:10, color:'#64748b', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
const statusStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
