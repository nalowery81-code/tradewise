'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function PlatformAdminsPage() {
  const [name, setName] = useState('CraftCompass Admin')
  const [email, setEmail] = useState('admin@craftcompassai.com')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const createAdmin = async () => {
    setError('')
    setStatus('')

    const cleanName = name.replace(/\s+/g, ' ').trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName || !cleanEmail) {
      setError('Enter a name and email address.')
      return
    }

    setCreating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/platform-admin/admins', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: cleanName, email: cleanEmail }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error || 'Could not create the platform admin account.')
        return
      }

      setStatus(`Platform Admin created. A setup email was sent to ${cleanEmail}. Verify that account can sign in before changing your current admin account.`)
    } catch (createError) {
      console.error('CREATE PLATFORM ADMIN ERROR:', createError)
      setError('Could not create the platform admin account.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f8', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '54px 20px 80px' }}>
        <a href="/platform-admin/users" style={{ color: '#475569', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>← Back to Users</a>

        <div style={{ marginTop: 26, padding: 28, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18 }}>
          <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            CraftCompass AI Platform
          </div>
          <h1 style={{ margin: '8px 0 8px', fontSize: 32 }}>Create Platform Admin</h1>
          <p style={{ margin: '0 0 22px', color: '#64748b', lineHeight: 1.55 }}>
            This account belongs to the CraftCompass platform itself. It is not attached to ABC Plumbing or any other company.
          </p>

          <div style={{ padding: 13, borderRadius: 10, background: '#fffbeb', color: '#92400e', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
            Keep your current Platform Admin account unchanged until you successfully sign into this new account and confirm Platform Admin opens correctly.
          </div>

          <div style={{ display: 'grid', gap: 15 }}>
            <label style={labelStyle}>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Platform admin email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
            </label>

            <button
              type="button"
              onClick={() => void createAdmin()}
              disabled={creating}
              style={{ ...buttonStyle, opacity: creating ? 0.6 : 1 }}
            >
              {creating ? 'Creating…' : 'Create Platform Admin & Send Setup'}
            </button>
          </div>

          {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>{error}</div>}
          {status && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#f0fdf4', color: '#166534', fontSize: 13, lineHeight: 1.5 }}>{status}</div>}
        </div>
      </section>
    </main>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  fontSize: 13,
  fontWeight: 800,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '11px 12px',
  fontSize: 14,
  background: '#fff',
  color: '#172033',
}

const buttonStyle: React.CSSProperties = {
  width: 'fit-content',
  padding: '11px 15px',
  border: '1px solid #172033',
  borderRadius: 9,
  background: '#172033',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}
