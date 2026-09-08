'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }
      setEmail(session.user.email || '')
      setChecking(false)
    }

    void loadSession()
  }, [router])

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
      setSuccess('Password changed. You can now sign out and test the new password.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return <main style={{ padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>Checking your account...</main>
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f7f7f8', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1f2937' }}>
      <div style={{ width: '100%', maxWidth: 430, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '28px 26px', boxShadow: '0 10px 35px rgba(15,23,42,0.07)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#172033' }}>CraftCompass AI</div>
        <h1 style={{ margin: '18px 0 8px', fontSize: 28 }}>Change password</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', lineHeight: 1.5 }}>You are signed in as <strong>{email}</strong>.</p>

        <label style={{ display: 'grid', gap: 7, marginBottom: 15, fontSize: 14, fontWeight: 600 }}>
          New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 11, padding: '12px 13px', fontSize: 16 }} />
        </label>

        <label style={{ display: 'grid', gap: 7, marginBottom: 15, fontSize: 14, fontWeight: 600 }}>
          Confirm new password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 11, padding: '12px 13px', fontSize: 16 }} onKeyDown={(e) => { if (e.key === 'Enter') void changePassword() }} />
        </label>

        {error && <div style={{ margin: '4px 0 14px', color: '#991b1b', fontSize: 14 }}>{error}</div>}
        {success && <div style={{ margin: '4px 0 14px', color: '#166534', fontSize: 14 }}>{success}</div>}

        <button type="button" onClick={() => void changePassword()} disabled={saving || !password || !confirmPassword} style={{ width: '100%', border: 'none', borderRadius: 11, padding: '12px 14px', background: '#172033', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving || !password || !confirmPassword ? 0.55 : 1 }}>
          {saving ? 'Changing password...' : 'Change password'}
        </button>
      </div>
    </main>
  )
}
