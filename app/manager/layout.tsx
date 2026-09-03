'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    const loadRole = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      try {
        const response = await fetch('/api/auth/role', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) return
        const data = await response.json()
        setIsOwner(data.accountRole === 'owner')
      } catch (error) {
        console.error('OWNER NAV ROLE ERROR:', error)
      }
    }

    void loadRole()
  }, [])

  const inOwnerSetup = pathname.startsWith('/manager/company') || pathname.startsWith('/manager/add-manager')

  return (
    <>
      {children}
      {isOwner && (
        <a
          href={inOwnerSetup ? '/manager' : '/manager/company'}
          style={ownerLinkStyle}
        >
          {inOwnerSetup ? 'Manager' : 'Company'}
        </a>
      )}
    </>
  )
}

const ownerLinkStyle: React.CSSProperties = {
  position: 'fixed',
  top: 14,
  right: 18,
  zIndex: 100,
  textDecoration: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#172033',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 13,
  fontWeight: 700,
  boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
}
