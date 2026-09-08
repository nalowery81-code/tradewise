'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ManagerAccess = {
  isOwner: boolean
  isPlatformAdmin: boolean
}

export default function SessionControls() {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [managerAccess, setManagerAccess] = useState<ManagerAccess>({
    isOwner: false,
    isPlatformAdmin: false,
  })

  useEffect(() => {
    if (pathname !== '/manager') return

    const updateViewport = () => setIsDesktop(window.innerWidth >= 768)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [pathname])

  useEffect(() => {
    if (pathname !== '/manager') return

    const loadManagerAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      try {
        const response = await fetch('/api/auth/role', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) return

        const data = await response.json()
        setManagerAccess({
          isOwner: data.accountRole === 'owner',
          isPlatformAdmin: data.isPlatformAdmin === true,
        })
      } catch (error) {
        console.error('MANAGER ADMIN NAV ERROR:', error)
      }
    }

    void loadManagerAccess()
  }, [pathname])

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  if (pathname === '/manager' && isDesktop && (managerAccess.isOwner || managerAccess.isPlatformAdmin)) {
    return (
      <div
        style={{
          position: 'fixed',
          left: 14,
          bottom: 70,
          zIndex: 45,
          width: 222,
          display: 'grid',
          gap: 6,
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            padding: '0 10px 3px',
            color: '#94a3b8',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Administration
        </div>

        {managerAccess.isOwner && (
          <a href="/manager/overview" style={managerNavLinkStyle}>
            Owner Workspace
          </a>
        )}

        {managerAccess.isPlatformAdmin && (
          <a href="/platform-admin/return" style={{ ...managerNavLinkStyle, ...platformAdminLinkStyle }}>
            Platform Admin
          </a>
        )}
      </div>
    )
  }

  if (!pathname.startsWith('/platform-admin')) return null

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={signingOut}
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 500,
        border: '1px solid #cbd5e1',
        borderRadius: 9,
        padding: '9px 12px',
        background: '#ffffff',
        color: '#172033',
        fontSize: 13,
        fontWeight: 800,
        cursor: signingOut ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
        opacity: signingOut ? 0.65 : 1,
      }}
    >
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

const managerNavLinkStyle: React.CSSProperties = {
  display: 'block',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '10px 11px',
  background: '#ffffff',
  color: '#475569',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
  boxShadow: '0 2px 8px rgba(15,23,42,0.035)',
}

const platformAdminLinkStyle: React.CSSProperties = {
  background: '#172033',
  borderColor: '#172033',
  color: '#ffffff',
}
