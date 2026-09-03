'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SetupAccountPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setReady(Boolean(session))
    }

    void checkSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const finishSetup = async () => {
    setError('')

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)

    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password })
      if (passwordError) {
        setError(passwordError.message || 'Could not set your password.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Your invite session expired. Open the invite email again.')
        return
      }

      const response = await fetch('/api/auth/role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Your account was created, but Tradewise could not load your role.')
        return
      }

      window.location.replace(data.role === 'technician' ? '/technician' : '/manager')
    } catch (setupError) {
      console.error('ACCOUNT SETUP ERROR:', setupError)
      setError('Could not finish account setup. Try the invite link again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={brandStyle}>Tradewise</div>
        <h1 style={titleStyle}>Finish setting up your account</h1>
        <p style={textStyle}>Choose the password you will use to sign in to Tradewise.</p>

        {!ready ? (
          <div style={noticeStyle}>
            Open this page from the invitation link in your email. If the link has expired, ask your manager to send a new invite.
          </div>
        ) : (
          <>
            <label style={labelStyle}>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void finishSetup()
                }}
              />
            </label>

            {error && <div style={errorStyle}>{error}</div>}

            <button
              type="button"
              onClick={() => void finishSetup()}
              disabled={saving || !password || !confirmPassword}
              style={{ ...buttonStyle, opacity: saving || !password || !confirmPassword ? 0.55 : 1 }}
            >
              {saving ? 'Setting up...' : 'Finish setup'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: '#f7f7f8',
  fontFamily: 'Arial, Helvetica, sans-serif',
  color: '#1f2937',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 430,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 20,
  padding: '28px 26px',
  boxShadow: '0 10px 35px rgba(15,23,42,0.07)',
}

const brandStyle: React.CSSProperties = { fontWeight: 800, fontSize: 18, color: '#172033' }
const titleStyle: React.CSSProperties = { margin: '18px 0 8px', fontSize: 28, lineHeight: 1.15 }
const textStyle: React.CSSProperties = { margin: '0 0 22px', color: '#64748b', lineHeight: 1.55 }
const noticeStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, lineHeight: 1.55, color: '#475569' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 7, marginBottom: 15, fontSize: 14, fontWeight: 600 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 11, padding: '12px 13px', fontSize: 16, outline: 'none' }
const errorStyle: React.CSSProperties = { margin: '4px 0 14px', color: '#991b1b', fontSize: 14, lineHeight: 1.45 }
const buttonStyle: React.CSSProperties = { width: '100%', border: 'none', borderRadius: 11, padding: '12px 14px', background: '#172033', color: '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
