'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import PlatformAdminShell from '../../platform-admin-shell'
import CompanyScopeEditor, { type JurisdictionValue } from '../../../components/company-scope-editor'
import {
  COMPANY_FEATURE_KEYS,
  normalizeCompanyFeatureFlags,
  type CompanyFeatureFlags,
} from '../../../lib/company-features'

type SeatCounts = { owners: number; managers: number; technicians: number }

type ControlData = {
  company: {
    id: string
    name: string
    account_type: string
    status: string
    timezone: string
    trades: string[]
    jurisdictions: { country: string; state: string; locality?: string }[]
    plan_code: string
    subscription_status: string
    seat_limits: SeatCounts
    feature_flags: CompanyFeatureFlags
  }
  seats: {
    included: SeatCounts
    limits: SeatCounts
    used: SeatCounts
    available: SeatCounts
    overage: SeatCounts
    overPlan: boolean
  }
  pendingInvites: number
  pendingInviteDetails: {
    profileId: string
    authUserId: string
    role: 'owner' | 'manager' | 'technician'
    name: string
    email: string
    invitedAt: string
  }[]
  usage: {
    calls: number
    totalTokens: number
    webSearchCalls: number
    fileSearchCalls: number
    windowDays: number
  }
  sourceCoverage: {
    country: string
    state: string
    locality?: string | null
    name: string
    verified: boolean
    codeFamilies: string[]
    lastVerifiedAt?: string | null
  }[]
  health: {
    tenantIsolation: string
    companyStatus: string
    sourceCoverageVerified: number
    sourceCoverageTotal: number
    overPlan: boolean
    overage: SeatCounts
  }
}

const featureLabels: Record<string, string> = {
  manager_search: 'Manager Search',
  manager_history: 'Manager History',
  manager_follow_up: 'Manager Follow-up',
  manager_technicians: 'Manager Technicians',
  manager_notes: 'Manager Notes',
  owner_overview: 'Owner Overview',
  owner_company: 'Owner Company',
  owner_assignments: 'Owner Assignments',
  owner_add_manager: 'Owner Add Manager',
  owner_add_technician: 'Owner Add Technician',
}

const featureDescriptions: Record<string, string> = {
  manager_search: 'Lets managers search company technician activity, conversations, reflections, and related management context.',
  manager_history: 'Shows managers their prior CraftCompass management conversations and generated responses.',
  manager_follow_up: 'Enables manager follow-up workflows for technician issues, coaching items, and unresolved actions.',
  manager_technicians: 'Lets managers view the technicians assigned to them and access technician-specific management context.',
  manager_notes: 'Allows managers to create and review private management notes tied to technicians.',
  owner_overview: 'Gives owners the company-level overview with team trends, activity, and management insight.',
  owner_company: 'Lets owners access company administration such as roster, company information, and account-level settings.',
  owner_assignments: 'Lets owners manage which technicians are assigned to each manager.',
  owner_add_manager: 'Allows owners to invite or add manager accounts to the company.',
  owner_add_technician: 'Allows owners to invite or add technician accounts to the company.',
}

export default function CompanyControlCenterPage() {
  const params = useParams<{ id: string }>()
  const companyId = params?.id || ''
  const [data, setData] = useState<ControlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [companyNameDraft, setCompanyNameDraft] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [subscriptionStatus, setSubscriptionStatus] = useState('manual')
  const [seatLimits, setSeatLimits] = useState<SeatCounts>({ owners: 1, managers: 2, technicians: 8 })
  const [featureFlags, setFeatureFlags] = useState<CompanyFeatureFlags>(normalizeCompanyFeatureFlags(null))
  const [trades, setTrades] = useState<string[]>(['plumbing'])
  const [jurisdictions, setJurisdictions] = useState<JurisdictionValue[]>([{ country: 'US', state: 'IN' }])
  const [timezone, setTimezone] = useState('America/Indiana/Indianapolis')
  const [pendingInvitesOpen, setPendingInvitesOpen] = useState(false)
  const [inviteActionProfileId, setInviteActionProfileId] = useState('')

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const load = async () => {
    setLoading(true)
    setError('')
    const token = await getToken()
    if (!token) return void window.location.replace('/login')

    const response = await fetch(`/api/platform-admin/companies/${companyId}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(result.error || 'Could not load company control center.')
      setLoading(false)
      return
    }

    setData(result)
    setCompanyNameDraft(result.company.name || '')
    setPlanCode(result.company.plan_code || 'mvp')
    setSubscriptionStatus(result.company.subscription_status || 'manual')
    setSeatLimits(result.seats?.included || result.seats?.limits || result.company.seat_limits || { owners: 1, managers: 2, technicians: 8 })
    setFeatureFlags(normalizeCompanyFeatureFlags(result.company.feature_flags))
    setTrades(Array.isArray(result.company.trades) && result.company.trades.length ? result.company.trades : ['plumbing'])
    setJurisdictions(Array.isArray(result.company.jurisdictions) && result.company.jurisdictions.length ? result.company.jurisdictions : [{ country: 'US', state: 'IN' }])
    setTimezone(result.company.timezone || 'America/Indiana/Indianapolis')
    setLoading(false)
  }

  useEffect(() => {
    if (companyId) void load()
  }, [companyId])

  const totalSeatsUsed = useMemo(() => {
    if (!data) return 0
    return data.seats.used.owners + data.seats.used.managers + data.seats.used.technicians
  }, [data])

  const saveControls = async () => {
    if (!data || saving) return
    setSaving(true)
    setError('')
    setStatus('')
    const token = await getToken()

    const response = await fetch(`/api/platform-admin/companies/${companyId}`, {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: companyNameDraft,
        planCode,
        subscriptionStatus,
        seatLimits,
        featureFlags,
        trades,
        jurisdictions,
        timezone,
      }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(result.error || 'Could not save company controls.')
      setSaving(false)
      return
    }

    setStatus('Company controls saved.')
    setSaving(false)
    await load()
  }

  const enterOwnerWorkspace = async () => {
    if (!data || entering) return
    setEntering(true)
    setError('')
    const token = await getToken()

    const response = await fetch('/api/platform-admin/workspace', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId: data.company.id }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(result.error || 'Could not enter owner workspace.')
      setEntering(false)
      return
    }

    window.location.href = '/manager/company'
  }

  const managePendingInvite = async (profileId: string, action: 'resend' | 'delete') => {
    if (!data || inviteActionProfileId) return

    const pending = data.pendingInviteDetails.find((item) => item.profileId === profileId)
    if (!pending) return

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete the pending ${pending.role} invite for ${pending.name || pending.email}? This removes the pending login but preserves technician roster/history where applicable.`
      )
      if (!confirmed) return
    }

    setInviteActionProfileId(profileId)
    setError('')
    setStatus('')

    const token = await getToken()
    const response = await fetch(`/api/platform-admin/companies/${companyId}/pending-invites`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileId, action }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(result.error || `Could not ${action} pending invite.`)
      setInviteActionProfileId('')
      return
    }

    setStatus(action === 'resend' ? `Invite resent to ${pending.email}.` : `Pending invite for ${pending.name} deleted.`)
    setInviteActionProfileId('')
    await load()
  }

  if (loading) return <PlatformAdminShell maxWidth={1180} contentPadding="42px clamp(24px, 5vw, 72px) 70px"><div style={noticeStyle}>Loading company control center…</div></PlatformAdminShell>
  if (!data) return <PlatformAdminShell maxWidth={1180} contentPadding="42px clamp(24px, 5vw, 72px) 70px"><div style={errorStyle}>{error || 'Company not found.'}</div></PlatformAdminShell>

  const company = data.company

  return (
    <PlatformAdminShell maxWidth={1180} contentPadding="42px clamp(24px, 5vw, 72px) 70px">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <a href="/platform-admin/companies" style={backLinkStyle}>← Companies</a>
            <div style={eyebrowStyle}>Company Control Center</div>
            <h1 style={{ margin: '6px 0 7px', fontSize: 36, letterSpacing: '-0.035em' }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge text={company.account_type} />
              <Badge text={company.status} />
              <Badge text={company.subscription_status} />
              {data.seats.overPlan && <OverPlanBadge />}
            </div>
          </div>
          <button type="button" onClick={() => void enterOwnerWorkspace()} disabled={entering} style={secondaryButtonStyle}>
            {entering ? 'Entering…' : 'Enter Owner Workspace'}
          </button>
        </div>

        <div style={metricsGridStyle}>
          <Metric
            label="Seats used"
            value={String(totalSeatsUsed)}
            sub={`${data.pendingInvites} pending invite${data.pendingInvites === 1 ? '' : 's'}`}
            onSubClick={data.pendingInvites > 0 ? () => setPendingInvitesOpen(true) : undefined}
          />
          <Metric label="AI calls · 14d" value={data.usage.calls.toLocaleString()} sub={`${data.usage.totalTokens.toLocaleString()} tokens`} />
          <Metric label="Verified jurisdictions" value={`${data.health.sourceCoverageVerified}/${data.health.sourceCoverageTotal}`} sub="configured coverage" />
          <Metric label="Tenant isolation" value="Healthy" sub="company-scoped access" />
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {status && <div style={successStyle}>{status}</div>}

        <div style={twoColumnStyle}>
          <section style={cardStyle}>
            <CardTitle title="Plan allowances" sub="Defines what this company plan includes. CraftCompass flags usage overages without blocking access." />
            <div style={formGridStyle}>
              <label style={labelStyle}>Plan code
                <input value={planCode} onChange={(e) => setPlanCode(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>Subscription status
                <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)} style={inputStyle}>
                  {['manual','trialing','active','past_due','paused','canceled'].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <div style={{ marginTop: 16, color: '#334155', fontSize: 13, fontWeight: 850 }}>Users included</div>
            <div style={{ ...formGridStyle, marginTop: 9 }}>
              {(['owners','managers','technicians'] as const).map((role) => (
                <label key={role} style={labelStyle}>
                  {role[0].toUpperCase() + role.slice(1)} included
                  <input
                    type="number"
                    min={0}
                    value={seatLimits[role]}
                    onChange={(e) => setSeatLimits((current) => ({ ...current, [role]: Math.max(0, Number(e.target.value || 0)) }))}
                    style={inputStyle}
                  />
                  <span style={data.seats.used[role] > seatLimits[role] ? overageTextStyle : helperStyle}>
                    {data.seats.used[role]} used · {Math.max(0, data.seats.used[role] - seatLimits[role])} over plan
                  </span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ color: '#334155', fontSize: 13, fontWeight: 850 }}>Features included</div>
              <div style={{ marginTop: 4, ...helperStyle }}>
                Toggle the company features included with this plan. Hover over any feature for an explanation.
              </div>
              <div style={{ ...featureGridStyle, marginTop: 10 }}>
                {COMPANY_FEATURE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={featureDescriptions[key] || 'Controls access to this company feature.'}
                    aria-label={`${featureLabels[key] || key}: ${featureDescriptions[key] || 'Company feature control'}`}
                    onClick={() => setFeatureFlags((current) => ({ ...current, [key]: !current[key] }))}
                    style={featureRowStyle}
                  >
                    <span style={{ fontWeight: 750, color: '#172033' }}>{featureLabels[key] || key}</span>
                    <span style={{ ...switchStyle, background: featureFlags[key] ? '#082B4D' : '#cbd5e1' }}>
                      <span style={{ ...switchKnobStyle, transform: featureFlags[key] ? 'translateX(18px)' : 'translateX(0)' }} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <CardTitle title="Company configuration" sub="Edit this company's identity, trades, jurisdictions, and timezone." />
            <label style={{ ...labelStyle, marginBottom: 14 }}>
              Company name
              <input
                value={companyNameDraft}
                onChange={(event) => setCompanyNameDraft(event.target.value)}
                maxLength={120}
                style={inputStyle}
              />
            </label>
            <CompanyScopeEditor
              trades={trades}
              onTradesChange={setTrades}
              jurisdictions={jurisdictions}
              onJurisdictionsChange={setJurisdictions}
              timezone={timezone}
              onTimezoneChange={setTimezone}
            />
          </section>

          <section style={cardStyle}>
            <CardTitle title="AI usage" sub="CraftCompass telemetry for this company over the last 14 days." />
            <div style={usageGridStyle}>
              <SmallMetric label="Calls" value={data.usage.calls} />
              <SmallMetric label="Tokens" value={data.usage.totalTokens} />
              <SmallMetric label="Web searches" value={data.usage.webSearchCalls} />
              <SmallMetric label="File searches" value={data.usage.fileSearchCalls} />
            </div>
            <div style={helperStyle}>
              Dollar cost is intentionally not allocated here yet because organization billing can include other OpenAI projects.
            </div>
          </section>

          <section style={cardStyle}>
            <CardTitle title="Verified source coverage" sub="A jurisdiction is green only when CraftCompass has a current verified code edition for it." />
            <div style={{ display: 'grid', gap: 10 }}>
              {data.sourceCoverage.length === 0 ? (
                <div style={helperStyle}>No jurisdictions configured.</div>
              ) : data.sourceCoverage.map((item, index) => (
                <div key={`${item.country}-${item.state}-${index}`} style={coverageRowStyle}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{item.locality ? `${item.locality}, ${item.state}` : item.name}</div>
                    <div style={helperStyle}>
                      {item.codeFamilies.length ? item.codeFamilies.join(' · ') : 'No verified code families loaded'}
                    </div>
                  </div>
                  <span style={item.verified ? healthyBadgeStyle : warningBadgeStyle}>
                    {item.verified ? 'Verified' : 'Not yet verified'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={() => void saveControls()} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Company Controls'}
          </button>
        </div>
      </div>

      {pendingInvitesOpen && (
        <div style={modalBackdropStyle} onClick={() => !inviteActionProfileId && setPendingInvitesOpen(false)}>
          <div style={pendingModalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
              <div>
                <div style={eyebrowStyle}>Company Access</div>
                <h2 style={{ margin:'5px 0 4px', fontSize:24 }}>Pending invites</h2>
                <div style={helperStyle}>{company.name} · users who have not signed in yet</div>
              </div>
              <button type="button" onClick={() => setPendingInvitesOpen(false)} style={closeButtonStyle}>×</button>
            </div>

            <div style={{ display:'grid', gap:10, marginTop:18 }}>
              {data.pendingInviteDetails.length === 0 ? (
                <div style={helperStyle}>No pending invites.</div>
              ) : data.pendingInviteDetails.map((invite) => (
                <div key={invite.profileId} style={pendingInviteRowStyle}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:850 }}>{invite.name}</div>
                    <div style={{ marginTop:2, color:'#475569', fontSize:12 }}>{invite.email}</div>
                    <div style={{ marginTop:4, color:'#94a3b8', fontSize:11 }}>
                      {titleCase(invite.role)} · invited {new Date(invite.invitedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <button
                      type="button"
                      disabled={Boolean(inviteActionProfileId)}
                      onClick={() => void managePendingInvite(invite.profileId, 'resend')}
                      style={secondaryButtonStyle}
                    >
                      {inviteActionProfileId === invite.profileId ? 'Working…' : 'Resend'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(inviteActionProfileId)}
                      onClick={() => void managePendingInvite(invite.profileId, 'delete')}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PlatformAdminShell>
  )
}

function Metric({
  label,
  value,
  sub,
  onSubClick,
}: {
  label: string
  value: string
  sub: string
  onSubClick?: () => void
}) {
  return (
    <div style={metricStyle}>
      <div style={eyebrowStyle}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 28, fontWeight: 850 }}>{value}</div>
      {onSubClick ? (
        <button type="button" onClick={onSubClick} style={metricSubButtonStyle}>{sub}</button>
      ) : (
        <div style={helperStyle}>{sub}</div>
      )}
    </div>
  )
}
function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div style={smallMetricStyle}><div style={helperStyle}>{label}</div><div style={{ marginTop: 3, fontSize: 20, fontWeight: 850 }}>{value.toLocaleString()}</div></div>
}
function CardTitle({ title, sub }: { title: string; sub: string }) {
  return <div style={{ marginBottom: 16 }}><div style={{ fontSize: 18, fontWeight: 850 }}>{title}</div><div style={{ marginTop: 4, color: '#64748b', fontSize: 12, lineHeight: 1.45 }}>{sub}</div></div>
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div style={infoRowStyle}><span style={helperStyle}>{label}</span><span style={{ fontWeight: 750, textAlign: 'right' }}>{value}</span></div>
}
function OverPlanBadge() {
  return <span style={warningBadgeStyle}>Over plan</span>
}
function Badge({ text }: { text: string }) {
  return <span style={neutralBadgeStyle}>{text.replaceAll('_',' ')}</span>
}
const titleCase = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value

const sidebarStyle: React.CSSProperties = { position:'fixed', inset:'0 auto 0 0', width:244, padding:'30px 20px 22px', boxSizing:'border-box', background:'#111827', color:'#f8fafc', borderRight:'1px solid #1f2937' }
const metricsGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginTop:28 }
const metricStyle: React.CSSProperties = { padding:18, border:'1px solid #e2e8f0', borderRadius:14, background:'#fff' }
const twoColumnStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:16, marginTop:16 }
const cardStyle: React.CSSProperties = { padding:20, border:'1px solid #e2e8f0', borderRadius:14, background:'#fff' }
const formGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }
const labelStyle: React.CSSProperties = { display:'grid', gap:6, color:'#475569', fontSize:12, fontWeight:800 }
const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'10px 11px', border:'1px solid #cbd5e1', borderRadius:9, background:'#fff', color:'#172033', fontSize:13 }
const helperStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const overageTextStyle: React.CSSProperties = { color:'#9a3412', fontSize:12, lineHeight:1.45, fontWeight:800 }
const usageGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10, marginBottom:12 }
const smallMetricStyle: React.CSSProperties = { padding:12, borderRadius:10, background:'#f8fafc', border:'1px solid #eef2f6' }
const coverageRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'11px 12px', border:'1px solid #eef2f6', borderRadius:10, background:'#f8fafc' }
const infoRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:16, padding:'10px 0', borderBottom:'1px solid #f1f5f9' }
const featureGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:9 }
const featureRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'12px 13px', border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc', cursor:'pointer' }
const switchStyle: React.CSSProperties = { position:'relative', width:40, height:22, borderRadius:999, padding:2, boxSizing:'border-box', flex:'0 0 auto' }
const switchKnobStyle: React.CSSProperties = { display:'block', width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(15,23,42,.24)', transition:'transform 120ms ease' }
const eyebrowStyle: React.CSSProperties = { color:'#64748b', fontSize:11, fontWeight:850, textTransform:'uppercase', letterSpacing:'.07em' }
const backLinkStyle: React.CSSProperties = { display:'inline-block', marginBottom:14, color:'#475569', fontSize:13, fontWeight:750, textDecoration:'none' }
const primaryButtonStyle: React.CSSProperties = { border:0, borderRadius:9, padding:'11px 15px', background:'#082B4D', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer' }
const dangerButtonStyle: React.CSSProperties = { border:'1px solid #fecaca', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#b91c1c', fontSize:13, fontWeight:800, cursor:'pointer' }
const metricSubButtonStyle: React.CSSProperties = { border:0, padding:0, marginTop:2, background:'transparent', color:'#086195', fontSize:12, lineHeight:1.45, fontWeight:800, cursor:'pointer', textDecoration:'underline' }
const modalBackdropStyle: React.CSSProperties = { position:'fixed', inset:0, zIndex:80, display:'grid', placeItems:'center', padding:18, background:'rgba(15,23,42,.48)' }
const pendingModalStyle: React.CSSProperties = { width:'min(620px,100%)', maxHeight:'calc(100vh - 36px)', overflowY:'auto', borderRadius:16, padding:22, background:'#fff', boxShadow:'0 24px 70px rgba(15,23,42,.28)' }
const pendingInviteRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:13, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const closeButtonStyle: React.CSSProperties = { width:34, height:34, border:'1px solid #e2e8f0', borderRadius:9, background:'#fff', color:'#475569', fontSize:22, lineHeight:1, cursor:'pointer' }
const secondaryButtonStyle: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:9, padding:'10px 12px', background:'#fff', color:'#334155', fontSize:13, fontWeight:800, cursor:'pointer' }
const linkButtonStyle: React.CSSProperties = { border:0, padding:0, background:'transparent', color:'#086195', fontSize:12, fontWeight:800, cursor:'pointer' }
const neutralBadgeStyle: React.CSSProperties = { display:'inline-block', padding:'5px 9px', borderRadius:999, background:'#eef2f6', color:'#475569', fontSize:11, fontWeight:800, textTransform:'capitalize' }
const healthyBadgeStyle: React.CSSProperties = { padding:'5px 9px', borderRadius:999, background:'#f0fdf4', color:'#166534', fontSize:11, fontWeight:850, whiteSpace:'nowrap' }
const warningBadgeStyle: React.CSSProperties = { padding:'5px 9px', borderRadius:999, background:'#fff7ed', color:'#9a3412', fontSize:11, fontWeight:850, whiteSpace:'nowrap' }
const errorStyle: React.CSSProperties = { marginTop:14, padding:12, borderRadius:10, background:'#fef2f2', color:'#991b1b', fontSize:13 }
const successStyle: React.CSSProperties = { marginTop:14, padding:12, borderRadius:10, background:'#f0fdf4', color:'#166534', fontSize:13 }
const noticeStyle: React.CSSProperties = { maxWidth:900, margin:'50px auto', padding:18, border:'1px solid #e2e8f0', borderRadius:14, background:'#fff', color:'#64748b' }
