'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        if (session?.access_token) {
          await routeSession(session.access_token)
        }
      } catch (sessionError) {
        console.error('LOGIN SESSION CHECK ERROR:', sessionError)
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

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>CraftCompass AI</h1>

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
              required
              autoComplete="current-password"
              style={{ padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
            />

            {error && <div style={{ fontSize: 14 }}>{error}</div>}

            <button type="submit" disabled={loading} style={{ padding: 12, fontSize: 16, borderRadius: 8, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: '#6b7280' }}>
              Signing in here will switch CraftCompass AI to the account and role you enter.
            </div>
          </>
        )}
      </form>
    </main>
  )
}
