'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function PlatformAdminAccountPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }

      setEmail(session.user.email || '')
      const response = await fetch('/api/account/profile', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setFullName(data.fullName || '')
        setPreferredName(data.preferredName || '')
      } else {
        setError(data.error || 'Could not load your account profile.')
      }
      setChecking(false)
    })()
  }, [router])

  const savePreferredName = async () => {
    setError('')
    setProfileStatus('')
    setProfileSaving(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return void router.replace('/login')

      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ preferredName }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Could not update preferred name.')
        return
      }

      setPreferredName(data.preferredName || '')
      setProfileStatus(data.preferredName
        ? `CraftCompass will call you ${data.preferredName}.`
        : 'Preferred name cleared. CraftCompass will use your full name.')
    } finally {
      setProfileSaving(false)
    }
  }

  const changePassword = async () => {
    setError('')
    setSuccess('')

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
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message || 'Could not change your password.')
        return
      }
      setPassword('')
      setConfirmPassword('')
      setSuccess('Password changed successfully.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PlatformAdminShell maxWidth={760}>
      <div style={eyebrowStyle}>Administration</div>
      <h1 style={headingStyle}>Account & Password</h1>
      <p style={introStyle}>Manage how CraftCompass addresses you and keep your Platform Admin login secure.</p>

      {checking ? (
        <div style={cardStyle}>Checking your account…</div>
      ) : (
        <>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Your name</h2>
            <label style={labelStyle}>
              Full name
              <input value={fullName} readOnly style={{ ...inputStyle, background:'#f8fafc', color:'#64748b' }} />
            </label>
            <label style={labelStyle}>
              Preferred name
              <input
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
                maxLength={80}
                placeholder={fullName ? `Example: ${fullName.split(' ')[0]}` : 'What should we call you?'}
                style={inputStyle}
              />
            </label>
            <div style={helpStyle}>Optional. Use the name you actually go by. Your full account name remains unchanged.</div>
            {profileStatus && <div style={successStyle}>{profileStatus}</div>}
            <button type="button" onClick={() => void savePreferredName()} disabled={profileSaving} style={buttonStyle}>
              {profileSaving ? 'Saving…' : 'Save preferred name'}
            </button>
          </section>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <h2 style={sectionTitleStyle}>Change password</h2>
            <p style={{ margin:'0 0 16px', color:'#64748b', fontSize:13 }}>
              Signed in as <strong>{email}</strong>
            </p>
            <label style={labelStyle}>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                onKeyDown={(e) => { if (e.key === 'Enter') void changePassword() }}
              />
            </label>
            {success && <div style={successStyle}>{success}</div>}
            <button
              type="button"
              onClick={() => void changePassword()}
              disabled={saving || !password || !confirmPassword}
              style={{ ...buttonStyle, opacity: saving || !password || !confirmPassword ? 0.55 : 1 }}
            >
              {saving ? 'Changing password…' : 'Change password'}
            </button>
          </section>

          {error && <div style={errorStyle}>{error}</div>}
        </>
      )}
    </PlatformAdminShell>
  )
}

const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900, color:'#172033' }
const introStyle: React.CSSProperties = { margin:'0 0 20px', color:'#64748b', lineHeight:1.5 }
const cardStyle: React.CSSProperties = { padding:20, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const sectionTitleStyle: React.CSSProperties = { margin:'0 0 14px', fontSize:18 }
const labelStyle: React.CSSProperties = { display:'grid', gap:7, marginBottom:13, fontSize:14, fontWeight:700 }
const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', border:'1px solid #cbd5e1', borderRadius:10, padding:'11px 12px', fontSize:15 }
const helpStyle: React.CSSProperties = { margin:'-3px 0 13px', color:'#64748b', fontSize:12, lineHeight:1.45 }
const buttonStyle: React.CSSProperties = { border:'none', borderRadius:10, padding:'11px 14px', background:'#172033', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }
const successStyle: React.CSSProperties = { margin:'4px 0 14px', color:'#166534', fontSize:13 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:13 }
