'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PlatformAdminNav from '../platform-admin-nav'
import CompanyScopeEditor, { type JurisdictionValue } from '../../components/company-scope-editor'

type Company = {
  id: string
  name: string
  account_type: 'internal' | 'demo' | 'customer'
  status: 'active' | 'disabled'
  created_at: string
  users: number
  owners: number
  managers: number
  technicians: number
  plan_code?: string
  subscription_status?: string
  seat_limits?: { owners?: number; managers?: number; technicians?: number }
  accessTechnicians?: number
  included?: { owners: number; managers: number; technicians: number }
  overage?: { owners: number; managers: number; technicians: number }
  overPlan?: boolean
}

export default function PlatformAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyName, setCompanyName] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')
  const [newOwnerEmail, setNewOwnerEmail] = useState('')
  const [newTrades, setNewTrades] = useState<string[]>(['plumbing'])
  const [newJurisdictions, setNewJurisdictions] = useState<JurisdictionValue[]>([{ country: 'US', state: 'IN' }])
  const [newTimezone, setNewTimezone] = useState('America/Indiana/Indianapolis')
  const [newPlanCode, setNewPlanCode] = useState('mvp')
  const [newSeatLimits, setNewSeatLimits] = useState({ owners: 1, managers: 2, technicians: 8 })
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [inviteCompany, setInviteCompany] = useState<Company | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState('')

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    setError('')

    const token = await getToken()
    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/platform-admin/companies', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 403) {
      window.location.href = '/manager'
      return
    }

    if (!response.ok) {
      setError('Could not load CraftCompass AI companies.')
      setLoading(false)
      return
    }

    const data = await response.json()
    setCompanies(data.companies || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadCompanies()
  }, [loadCompanies])

  const createCompany = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!companyName.trim() || !newOwnerName.trim() || !newOwnerEmail.trim()) return

    setCreating(true)
    setError('')
    const token = await getToken()

    const response = await fetch('/api/platform-admin/companies/onboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: companyName.trim(),
        ownerName: newOwnerName.trim(),
        ownerEmail: newOwnerEmail.trim().toLowerCase(),
        timezone: newTimezone,
        trades: newTrades,
        jurisdictions: newJurisdictions,
        planCode: newPlanCode,
        seatLimits: newSeatLimits,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Could not onboard company.')
      setCreating(false)
      return
    }

    setCompanies((current) => [...current, data.company])
    setCompanyName('')
    setNewOwnerName('')
    setNewOwnerEmail('')
    setNewTrades(['plumbing'])
    setNewJurisdictions([{ country: 'US', state: 'IN' }])
    setNewTimezone('America/Indiana/Indianapolis')
    setNewPlanCode('mvp')
    setNewSeatLimits({ owners: 1, managers: 2, technicians: 8 })
    setOnboardingOpen(false)
    setCreating(false)
  }

  const inviteOwner = async () => {
    if (!inviteCompany || !ownerName.trim() || !ownerEmail.trim()) return

    setInviting(true)
    setError('')
    setInviteStatus('')

    const token = await getToken()
    const response = await fetch(`/api/platform-admin/companies/${inviteCompany.id}/invite-owner`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: ownerName, email: ownerEmail }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Could not invite owner.')
      setInviting(false)
      return
    }

    setCompanies((currentCompanies) =>
      currentCompanies.map((company) =>
        company.id === inviteCompany.id
          ? { ...company, users: company.users + 1, owners: company.owners + 1 }
          : company
      )
    )
    setInviteStatus(`Invite sent to ${ownerEmail.trim().toLowerCase()}.`)
    setOwnerName('')
    setOwnerEmail('')
    setInviting(false)
  }

  const activeDemos = companies.filter((company) => company.account_type === 'demo' && company.status === 'active').length
  const totalUsers = companies.reduce((total, company) => total + company.users, 0)
  const totalTechnicians = companies.reduce((total, company) => total + company.technicians, 0)

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f8', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{`
        @media (max-width: 760px) {
          .platform-admin-sidebar {
            position: static !important;
            width: auto !important;
            min-height: auto !important;
            padding: 18px 16px !important;
          }
          .platform-admin-sidebar nav {
            margin-top: 16px !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .platform-admin-sidebar .owner-back {
            margin-top: 14px !important;
          }
          .platform-admin-content {
            margin-left: 0 !important;
            padding: 26px 16px 50px !important;
          }
          .platform-admin-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .platform-admin-table {
            overflow-x: auto !important;
          }
          .platform-admin-table > div {
            min-width: 850px;
          }
          .platform-admin-create {
            width: 100%;
          }
          .platform-admin-create input {
            min-width: 0 !important;
            flex: 1 1 190px;
          }
        }
      `}</style>

      <aside className="platform-admin-sidebar" style={sidebarStyle}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>CraftCompass AI</div>
          <div style={{ marginTop: 5, color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Platform Admin
          </div>
        </div>

        <PlatformAdminNav variant="sidebar" />

        <a className="owner-back" href="/platform-admin/owner-workspace" style={backStyle}>← Owner Workspace</a>
      </aside>

      <section className="platform-admin-content" style={{ marginLeft: 244, padding: '42px clamp(24px, 5vw, 72px) 70px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                CraftCompass AI Platform
              </div>
              <h1 style={{ margin: '7px 0 8px', fontSize: 36, letterSpacing: '-0.035em' }}>Companies</h1>
              <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>
                Create and monitor isolated company workspaces for demos and customers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOnboardingOpen(true)
                setError('')
              }}
              style={primaryButtonStyle}
            >
              + Onboard Company
            </button>
          </div>

          <div className="platform-admin-metrics" style={metricsGridStyle}>
            <Metric label="Companies" value={companies.length} />
            <Metric label="Active demos" value={activeDemos} />
            <Metric label="Users" value={totalUsers} />
            <Metric label="Technicians" value={totalTechnicians} />
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <div className="platform-admin-table" style={tableCardStyle}>
            <div style={tableHeaderStyle}>
              <span>Company</span>
              <span>Type</span>
              <span>Users</span>
              <span>Techs</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {loading ? (
              <div style={emptyStyle}>Loading companies…</div>
            ) : companies.length === 0 ? (
              <div style={emptyStyle}>No company workspaces yet.</div>
            ) : (
              companies.map((company) => (
                <div key={company.id} style={tableRowStyle}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{company.name}</div>
                    <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 12 }}>
                      {company.owners}/{company.included?.owners ?? company.seat_limits?.owners ?? '—'} owner included · {company.managers}/{company.included?.managers ?? company.seat_limits?.managers ?? '—'} manager included · {company.accessTechnicians ?? company.technicians}/{company.included?.technicians ?? company.seat_limits?.technicians ?? '—'} tech included
                    </div>
                  </div>
                  <div><Badge text={company.account_type} /></div>
                  <div style={numberStyle}>{company.users}</div>
                  <div style={numberStyle}>{company.technicians}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Badge text={company.status} />
                    {company.overPlan && <OverPlanBadge />}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {company.owners === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInviteCompany(company)
                          setInviteStatus('')
                          setError('')
                        }}
                        style={secondaryButtonStyle}
                      >
                        Invite Owner
                      </button>
                    )}
                    <a
                      href={`/platform-admin/companies/${company.id}`}
                      style={{ ...secondaryButtonStyle, display: 'inline-block', textDecoration: 'none' }}
                    >
                      Control Center
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </section>

      {onboardingOpen && (
        <div style={modalBackdropStyle} onClick={() => !creating && setOnboardingOpen(false)}>
          <form
            onSubmit={createCompany}
            style={onboardingModalCardStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              New Company
            </div>
            <h2 style={{ margin: '7px 0 8px', fontSize: 28 }}>Onboard company</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', lineHeight: 1.5 }}>
              Create the company workspace, configure its platform scope, and invite the first owner.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <label style={modalLabelStyle}>
                Company name
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={120} style={{ ...inputStyle, minWidth: 0 }} />
              </label>
              <label style={modalLabelStyle}>
                Owner name
                <input value={newOwnerName} onChange={(event) => setNewOwnerName(event.target.value)} maxLength={120} style={{ ...inputStyle, minWidth: 0 }} />
              </label>
              <label style={modalLabelStyle}>
                Owner email
                <input type="email" value={newOwnerEmail} onChange={(event) => setNewOwnerEmail(event.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
              </label>
            </div>

            <div style={{ marginTop: 18, padding: 14, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
              <CompanyScopeEditor
                trades={newTrades}
                onTradesChange={setNewTrades}
                jurisdictions={newJurisdictions}
                onJurisdictionsChange={setNewJurisdictions}
                timezone={newTimezone}
                onTimezoneChange={setNewTimezone}
              />
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ color: '#334155', fontSize: 13, fontWeight: 850 }}>Plan allowances</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginTop: 9 }}>
                <label style={modalLabelStyle}>
                  Plan
                  <input value={newPlanCode} onChange={(event) => setNewPlanCode(event.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                </label>
                {(['owners','managers','technicians'] as const).map((role) => (
                  <label key={role} style={modalLabelStyle}>
                    {role[0].toUpperCase() + role.slice(1)} included
                    <input
                      type="number"
                      min={role === 'owners' ? 1 : 0}
                      value={newSeatLimits[role]}
                      onChange={(event) => setNewSeatLimits((current) => ({
                        ...current,
                        [role]: Math.max(role === 'owners' ? 1 : 0, Number(event.target.value || 0)),
                      }))}
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {error && <div style={errorStyle}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 20 }}>
              <button type="button" disabled={creating} onClick={() => setOnboardingOpen(false)} style={secondaryButtonStyle}>Cancel</button>
              <button
                type="submit"
                disabled={creating || !companyName.trim() || !newOwnerName.trim() || !newOwnerEmail.trim()}
                style={{ ...primaryButtonStyle, opacity: creating || !companyName.trim() || !newOwnerName.trim() || !newOwnerEmail.trim() ? 0.55 : 1 }}
              >
                {creating ? 'Creating & inviting…' : 'Create & Invite Owner'}
              </button>
            </div>
          </form>
        </div>
      )}

      {inviteCompany && (
        <div style={modalBackdropStyle} onClick={() => setInviteCompany(null)}>
          <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {inviteCompany.name}
            </div>
            <h2 style={{ margin: '7px 0 8px', fontSize: 26 }}>Invite company owner</h2>
            <p style={{ margin: '0 0 20px', color: '#64748b', lineHeight: 1.5 }}>
              The owner will receive an email invitation and create their own CraftCompass AI password.
            </p>

            <label style={labelStyle}>
              Owner name
              <input
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Owner name"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Email address
              <input
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="owner@company.com"
                style={inputStyle}
              />
            </label>

            {inviteStatus && <div style={successStyle}>{inviteStatus}</div>}

            <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
              <button type="button" onClick={() => setInviteCompany(null)} style={secondaryButtonStyle}>
                Close
              </button>
              <button
                type="button"
                onClick={() => void inviteOwner()}
                disabled={inviting || !ownerName.trim() || !ownerEmail.trim()}
                style={{ ...primaryButtonStyle, opacity: inviting || !ownerName.trim() || !ownerEmail.trim() ? 0.55 : 1 }}
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 30, fontWeight: 850 }}>{value}</div>
    </div>
  )
}

function OverPlanBadge() {
  return (
    <span style={{
      display: 'inline-block',
      padding: '5px 9px',
      borderRadius: 999,
      background: '#fff7ed',
      color: '#9a3412',
      fontSize: 11,
      fontWeight: 850,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      Over plan
    </span>
  )
}

function Badge({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '5px 9px',
      borderRadius: 999,
      background: '#eef2f6',
      color: '#475569',
      fontSize: 11,
      fontWeight: 800,
      textTransform: 'capitalize',
    }}>
      {text}
    </span>
  )
}

const sidebarStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '0 auto 0 0',
  width: 244,
  padding: '30px 20px 22px',
  boxSizing: 'border-box',
  background: '#111827',
  color: '#f8fafc',
  borderRight: '1px solid #1f2937',
  display: 'flex',
  flexDirection: 'column',
}

const activeNavStyle: React.CSSProperties = {
  display: 'block',
  padding: '11px 12px',
  borderRadius: 9,
  background: '#273449',
  color: '#ffffff',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 800,
}

const futureNavStyle: React.CSSProperties = {
  padding: '11px 12px',
  color: '#64748b',
  fontSize: 14,
  fontWeight: 700,
}

const backStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: '10px 12px',
  border: '1px solid #334155',
  borderRadius: 9,
  color: '#cbd5e1',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
}

const inputStyle: React.CSSProperties = {
  minWidth: 230,
  padding: '11px 12px',
  borderRadius: 9,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  fontSize: 14,
  outline: 'none',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '11px 14px',
  border: 0,
  borderRadius: 9,
  background: '#172033',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const metricsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
  marginTop: 34,
}

const metricCardStyle: React.CSSProperties = {
  padding: 18,
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  background: '#ffffff',
}

const tableCardStyle: React.CSSProperties = {
  marginTop: 18,
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  overflow: 'hidden',
  background: '#ffffff',
}

const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 2fr) 100px 70px 70px 100px 210px',
  gap: 12,
  padding: '12px 18px',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  color: '#64748b',
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const tableRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 2fr) 100px 70px 70px 100px 210px',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
}

const numberStyle: React.CSSProperties = { fontWeight: 800, color: '#334155' }
const emptyStyle: React.CSSProperties = { padding: 28, color: '#64748b', fontSize: 14 }
const errorStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 13 }


const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 10px',
  background: '#ffffff',
  color: '#334155',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(15, 23, 42, 0.45)',
}

const onboardingModalCardStyle: React.CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: 'calc(100vh - 36px)',
  overflowY: 'auto',
  borderRadius: 18,
  padding: 24,
  background: '#ffffff',
  boxShadow: '0 24px 70px rgba(15,23,42,0.22)',
}

const modalCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 440,
  borderRadius: 18,
  padding: 24,
  background: '#ffffff',
  boxShadow: '0 24px 70px rgba(15,23,42,0.22)',
}

const modalLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  color: '#334155',
  fontSize: 12,
  fontWeight: 800,
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  marginTop: 14,
  color: '#334155',
  fontSize: 13,
  fontWeight: 800,
}

const successStyle: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 10,
  padding: 11,
  background: '#f0fdf4',
  color: '#166534',
  fontSize: 13,
  fontWeight: 700,
}