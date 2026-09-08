'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type UserRow = {
  id: string
  email: string
  companyName: string
  role: string
  isActive: boolean
  isPlatformAdmin: boolean
}

export default function PlatformAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token || ''

  const load = useCallback(async () => {
    const accessToken = await token()
    if (!accessToken) return void (window.location.href = '/login')
    const response = await fetch('/api/platform-admin/users', { cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'Could not load users.'); setLoading(false); return }
    setUsers(data.users || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const changeActive = async (user: UserRow) => {
    const accessToken = await token()
    const response = await fetch('/api/platform-admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ profileId: user.id, isActive: !user.isActive }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setError(data.error || 'Could not update user.')
    setUsers((rows) => rows.map((row) => row.id === user.id ? { ...row, isActive: !row.isActive } : row))
  }

  const resendSetup = async (user: UserRow) => {
    setError('')
    setStatus('')
    const accessToken = await token()
    const response = await fetch('/api/platform-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ profileId: user.id }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setError(data.error || 'Could not resend setup invite.')
    setStatus(`Setup invite sent to ${user.email}.`)
  }

  const remove = async (user: UserRow) => {
    if (!window.confirm(`Permanently remove ${user.email} from Tradewise? This cannot be undone.`)) return
    const accessToken = await token()
    const response = await fetch('/api/platform-admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ profileId: user.id }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setError(data.error || 'Could not remove user.')
    setUsers((rows) => rows.filter((row) => row.id !== user.id))
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f8', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <header style={{ background: '#111827', color: '#fff', padding: '18px 20px' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Tradewise</div>
        <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>PLATFORM ADMIN · USERS</div>
        <nav style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <a href="/platform-admin" style={navStyle}>Companies</a>
          <a href="/platform-admin/users" style={{ ...navStyle, background: '#273449' }}>Users</a>
        </nav>
      </header>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 60px' }}>
        <h1 style={{ margin: 0, fontSize: 34 }}>Users</h1>
        <p style={{ color: '#64748b' }}>Manage company access across Tradewise.</p>
        {error && <div style={{ padding: 12, background: '#fff7ed', color: '#9a3412', borderRadius: 10 }}>{error}</div>}
        {status && <div style={{ marginTop: 10, padding: 12, background: '#f0fdf4', color: '#166534', borderRadius: 10 }}>{status}</div>}

        <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
          {loading ? <div>Loading users…</div> : users.map((user) => (
            <div key={user.id} style={cardStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{user.email}</div>
                <div style={{ marginTop: 4, color: '#64748b', fontSize: 13 }}>
                  {user.companyName} · {user.role}{user.isPlatformAdmin ? ' · Platform Admin' : ''} · {user.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!user.isPlatformAdmin && (
                  <>
                    <button onClick={() => void resendSetup(user)} style={buttonStyle}>Resend Setup</button>
                    <button onClick={() => void changeActive(user)} style={buttonStyle}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button>
                    <button onClick={() => void remove(user)} style={{ ...buttonStyle, color: '#b91c1c' }}>Remove</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

const navStyle: React.CSSProperties = { color: '#fff', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800 }
const cardStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }
const buttonStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }
