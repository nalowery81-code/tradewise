'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function ImpersonationBanner() {
  const pathname = usePathname()
  const [state, setState] = useState({
    isImpersonating: false,
    email: '',
    companyName: '',
  })

  useEffect(() => {
    if (!pathname.startsWith('/manager')) {
      setState({ isImpersonating: false, email: '', companyName: '' })
      return
    }

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      try {
        const response = await fetch('/api/auth/role', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) return
        const data = await response.json()
        setState({
          isImpersonating: data.isImpersonating === true,
          email: data.impersonatedEmail || '',
          companyName: data.companyName || '',
        })
      } catch (error) {
        console.error('IMPERSONATION BANNER ERROR:', error)
      }
    }

    void load()
  }, [pathname])

  if (!state.isImpersonating) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 66,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'calc(100vw - 24px)',
        padding: '9px 10px 9px 14px',
        border: '1px solid #f59e0b',
        borderRadius: 999,
        background: '#fffbeb',
        color: '#78350f',
        boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Acting as {state.email || 'selected user'}{state.companyName ? ` at ${state.companyName}` : ''}
      </span>
      <a
        href="/platform-admin/return"
        style={{
          flexShrink: 0,
          padding: '6px 10px',
          borderRadius: 999,
          background: '#78350f',
          color: '#ffffff',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        Exit
      </a>
    </div>
  )
}
