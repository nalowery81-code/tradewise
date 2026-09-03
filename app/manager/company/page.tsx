'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Company = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

type CompanyMember = {
  profileId: string
  authUserId: string | null
  role: 'owner' | 'manager' | 'technician'
  name: string
  email: string
  technicianId: string | null
  createdAt: string
  accountStatus?: 'active' | 'no_login'
}

type CompanyData = {
  company: Company
  members: CompanyMember[]
  counts: { owners: number; managers: number; technicians: number }
}

export default function CompanyPage() {
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CompanyData | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameStatus, setNameStatus] = useState('')
  const [error, setError] = useState('')

  const getSession = async () => (await supabase.auth.getSession()).data.session

  const loadCompany = async () => {
    setLoading(true)
    setError('')

    try {
      const session = await getSession()
      if (!session) return window.location.replace('/login')

      const response = await fetch('/api/owner/company', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const companyData = await response.json()

      if (!response.ok) {
        setError(companyData.error || 'Could not load company.')
        return
      }

      setData(companyData)
      setCompanyName(companyData.company.name || '')
    } catch (loadError) {
      console.error('OWNER COMPANY PAGE LOAD ERROR:', loadError)
      setError('Could not load company.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAccess = async () => {
      const session = await getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/auth/role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const roleData = await response.json()

      if (!response.ok || roleData.accountRole !== 'owner') {
        window.location.replace(roleData.role === 'technician' ? '/technician' : '/manager')
        return
      }

      setCheckingAccess(false)
      void loadCompany()
    }

    void checkAccess()
  }, [])

  const saveCompanyName = async () => {
    const cleanName = companyName.replace(/\s+/g, ' ').trim()
    if (!cleanName || savingName) return

    setSavingName(true)
    setNameStatus('')

    try {
      const session = await getSession()
      if (!session) return window.location.replace('/login')

      const response = await fetch('/api/owner/company', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: cleanName }),
      })
      const result = await response.json()

      if (!response.ok) {
        setNameStatus(result.error || 'Could not save company name.')
        return
      }

      setCompanyName(result.company.name)
      setData((current) => current ? { ...current, company: result.company } : current)
      setNameStatus('Saved')
    } catch (saveError) {
      console.error('OWNER COMPANY NAME SAVE ERROR:', saveError)
      setNameStatus('Could not save company name.')
    } finally {
      setSavingName(false)
    }
  }

  if (checkingAccess) return <main style={loadingPageStyle}>Loading owner workspace...</main>

  const owners = data?.members.filter((member) => member.role === 'owner') || []
  const managers = data?.members.filter((member) => member.role === 'manager') || []
  const technicians = data?.members.filter((member) => member.role === 'technician') || []

  const renderMember = (member: CompanyMember) => {
    const needsLogin = member.role === 'technician' && member.accountStatus === 'no_login'

    return (
      <div key={member.profileId} style={memberRowStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#172033' }}>{member.name}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', overflowWrap: 'anywhere' }}>
            {needsLogin ? 'No Tradewise login yet' : member.email || 'No email available'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {needsLogin && <div style={statusBadgeStyle}>Needs invite</div>}
          <div style={roleBadgeStyle}>{member.role}</div>
        </div>
      </div>
    )
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={topRowStyle}>
          <a href="/manager" style={backStyle}>← Back to Manager</a>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <a href="/manager/add-technician" style={secondaryActionStyle}>+ Add Technician</a>
            <a href="/manager/add-manager" style={primaryActionStyle}>+ Add Manager</a>
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={eyebrowStyle}>Owner workspace</div>
          <h1 style={titleStyle}>{data?.company.name || 'Company'}</h1>
          <p style={subtleTextStyle}>Owners can see and manage the full company. Managers and technicians stay inside this company boundary.</p>
        </div>

        {loading ? <div style={statusCardStyle}>Loading company...</div> :
         error ? <div style={errorStyle}>{error}</div> : data ? (
          <>
            <section style={summaryGridStyle}>
              <div style={statCardStyle}><div style={statNumberStyle}>{data.counts.owners}</div><div style={statLabelStyle}>Owner{data.counts.owners === 1 ? '' : 's'}</div></div>
              <div style={statCardStyle}><div style={statNumberStyle}>{data.counts.managers}</div><div style={statLabelStyle}>Manager{data.counts.managers === 1 ? '' : 's'}</div></div>
              <div style={statCardStyle}><div style={statNumberStyle}>{data.counts.technicians}</div><div style={statLabelStyle}>Technician{data.counts.technicians === 1 ? '' : 's'}</div></div>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Company name</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={companyName}
                  onChange={(event) => { setCompanyName(event.target.value); setNameStatus('') }}
                  style={inputStyle}
                  aria-label="Company name"
                />
                <button type="button" onClick={() => void saveCompanyName()} disabled={savingName || !companyName.trim()} style={saveButtonStyle}>
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                {nameStatus && <span style={{ fontSize: 13, color: nameStatus === 'Saved' ? '#475569' : '#991b1b' }}>{nameStatus}</span>}
              </div>
            </section>

            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>Owners</h2>
                <span style={countBadgeStyle}>{owners.length}</span>
              </div>
              <div style={memberListStyle}>{owners.map(renderMember)}</div>
            </section>

            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>Managers</h2>
                <span style={countBadgeStyle}>{managers.length}</span>
              </div>
              {managers.length ? <div style={memberListStyle}>{managers.map(renderMember)}</div> : <div style={emptyTextStyle}>No managers have been added yet.</div>}
            </section>

            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>Technicians</h2>
                <span style={countBadgeStyle}>{technicians.length}</span>
              </div>
              {technicians.length ? <div style={memberListStyle}>{technicians.map(renderMember)}</div> : <div style={emptyTextStyle}>No technicians have been added yet.</div>}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = { minHeight: '100vh', background: '#f7f7f8', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1f2937', padding: '42px 18px 70px' }
const loadingPageStyle: React.CSSProperties = { ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const shellStyle: React.CSSProperties = { width: '100%', maxWidth: 860, margin: '0 auto' }
const topRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }
const backStyle: React.CSSProperties = { color: '#64748b', textDecoration: 'none', fontSize: 14 }
const primaryActionStyle: React.CSSProperties = { textDecoration: 'none', borderRadius: 11, padding: '10px 14px', background: '#172033', color: '#ffffff', fontSize: 14, fontWeight: 700 }
const secondaryActionStyle: React.CSSProperties = { textDecoration: 'none', borderRadius: 11, padding: '10px 14px', background: '#ffffff', color: '#172033', border: '1px solid #d1d5db', fontSize: 14, fontWeight: 700 }
const eyebrowStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }
const titleStyle: React.CSSProperties = { margin: '8px 0 0', fontSize: 'clamp(30px, 5vw, 42px)' }
const subtleTextStyle: React.CSSProperties = { marginTop: 10, color: '#64748b', lineHeight: 1.6, maxWidth: 700 }
const summaryGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 28 }
const statCardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px' }
const statNumberStyle: React.CSSProperties = { fontSize: 30, fontWeight: 800, color: '#172033' }
const statLabelStyle: React.CSSProperties = { marginTop: 3, color: '#64748b', fontSize: 14 }
const sectionStyle: React.CSSProperties = { marginTop: 18, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '20px 22px', boxShadow: '0 3px 14px rgba(15,23,42,0.03)' }
const sectionHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700, color: '#172033' }
const countBadgeStyle: React.CSSProperties = { minWidth: 24, height: 24, borderRadius: 999, background: '#e7edf2', color: '#475569', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px' }
const memberListStyle: React.CSSProperties = { display: 'grid', gap: 9 }
const memberRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '13px 14px', border: '1px solid #eef2f5', borderRadius: 13, background: '#f8fafc' }
const roleBadgeStyle: React.CSSProperties = { borderRadius: 999, padding: '5px 9px', background: '#e7edf2', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }
const statusBadgeStyle: React.CSSProperties = { borderRadius: 999, padding: '5px 9px', background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }
const inputStyle: React.CSSProperties = { flex: '1 1 280px', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 11, padding: '11px 12px', fontSize: 15, outline: 'none' }
const saveButtonStyle: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '10px 14px', background: '#172033', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const statusCardStyle: React.CSSProperties = { marginTop: 24, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', color: '#64748b' }
const errorStyle: React.CSSProperties = { marginTop: 24, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '18px 20px', color: '#991b1b' }
const emptyTextStyle: React.CSSProperties = { color: '#64748b', lineHeight: 1.55 }
