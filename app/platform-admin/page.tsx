'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
}

export default function PlatformAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

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
      setError('Could not load Tradewise companies.')
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
    if (!companyName.trim()) return

    setCreating(true)
    setError('')
    const token = await getToken()

    const response = await fetch('/api/platform-admin/companies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: companyName }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Could not create demo company.')
      setCreating(false)
      return
    }

    setCompanies((current) => [...current, data.company])
    setCompanyName('')
    setCreating(false)
  }

  const activeDemos = companies.filter((company) => company.account_type === 'demo' && company.status === 'active').length
  const totalUsers = companies.reduce((total, company) => total + company.users, 0)
  const totalTechnicians = companies.reduce((total, company) => total + company.technicians, 0)

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f8', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <aside style={sidebarStyle}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>Tradewise</div>
          <div style={{ marginTop: 5, color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Platform Admin
          </div>
        </div>

        <nav style={{ display: 'grid', gap: 7, marginTop: 32 }}>
          <a href="/platform-admin" style={activeNavStyle}>Companies</a>
          <div style={futureNavStyle}>Users</div>
          <div style={futureNavStyle}>System</div>
        </nav>

        <a href="/manager" style={backStyle}>← Owner Workspace</a>
      </aside>

      <section style={{ marginLeft: 244, padding: '42px clamp(24px, 5vw, 72px) 70px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Tradewise Platform
              </div>
              <h1 style={{ margin: '7px 0 8px', fontSize: 36, letterSpacing: '-0.035em' }}>Companies</h1>
              <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>
                Create and monitor isolated company workspaces for demos and customers.
              </p>
            </div>

            <form onSubmit={createCompany} style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Demo company name"
                maxLength={120}
                style={inputStyle}
              />
              <button type="submit" disabled={creating} style={primaryButtonStyle}>
                {creating ? 'Creating…' : '+ New Demo Company'}
              </button>
            </form>
          </div>

          <div style={metricsGridStyle}>
            <Metric label="Companies" value={companies.length} />
            <Metric label="Active demos" value={activeDemos} />
            <Metric label="Users" value={totalUsers} />
            <Metric label="Technicians" value={totalTechnicians} />
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <div style={tableCardStyle}>
            <div style={tableHeaderStyle}>
              <span>Company</span>
              <span>Type</span>
              <span>Users</span>
              <span>Techs</span>
              <span>Status</span>
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
                      {company.owners} owner{company.owners === 1 ? '' : 's'} · {company.managers} manager{company.managers === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div><Badge text={company.account_type} /></div>
                  <div style={numberStyle}>{company.users}</div>
                  <div style={numberStyle}>{company.technicians}</div>
                  <div><Badge text={company.status} /></div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 16, color: '#94a3b8', fontSize: 12 }}>
            Next admin step: invite an owner into a demo company and add safe “enter workspace” support.
          </div>
        </div>
      </section>
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
  gridTemplateColumns: 'minmax(220px, 2fr) 120px 90px 90px 110px',
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
  gridTemplateColumns: 'minmax(220px, 2fr) 120px 90px 90px 110px',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
}

const numberStyle: React.CSSProperties = { fontWeight: 800, color: '#334155' }
const emptyStyle: React.CSSProperties = { padding: 28, color: '#64748b', fontSize: 14 }
const errorStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 13 }
