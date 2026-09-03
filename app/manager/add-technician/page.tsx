'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AddTechnicianPage() {
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

      if (!response.ok || !['manager', 'owner'].includes(data.role || '')) {
        window.location.replace('/technician')
        return
      }

      setCheckingAccess(false)
    }

    void checkAccess()
  }, [])

  const inviteTechnician = async () => {
    setError('')
    setStatus('')

    const cleanName = name.replace(/\s+/g, ' ').trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName || !cleanEmail) {
      setError('Enter the technician name and email address.')
      return
    }

    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/manager/technicians/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: cleanName, email: cleanEmail }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not invite technician.')
        return
      }

      setStatus(`Invite sent to ${cleanEmail}. ${data.technician.name} is now connected to one technician record.`)
      setName('')
      setEmail('')
    } catch (inviteError) {
      console.error('INVITE TECHNICIAN ERROR:', inviteError)
      setError('Could not send the technician invite.')
    } finally {
      setSending(false)
    }
  }

  if (checkingAccess) {
    return <main style={pageStyle}><div>Loading manager access...</div></main>
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <a href="/manager" style={backStyle}>← Back to Manager</a>
        <div style={eyebrowStyle}>Team setup</div>
        <h1 style={titleStyle}>Add technician</h1>
        <p style={textStyle}>
          Enter the technician's name and email. Tradewise will create or connect the technician record and email them an invitation to finish setting up their login.
        </p>

        <label style={labelStyle}>
          Technician name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Jake Smith"
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
            placeholder="jake@company.com"
            autoComplete="email"
            style={inputStyle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void inviteTechnician()
            }}
          />
        </label>

        {error && <div style={errorStyle}>{error}</div>}
        {status && <div style={successStyle}>{status}</div>}

        <button
          type="button"
          onClick={() => void inviteTechnician()}
          disabled={sending || !name.trim() || !email.trim()}
          style={{ ...buttonStyle, opacity: sending || !name.trim() || !email.trim() ? 0.55 : 1 }}
        >
          {sending ? 'Sending invite...' : 'Send technician invite'}
        </button>

        <div style={helpStyle}>
          If a technician with the same name already exists without a login, Tradewise connects the invite to that existing record instead of creating a duplicate.
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '64px 18px',
  background: '#f7f7f8',
  fontFamily: 'Arial, Helvetica, sans-serif',
  color: '#1f2937',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 20,
  padding: '28px 28px 30px',
  boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
}

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
