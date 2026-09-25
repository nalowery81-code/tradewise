'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import BrandLogo from '../../components/brand-logo'

export default function AccountPasswordPage() {
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
    const loadAccount = async () => {
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
    }

    void loadAccount()
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

  if (checking) {
    return <main style={{ padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>Checking your account...</main>
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <BrandLogo width={150} style={{ margin: '0 auto 4px' }} />
        <div style={taglineStyle}>Real Skills. Smart Solutions.</div>
        <h1 style={{ margin: '18px 0 8px', fontSize: 28 }}>Account & password</h1>
        <p style={introStyle}>Manage how CraftCompass addresses you and keep your login secure.</p>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Your name</h2>
          <label style={labelStyle}>
            Full name
            <input value={fullName} readOnly style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} />
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
            {profileSaving ? 'Saving...' : 'Save preferred name'}
          </button>
        </section>

        <section style={{ ...sectionStyle, marginTop: 16 }}>
          <h2 style={sectionTitleStyle}>Change password</h2>
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
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
          <button type="button" onClick={() => void changePassword()} disabled={saving || !password || !confirmPassword} style={{ ...buttonStyle, opacity: saving || !password || !confirmPassword ? 0.55 : 1 }}>
            {saving ? 'Changing password...' : 'Change password'}
          </button>
        </section>

        {error && <div style={errorStyle}>{error}</div>}
        <button type="button" onClick={() => router.back()} style={backButtonStyle}>← Back</button>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'#f7f7f8', fontFamily:'Arial, Helvetica, sans-serif', color:'#1f2937' }
const cardStyle: React.CSSProperties = { width:'100%', maxWidth:470, background:'#fff', border:'1px solid #e5e7eb', borderRadius:20, padding:'28px 26px', boxShadow:'0 10px 35px rgba(15,23,42,0.07)' }
const taglineStyle: React.CSSProperties = { textAlign:'center', color:'var(--cc-deep-navy)', fontWeight:800, fontSize:13, letterSpacing:'0.01em', marginBottom:18 }
const introStyle: React.CSSProperties = { margin:'0 0 20px', color:'#64748b', lineHeight:1.5 }
const sectionStyle: React.CSSProperties = { padding:16, border:'1px solid #e2e8f0', borderRadius:14, background:'#fbfdff' }
const sectionTitleStyle: React.CSSProperties = { margin:'0 0 14px', fontSize:17 }
const labelStyle: React.CSSProperties = { display:'grid', gap:7, marginBottom:13, fontSize:14, fontWeight:600 }
const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', border:'1px solid #cbd5e1', borderRadius:11, padding:'12px 13px', fontSize:16 }
const helpStyle: React.CSSProperties = { margin:'-3px 0 13px', color:'#64748b', fontSize:12, lineHeight:1.45 }
const buttonStyle: React.CSSProperties = { width:'100%', border:'none', borderRadius:11, padding:'12px 14px', background:'#172033', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }
const successStyle: React.CSSProperties = { margin:'4px 0 14px', color:'#166534', fontSize:14 }
const errorStyle: React.CSSProperties = { margin:'14px 0', color:'#991b1b', fontSize:14 }
const backButtonStyle: React.CSSProperties = { marginTop:16, border:0, background:'transparent', color:'#64748b', cursor:'pointer', fontSize:13 }
