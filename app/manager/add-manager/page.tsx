'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AddManagerPage() {
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/auth/role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()

      if (!response.ok || data.accountRole !== 'owner') {
        window.location.replace(data.role === 'technician' ? '/technician' : '/manager')
        return
      }

      setCheckingAccess(false)
    }

    void checkAccess()
  }, [])

  const inviteManager = async () => {
    setError('')
    setStatus('')

    const cleanName = name.replace(/\s+/g, ' ').trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName || !cleanEmail) {
      setError('Enter the manager name and email address.')
      return
    }

    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return window.location.replace('/login')

      const response = await fetch('/api/owner/managers/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: cleanName, email: cleanEmail }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not invite manager.')
        return
      }

      setStatus(`Invite sent to ${cleanEmail}. ${cleanName} will join this company as a manager.`)
      setName('')
      setEmail('')
    } catch (inviteError) {
      console.error('INVITE MANAGER ERROR:', inviteError)
      setError('Could not send the manager invite.')
    } finally {
      setSending(false)
    }
  }

  if (checkingAccess) return <main style={pageStyle}><div>Loading owner access...</div></main>

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <a href="/manager/company" style={backStyle}>← Back to Company</a>
        <div style={eyebrowStyle}>Owner setup</div>
        <h1 style={titleStyle}>Add manager</h1>
        <p style={textStyle}>
          Invite another manager into your Tradewise company. Managers can use the management workspace and see this company's technician data, but they cannot manage owners or other companies.
        </p>

        <label style={labelStyle}>
          Manager name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Mike Smith"
            autoComplete="name"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="mike@company.com"
            autoComplete="email"
            style={inputStyle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void inviteManager()
            }}
          />
        </label>

        {error && <div style={errorStyle}>{error}</div>}
        {status && <div style={successStyle}>{status}</div>}

        <button
          type="button"
          onClick={() => void inviteManager()}
          disabled={sending || !name.trim() || !email.trim()}
          style={{ ...buttonStyle, opacity: sending || !name.trim() || !email.trim() ? 0.55 : 1 }}
        >
          {sending ? 'Sending invite...' : 'Send manager invite'}
        </button>

        <div style={helpStyle}>
          Owners retain full-company access. Manager-to-technician assignments are now supported in the database and can be layered onto this next without changing the account structure.
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '64px 18px', background: '#f7f7f8', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1f2937' }
const cardStyle: React.CSSProperties = { width: '100%', maxWidth: 560, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '28px 28px 30px', boxShadow: '0 8px 30px rgba(15,23,42,0.06)' }
const backStyle: React.CSSProperties = { display: 'inline-block', marginBottom: 24, color: '#64748b', textDecoration: 'none', fontSize: 14 }
const eyebrowStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }
const titleStyle: React.CSSProperties = { margin: '7px 0 10px', fontSize: 34, lineHeight: 1.15 }
const textStyle: React.CSSProperties = { margin: '0 0 26px', color: '#64748b', lineHeight: 1.6 }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 7, marginBottom: 16, fontSize: 14, fontWeight: 700 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 11, padding: '12px 13px', fontSize: 16, outline: 'none', fontFamily: 'inherit' }
const buttonStyle: React.CSSProperties = { width: '100%', border: 'none', borderRadius: 11, padding: '12px 14px', background: '#172033', color: '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }
const errorStyle: React.CSSProperties = { margin: '0 0 14px', borderRadius: 11, padding: '11px 12px', background: '#fef2f2', color: '#991b1b', fontSize: 14, lineHeight: 1.45 }
const successStyle: React.CSSProperties = { margin: '0 0 14px', borderRadius: 11, padding: '11px 12px', background: '#f0fdf4', color: '#166534', fontSize: 14, lineHeight: 1.45 }
const helpStyle: React.CSSProperties = { marginTop: 18, paddingTop: 18, borderTop: '1px solid #eef2f5', color: '#64748b', fontSize: 13, lineHeight: 1.55 }
