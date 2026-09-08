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

type CompanyRow = {
  id: string
  name: string
  status: string
}

export default function PlatformAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [switchingUserId, setSwitchingUserId] = useState('')

  const [showAddUser, setShowAddUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newCompanyId, setNewCompanyId] = useState('')
  const [newRole, setNewRole] = useState<'owner' | 'manager' | 'technician'>('technician')
  const [newActive, setNewActive] = useState(true)
  const [creating, setCreating] = useState(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token || ''

  const load = useCallback(async () => {
    const accessToken = await token()
    if (!accessToken) return void (window.location.href = '/login')

    const [usersResponse, companiesResponse] = await Promise.all([
      fetch('/api/platform-admin/users', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch('/api/platform-admin/companies', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])

    const usersData = await usersResponse.json().catch(() => ({}))
    const companiesData = await companiesResponse.json().catch(() => ({}))

    if (!usersResponse.ok || !companiesResponse.ok) {
      setError(usersData.error || companiesData.error || 'Could not load platform users.')
      setLoading(false)
      return
    }

    const companyRows = (companiesData.companies || []) as CompanyRow[]
    setUsers(usersData.users || [])
    setCompanies(companyRows)
    setNewCompanyId((current) => current || companyRows.find((company) => company.status !== 'disabled')?.id || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const createUser = async (sendSetup: boolean) => {
    const name = newName.replace(/\s+/g, ' ').trim()
    const email = newEmail.trim().toLowerCase()

    setError('')
    setStatus('')

    if (!name || !email || !newCompanyId) {
      setError('Enter the name and email, then choose a company.')
      return
    }

    setCreating(true)

    try {
      const accessToken = await token()
      if (!accessToken) return void (window.location.href = '/login')

      const response = await fetch('/api/platform-admin/users/create', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          email,
          companyId: newCompanyId,
          role: newRole,
          isActive: newActive,
          sendSetup,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Could not create user.')
        return
      }

      setStatus(sendSetup
        ? `${name} was created and a setup email was sent to ${email}.`
        : `${name} was created without sending an email.`)
      setNewName('')
      setNewEmail('')
      setNewRole('technician')
      setNewActive(true)
      setShowAddUser(false)
      await load()
    } catch (createError) {
      console.error('PLATFORM CREATE USER ERROR:', createError)
      setError('Could not create user.')
    } finally {
      setCreating(false)
    }
  }

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

  const switchUser = async (user: UserRow) => {
    if (!window.confirm(`Switch into ${user.email} at ${user.companyName}?`)) return

    setError('')
    setStatus('')
    setSwitchingUserId(user.id)

    const accessToken = await token()
    const response = await fetch('/api/platform-admin/impersonate', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ profileId: user.id }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Could not switch user.')
      setSwitchingUserId('')
      return
    }

    window.location.href = '/manager'
  }

  const remove = async (user: UserRow) => {
    if (!window.confirm(`Permanently remove ${user.email} from CraftCompass AI? This cannot be undone.`)) return
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
        <div style={{ fontSize: 22, fontWeight: 800 }}>CraftCompass AI</div>
        <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>PLATFORM ADMIN · USERS</div>
        <nav style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <a href="/platform-admin" style={navStyle}>Companies</a>
          <a href="/platform-admin/users" style={{ ...navStyle, background: '#273449' }}>Users</a>
        </nav>
      </header>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34 }}>Users</h1>
            <p style={{ color: '#64748b' }}>Manage company access across CraftCompass AI.</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddUser((current) => !current); setError(''); setStatus('') }}
            style={primaryButtonStyle}
          >
            {showAddUser ? 'Cancel' : '+ Add User'}
          </button>
        </div>

        {showAddUser && (
          <section style={addUserCardStyle}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Add user manually</div>
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
                Create an owner, manager, or technician now. You can send their setup email later.
              </div>
            </div>

            <div style={formGridStyle}>
              <label style={labelStyle}>
                Name
                <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Jake Smith" style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Email
                <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="jake@company.com" style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Company
                <select value={newCompanyId} onChange={(event) => setNewCompanyId(event.target.value)} style={inputStyle}>
                  <option value="">Choose a company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id} disabled={company.status === 'disabled'}>
                      {company.name}{company.status === 'disabled' ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Role
                <select value={newRole} onChange={(event) => setNewRole(event.target.value as 'owner' | 'manager' | 'technician')} style={inputStyle}>
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="technician">Technician</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, width: 'fit-content' }}>
              <input type="checkbox" checked={newActive} onChange={(event) => setNewActive(event.target.checked)} />
              Active immediately
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void createUser(false)}
                disabled={creating}
                style={{ ...buttonStyle, padding: '10px 14px', opacity: creating ? 0.6 : 1 }}
              >
                {creating ? 'Creating…' : 'Create without email'}
              </button>
              <button
                type="button"
                onClick={() => void createUser(true)}
                disabled={creating}
                style={{ ...primaryButtonStyle, opacity: creating ? 0.6 : 1 }}
              >
                {creating ? 'Creating…' : 'Create + Send Setup'}
              </button>
            </div>
          </section>
        )}

        {error && <div style={{ marginTop: 14, padding: 12, background: '#fff7ed', color: '#9a3412', borderRadius: 10 }}>{error}</div>}
        {status && <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', color: '#166534', borderRadius: 10 }}>{status}</div>}

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
                    {user.isActive && ['owner', 'manager'].includes(user.role) && (
                      <button
                        onClick={() => void switchUser(user)}
                        disabled={Boolean(switchingUserId)}
                        style={{ ...buttonStyle, background: '#172033', color: '#fff', borderColor: '#172033', opacity: switchingUserId ? 0.6 : 1 }}
                      >
                        {switchingUserId === user.id ? 'Switching…' : 'Switch User'}
                      </button>
                    )}
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
const primaryButtonStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #172033', borderRadius: 9, background: '#172033', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }
const addUserCardStyle: React.CSSProperties = { marginTop: 20, padding: 20, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 14, display: 'grid', gap: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.04)' }
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 7, fontSize: 13, fontWeight: 800 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 11px', fontSize: 14, background: '#fff', color: '#172033' }
