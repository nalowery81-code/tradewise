'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import BrandLogo from '../components/brand-logo'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpStatus, setOtpStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const routeSession = async (accessToken: string) => {
    const roleResponse = await fetch('/api/auth/role', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!roleResponse.ok) {
      setError('Could not determine your CraftCompass AI role.')
      return false
    }

    const { role, isPlatformAdmin } = await roleResponse.json()

    if (isPlatformAdmin) {
      router.replace('/platform-admin')
      return true
    }

    if (role === 'manager' || role === 'owner') {
      router.replace('/manager')
      return true
    }

    router.replace('/technician')
    return true
  }

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const tokenHash = params.get('token_hash')
        const rawType = params.get('type')
        const type = (rawType === 'magiclink' ? 'email' : rawType) as EmailOtpType | null

        if (tokenHash && type) {
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          })

          if (verifyError) {
            if (active) setError(verifyError.message || 'This sign-in link is invalid or has expired.')
            return
          }

          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete('token_hash')
          cleanUrl.searchParams.delete('type')
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)

          if (data.session?.access_token) {
            await routeSession(data.session.access_token)
            return
          }
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        if (session?.access_token) {
          await routeSession(session.access_token)
        }
      } catch (sessionError) {
        console.error('LOGIN SESSION CHECK ERROR:', sessionError)
        if (active) setError('Could not complete sign-in. Try a new sign-in code.')
      } finally {
        if (active) setCheckingSession(false)
      }
    }

    void checkSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void routeSession(session.access_token)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const {
      data: { session },
      error,
    } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (!session?.access_token) {
      setError('CraftCompass AI did not receive a login session.')
      setLoading(false)
      return
    }

    await routeSession(session.access_token)
    setLoading(false)
  }

  const handleSendOtp = async () => {
    if (!email) return

    setLoading(true)
    setError('')
    setOtpStatus('')

    const redirectTo = `${window.location.origin}/login`
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    })

    if (sendError) {
      setError(sendError.message || 'Could not send a sign-in code.')
      setLoading(false)
      return
    }

    setOtpStatus('Check your email for a CraftCompass AI sign-in code or link.')
    setLoading(false)
  }

  const handleOtpLogin = async () => {
    setLoading(true)
    setError('')

    const { data, error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (otpError) {
      setError(otpError.message || 'That sign-in code is invalid or expired.')
      setLoading(false)
      return
    }

    if (!data.session?.access_token) {
      setError('CraftCompass AI did not receive a login session.')
      setLoading(false)
      return
    }

    await routeSession(data.session.access_token)
    setLoading(false)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(180deg, #f8fbfc 0%, #eef6f7 100%)' }}>
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 390, display: 'flex', flexDirection: 'column', gap: 14, background: '#ffffff', border: '1px solid #dbe7ea', borderRadius: 24, padding: '28px 26px', boxShadow: '0 18px 50px rgba(11,45,66,0.10)' }}>
        <BrandLogo width={200} style={{ margin: '0 auto 6px' }} />
        <div
          style={{
            textAlign: 'center',
            color: 'var(--cc-deep-navy)',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.01em',
            marginBottom: 14,
          }}
        >
          Real Skills. Smart Solutions.
        </div>

        {checkingSession ? (
          <div style={{ fontSize: 14, color: '#6b7280' }}>Checking your sign-in...</div>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{ padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
            />

            <button type="submit" disabled={loading || !email || !password} style={{ padding: 12, fontSize: 16, borderRadius: 8, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <div style={{ margin: '4px 0', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>or use an email sign-in code</div>

            <button
              type="button"
              onClick={() => void handleSendOtp()}
              disabled={loading || !email}
              style={{ padding: 12, fontSize: 16, borderRadius: 8, cursor: loading ? 'default' : 'pointer' }}
            >
              {loading ? 'Working...' : 'Send email code'}
            </button>

            {otpStatus && <div style={{ fontSize: 14, color: '#166534', lineHeight: 1.4 }}>{otpStatus}</div>}

            <input
              type="text"
              inputMode="numeric"
              placeholder="Email code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.trim())}
              autoComplete="one-time-code"
              style={{ padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
            />

            <button
              type="button"
              onClick={() => void handleOtpLogin()}
              disabled={loading || !email || !otp}
              style={{ padding: 12, fontSize: 16, borderRadius: 8, cursor: loading ? 'default' : 'pointer' }}
            >
              Sign in with email code
            </button>

            {error && <div style={{ fontSize: 14 }}>{error}</div>}

            <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: '#6b7280' }}>
              Signing in here will switch CraftCompass AI to the account and role you enter.
            </div>
          </>
        )}
      </form>
    </main>
  )
}
