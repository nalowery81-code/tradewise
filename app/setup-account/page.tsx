'use client'

import { useEffect, useState } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function SetupAccountPage() {
  const [ready, setReady] = useState(false)
  const [checkingLink, setCheckingLink] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const establishSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const tokenHash = params.get('token_hash')
        const type = params.get('type') as EmailOtpType | null

        if (!tokenHash || !type) {
          setError('Open this page from the newest setup email. A valid setup link is required before changing a password.')
          setReady(false)
          return
        }

        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })

        if (verifyError) {
          setError('This setup link is invalid or has expired. Ask your manager to send a new setup email.')
          setReady(false)
          return
        }

        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('token_hash')
        cleanUrl.searchParams.delete('type')
        window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
        setReady(true)
      } catch (sessionError) {
        console.error('ACCOUNT SETUP SESSION ERROR:', sessionError)
        setError('Could not verify this setup link. Ask your manager to send a new setup email.')
        setReady(false)
      } finally {
        setCheckingLink(false)
      }
    }

    void establishSession()
  }, [])

  const finishSetup = async () => {
    setError('')

    if (!ready) {
      setError('Open the newest setup email before setting a password.')
      return
    }

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
        setError('Your setup session expired. Open the setup email again.')
        return
      }

      const response = await fetch('/api/auth/role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Your account was created, but CraftCompass AI could not load your role.')
        return
      }

      window.location.replace(data.role === 'technician' ? '/technician' : '/manager')
    } catch (setupError) {
      console.error('ACCOUNT SETUP ERROR:', setupError)
      setError('Could not finish account setup. Try the setup link again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={brandStyle}>CraftCompass AI</div>
        <h1 style={titleStyle}>Finish setting up your account</h1>
        <p style={textStyle}>Choose the password you will use to sign in to CraftCompass.</p>

        {checkingLink ? (
          <div style={noticeStyle}>Verifying your setup link...</div>
        ) : !ready ? (
          <div style={noticeStyle}>
            {error || 'Open this page from the newest setup link in your email.'}
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
