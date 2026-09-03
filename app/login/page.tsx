'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)
    setError('')

    const {
      data: { session },
      error,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const roleResponse = await fetch('/api/auth/role', {
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    })

    if (!roleResponse.ok) {
      setError('Could not determine your Tradewise role.')
      setLoading(false)
      return
    }

    const { role } = await roleResponse.json()

    if (role === 'manager') {
      router.replace('/manager')
      return
    }

    router.replace('/technician')
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: '100%',
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>Tradewise</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #ccc',
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #ccc',
          }}
        />

        {error && <div style={{ fontSize: 14 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            lineHeight: 1.5,
            color: '#6b7280',
          }}
        >
          Signing in here will switch Tradewise to the account and role you enter.
        </div>
      </form>
    </main>
  )
}
