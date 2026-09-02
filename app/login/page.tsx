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

  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

     if (session) {
  const roleResponse = await fetch('/api/auth/role', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (roleResponse.ok) {
    const { role } = await roleResponse.json()

    if (role === 'manager') {
      router.replace('/manager')
      return
    }
  }

  router.replace('/technician')
  return
} 
      setCheckingSession(false)
    }

    redirectIfLoggedIn()
  }, [router])

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
  router.push('/manager')
  return
}

router.push('/technician')
  }

  if (checkingSession) {
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
        <div>Loading...</div>
      </main>
    )
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
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #ccc',
          }}
        />

        {error && (
          <div style={{ fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
