'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOwner, setIsOwner] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const loadRole = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      try {
        const response = await fetch('/api/auth/role', {
          cache: 'no-store',
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

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 900)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const inOwnerWorkspace =
    pathname.startsWith('/manager/company') ||
    pathname.startsWith('/manager/assignments') ||
    pathname.startsWith('/manager/add-manager') ||
    pathname.startsWith('/manager/add-technician')

  const ownerLinks = [
    { label: 'Company', href: '/manager/company', active: pathname.startsWith('/manager/company') },
    { label: 'Assignments', href: '/manager/assignments', active: pathname.startsWith('/manager/assignments') },
    { label: 'Add Manager', href: '/manager/add-manager', active: pathname.startsWith('/manager/add-manager') },
    { label: 'Add Technician', href: '/manager/add-technician', active: pathname.startsWith('/manager/add-technician') },
  ]

  if (isOwner && inOwnerWorkspace) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f8' }}>
        {isDesktop ? (
          <aside style={sidebarStyle}>
            <div>
              <div style={brandStyle}>Tradewise</div>
              <div style={workspaceLabelStyle}>Owner Workspace</div>
            </div>

            <nav style={navStyle} aria-label="Owner workspace navigation">
              {ownerLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  style={{ ...navLinkStyle, ...(link.active ? activeNavLinkStyle : {}) }}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <a href="/manager" style={backToManagerStyle}>← Manager Workspace</a>
          </aside>
        ) : (
          <div style={mobileNavStyle}>
            <div style={{ minWidth: 'max-content', fontWeight: 800 }}>Owner</div>
            {ownerLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{ ...mobileLinkStyle, ...(link.active ? activeMobileLinkStyle : {}) }}
              >
                {link.label}
              </a>
            ))}
            <a href="/manager" style={mobileLinkStyle}>Manager</a>
          </div>
        )}

        <div style={isDesktop ? { marginLeft: 236 } : { paddingTop: 58 }}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      {isOwner && (
        <a href="/manager/company" style={ownerLinkStyle}>Company</a>
      )}
    </>
  )
}

const sidebarStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '0 auto 0 0',
  width: 236,
  zIndex: 110,
  display: 'flex',
  flexDirection: 'column',
  padding: '28px 18px 20px',
  background: '#ffffff',
  borderRight: '1px solid #e5e7eb',
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
}

const brandStyle: React.CSSProperties = {
  color: '#172033',
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
}

const workspaceLabelStyle: React.CSSProperties = {
  marginTop: 5,
  color: '#64748b',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const navStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  marginTop: 30,
}

const navLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 11px',
  borderRadius: 10,
  color: '#475569',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 650,
}

const activeNavLinkStyle: React.CSSProperties = {
  background: '#eef2f6',
  color: '#172033',
  fontWeight: 800,
}

const backToManagerStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: '10px 11px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  color: '#475569',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
}

const mobileNavStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 120,
  height: 58,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  overflowX: 'auto',
  padding: '0 12px',
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
}

const mobileLinkStyle: React.CSSProperties = {
  minWidth: 'max-content',
  padding: '7px 9px',
  borderRadius: 8,
  color: '#64748b',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
}

const activeMobileLinkStyle: React.CSSProperties = {
  background: '#eef2f6',
  color: '#172033',
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
