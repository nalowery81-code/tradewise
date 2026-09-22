'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function OwnerWorkspaceReturnPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/platform-admin/owner-workspace', {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(result.error || 'Could not return to Owner Workspace.')
        return
      }

      window.location.replace('/manager/overview')
    })()
  }, [])

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={titleStyle}>CraftCompass AI</div>
        {error ? (
          <>
            <div style={errorStyle}>{error}</div>
            <a href="/platform-admin" style={linkStyle}>← Back to Platform Admin</a>
          </>
        ) : (
          <div style={statusStyle}>Returning to Owner Workspace…</div>
        )}
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  boxSizing: 'border-box',
  background: '#f7f7f8',
  fontFamily: 'Arial, Helvetica, sans-serif',
  color: '#172033',
}
const cardStyle: React.CSSProperties = {
  width: 'min(420px, 100%)',
  padding: 24,
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 8px 30px rgba(15,23,42,0.08)',
}
const titleStyle: React.CSSProperties = { fontSize: 20, fontWeight: 900 }
const statusStyle: React.CSSProperties = { marginTop: 12, color: '#64748b' }
const errorStyle: React.CSSProperties = { marginTop: 12, color: '#991b1b', lineHeight: 1.5 }
const linkStyle: React.CSSProperties = { display: 'inline-block', marginTop: 16, color: '#334155', fontWeight: 800, textDecoration: 'none' }
