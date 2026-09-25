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

type ReportDefinition = {
  id: string
  name: string
  report_type: string
  scope_company_id: string | null
  filters: Record<string, unknown>
  sections: string[]
  created_at: string
  updated_at: string
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

type ReportResult = {
  reportType: string
  generatedAt: string
  period: { preset: string; start: string; end: string }
  sections: string[]
  scopeCompanyId: string | null
  rows: BillingUsageRow[]
  billingNote?: string
  aiCostNote?: string
}

const SECTION_OPTIONS = [
  { key: 'plan_seats', label: 'Plan & seats', description: 'Plan, subscription status, included users, active users, and overages.' },
  { key: 'activity', label: 'Activity', description: 'Technician, manager, and owner conversation activity for the reporting period.' },
  { key: 'ai_usage', label: 'AI usage', description: 'AI calls, tokens, web searches, and file searches attributed to each company.' },
]

export default function ReportsPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([])
  const [reportType, setReportType] = useState('billing_usage')
  const [companyId, setCompanyId] = useState('')
  const [datePreset, setDatePreset] = useState('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sections, setSections] = useState<string[]>(['plan_seats','activity','ai_usage'])
  const [reportName, setReportName] = useState('Billing & Usage')
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
      setCompanies(data.companies || [])
      setDefinitions(data.definitions || [])
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filters = useMemo(() => ({
    datePreset,
    ...(datePreset === 'custom' ? { startDate, endDate } : {}),
  }), [datePreset, startDate, endDate])

  const runReport = async () => {
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
        body: JSON.stringify({ reportType, companyId: companyId || null, filters, sections }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not run report.')
      setResult(data)
      setStatus(`Report generated · ${data.rows?.length || 0} compan${data.rows?.length === 1 ? 'y' : 'ies'}`)
    } catch (runError: any) {
      setError(runError?.message || 'Could not run report.')
    } finally {
      setRunning(false)
    }
  }

  const saveDefinition = async () => {
    if (!reportName.trim()) {
      setError('Enter a report name before saving.')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const token = await getToken()
      const response = await fetch('/api/platform-admin/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: reportName.trim(),
          reportType,
          companyId: companyId || null,
          filters,
          sections,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save report.')
      setDefinitions((current) => [data.definition, ...current])
      setStatus('Report definition saved.')
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save report.')
    } finally {
      setSaving(false)
    }
  }

  const loadDefinition = (definition: ReportDefinition) => {
    setReportType(definition.report_type)
    setCompanyId(definition.scope_company_id || '')
    setDatePreset(String(definition.filters?.datePreset || '30d'))
    setStartDate(String(definition.filters?.startDate || ''))
    setEndDate(String(definition.filters?.endDate || ''))
    setSections(Array.isArray(definition.sections) && definition.sections.length ? definition.sections : ['plan_seats','activity','ai_usage'])
    setReportName(definition.name)
    setResult(null)
    setStatus(`Loaded “${definition.name}”. Run it to refresh the data.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteDefinition = async (definition: ReportDefinition) => {
    if (!window.confirm(`Delete saved report “${definition.name}”?`)) return
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`/api/platform-admin/reports?id=${encodeURIComponent(definition.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not delete report.')
      setDefinitions((current) => current.filter((item) => item.id !== definition.id))
      setStatus('Saved report deleted.')
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete report.')
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

    const headers = [
      'Company','Plan','Subscription Status',
      ...(sections.includes('plan_seats') ? [
        'Owners Used','Owners Included','Owners Overage',
        'Managers Used','Managers Included','Managers Overage',
        'Technicians Used','Technicians Included','Technicians Overage','Over Plan'
      ] : []),
      ...(sections.includes('activity') ? ['Technician Conversations','Manager Conversations','Owner Conversations'] : []),
      ...(sections.includes('ai_usage') ? ['AI Calls','Total Tokens','Cached Input Tokens','Web Searches','File Searches'] : []),
    ]

    const rows = result.rows.map((row) => [
      row.companyName,
      row.planCode,
      row.subscriptionStatus,
      ...(sections.includes('plan_seats') ? [
        row.used.owners,row.included.owners,row.overage.owners,
        row.used.managers,row.included.managers,row.overage.managers,
        row.used.technicians,row.included.technicians,row.overage.technicians,
        row.overPlan ? 'Yes' : 'No'
      ] : []),
      ...(sections.includes('activity') ? [
        row.activity.technicianConversations,
        row.activity.managerConversations,
        row.activity.ownerConversations,
      ] : []),
      ...(sections.includes('ai_usage') ? [
        row.aiUsage.calls,
        row.aiUsage.totalTokens,
        row.aiUsage.cachedInputTokens,
        row.aiUsage.webSearchCalls,
        row.aiUsage.fileSearchCalls,
      ] : []),
    ])

    const escape = (value: unknown) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text
    }

    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `craftcompass-billing-usage-${new Date().toISOString().slice(0,10)}.csv`
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
          <p style={subtleStyle}>Build, save, rerun, and export platform reports without creating one-off admin pages.</p>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={statusStyle}>{status}</div>}

      <div style={familyGridStyle}>
        <FamilyCard title="Billing & Usage" description="Plans, allowances, overages, activity, and company-attributed AI usage." active />
        <FamilyCard title="Company Performance" description="Adoption, company health, jurisdiction activity, and trends." />
        <FamilyCard title="AI Usage & Cost" description="Feature-level AI consumption, models, searches, and cost analysis." />
        <FamilyCard title="Learning & Quality" description="Helpful feedback, reviews, guidance, and verified-source health." />
        <FamilyCard title="User Activity" description="Owner, manager, and technician usage across the platform." />
      </div>

      <section style={{ ...cardStyle, marginTop:16 }}>
        <div style={sectionHeadingStyle}>New report</div>
        <div style={builderGridStyle}>
          <label style={labelStyle}>
            Report family
            <select value={reportType} onChange={(event) => setReportType(event.target.value)} style={inputStyle}>
              <option value="billing_usage">Billing & Usage</option>
            </select>
          </label>

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

          {datePreset === 'custom' && (
            <>
              <label style={labelStyle}>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={inputStyle} /></label>
              <label style={labelStyle}>End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={inputStyle} /></label>
            </>
          )}
        </div>

        <div style={{ marginTop:18, fontSize:13, fontWeight:850 }}>Include sections</div>
        <div style={sectionGridStyle}>
          {SECTION_OPTIONS.map((section) => {
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
            Saved report name
            <input value={reportName} onChange={(event) => setReportName(event.target.value)} maxLength={120} style={inputStyle} />
          </label>
          <button type="button" onClick={() => void saveDefinition()} disabled={saving || loading} style={secondaryButtonStyle}>
            {saving ? 'Saving…' : 'Save report'}
          </button>
          <button type="button" onClick={() => void runReport()} disabled={running || loading} style={primaryButtonStyle}>
            {running ? 'Building report…' : 'Run report'}
          </button>
        </div>
      </section>

      {result && (
        <section style={{ ...cardStyle, marginTop:16 }}>
          <div style={resultHeaderStyle}>
            <div>
              <div style={sectionHeadingStyle}>Billing & Usage report</div>
              <div style={subtleStyle}>
                {new Date(result.period.start).toLocaleDateString()} – {new Date(result.period.end).toLocaleDateString()} · {result.rows.length} compan{result.rows.length === 1 ? 'y' : 'ies'}
              </div>
            </div>
            <button type="button" onClick={exportCsv} disabled={!result.rows.length} style={secondaryButtonStyle}>Export CSV</button>
          </div>

          {result.billingNote && <div style={infoStyle}><strong>Billing:</strong> {result.billingNote}</div>}
          {result.aiCostNote && <div style={infoStyle}><strong>AI cost:</strong> {result.aiCostNote}</div>}

          <div style={reportTableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Company</th>
                  <th style={thStyle}>Plan</th>
                  {sections.includes('plan_seats') && <th style={thStyle}>Users / allowance</th>}
                  {sections.includes('activity') && <th style={thStyle}>Conversation activity</th>}
                  {sections.includes('ai_usage') && <th style={thStyle}>AI usage</th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
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
                    {sections.includes('plan_seats') && (
                      <td style={tdStyle}>
                        <div>Owners: <strong>{row.used.owners}</strong> / {row.included.owners} {row.overage.owners ? <em style={overageStyle}>+{row.overage.owners}</em> : null}</div>
                        <div>Managers: <strong>{row.used.managers}</strong> / {row.included.managers} {row.overage.managers ? <em style={overageStyle}>+{row.overage.managers}</em> : null}</div>
                        <div>Techs: <strong>{row.used.technicians}</strong> / {row.included.technicians} {row.overage.technicians ? <em style={overageStyle}>+{row.overage.technicians}</em> : null}</div>
                      </td>
                    )}
                    {sections.includes('activity') && (
                      <td style={tdStyle}>
                        <div>Technician: <strong>{row.activity.technicianConversations}</strong></div>
                        <div>Manager: <strong>{row.activity.managerConversations}</strong></div>
                        <div>Owner: <strong>{row.activity.ownerConversations}</strong></div>
                      </td>
                    )}
                    {sections.includes('ai_usage') && (
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
          </div>
        </section>
      )}

      <section style={{ ...cardStyle, marginTop:16 }}>
        <div style={sectionHeadingStyle}>Saved reports</div>
        <div style={subtleStyle}>Saved definitions keep the report scope and filters. Running one always uses current platform data.</div>

        <div style={{ display:'grid', gap:9, marginTop:14 }}>
          {definitions.map((definition) => {
            const company = companies.find((item) => item.id === definition.scope_company_id)
            return (
              <div key={definition.id} style={savedRowStyle}>
                <div>
                  <div style={{ fontWeight:850 }}>{definition.name}</div>
                  <div style={cellSubtleStyle}>
                    Billing & Usage · {company?.name || 'All companies'} · {String(definition.filters?.datePreset || '30d')}
                  </div>
                </div>
                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                  <button type="button" onClick={() => loadDefinition(definition)} style={secondaryButtonStyle}>Load</button>
                  <button type="button" onClick={() => void deleteDefinition(definition)} style={dangerButtonStyle}>Delete</button>
                </div>
              </div>
            )
          })}
          {!loading && definitions.length === 0 && <div style={emptyStyle}>No saved reports yet.</div>}
          {loading && <div style={emptyStyle}>Loading reports…</div>}
        </div>
      </section>
    </PlatformAdminShell>
  )
}

function FamilyCard({ title, description, active = false }: { title: string; description: string; active?: boolean }) {
  return (
    <div style={{ ...familyCardStyle, opacity: active ? 1 : 0.58 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
        <strong>{title}</strong>
        <span style={active ? liveBadgeStyle : plannedBadgeStyle}>{active ? 'Live' : 'Planned'}</span>
      </div>
      <div style={{ marginTop:7, color:'#64748b', fontSize:11, lineHeight:1.45 }}>{description}</div>
    </div>
  )
}

const headerRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:18, flexWrap:'wrap' }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:13, lineHeight:1.45 }
const familyGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginTop:22 }
const familyCardStyle: React.CSSProperties = { padding:14, border:'1px solid #dbe3ec', borderRadius:12, background:'#fff' }
const liveBadgeStyle: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#ecfdf5', color:'#166534', fontSize:10, fontWeight:900, textTransform:'uppercase' }
const plannedBadgeStyle: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#f1f5f9', color:'#64748b', fontSize:10, fontWeight:900, textTransform:'uppercase' }
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const sectionHeadingStyle: React.CSSProperties = { fontSize:19, fontWeight:900 }
const builderGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginTop:14 }
const labelStyle: React.CSSProperties = { display:'grid', gap:6, color:'#334155', fontSize:12, fontWeight:800 }
const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', border:'1px solid #cbd5e1', borderRadius:9, padding:'10px 11px', background:'#fff', color:'#172033', fontSize:13 }
const sectionGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:9, marginTop:9 }
const sectionButtonStyle: React.CSSProperties = { border:'1px solid #dbe3ec', borderRadius:11, padding:12, textAlign:'left', fontFamily:'inherit', color:'#172033', cursor:'pointer' }
const checkPillStyle: React.CSSProperties = { width:22, height:22, display:'grid', placeItems:'center', borderRadius:999, color:'#fff', fontSize:12, fontWeight:900 }
const builderActionsStyle: React.CSSProperties = { display:'flex', gap:9, alignItems:'flex-end', flexWrap:'wrap', marginTop:18, paddingTop:16, borderTop:'1px solid #e2e8f0' }
const primaryButtonStyle: React.CSSProperties = { border:0, borderRadius:9, padding:'11px 15px', background:'#082B4D', color:'#fff', fontSize:13, fontWeight:850, cursor:'pointer' }
const secondaryButtonStyle: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#172033', fontSize:12, fontWeight:800, cursor:'pointer' }
const dangerButtonStyle: React.CSSProperties = { border:'1px solid #fecaca', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#b91c1c', fontSize:12, fontWeight:800, cursor:'pointer' }
const resultHeaderStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }
const infoStyle: React.CSSProperties = { marginTop:10, padding:'9px 11px', border:'1px solid #bae6fd', borderRadius:9, background:'#f0f9ff', color:'#075985', fontSize:11, lineHeight:1.45 }
const reportTableWrapStyle: React.CSSProperties = { overflowX:'auto', marginTop:14, border:'1px solid #e2e8f0', borderRadius:11 }
const tableStyle: React.CSSProperties = { width:'100%', minWidth:840, borderCollapse:'collapse', fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.55 }
const cellSubtleStyle: React.CSSProperties = { marginTop:3, color:'#64748b', fontSize:11 }
const overPlanStyle: React.CSSProperties = { display:'inline-block', marginTop:5, padding:'3px 6px', borderRadius:999, background:'#fff7ed', color:'#9a3412', fontSize:9, fontWeight:900, textTransform:'uppercase' }
const overageStyle: React.CSSProperties = { color:'#9a3412', fontStyle:'normal', fontWeight:900 }
const savedRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:12, border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }
const emptyStyle: React.CSSProperties = { padding:14, border:'1px dashed #cbd5e1', borderRadius:10, color:'#64748b', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
const statusStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
