'use client'

import PlatformAdminNav from './platform-admin-nav'

export default function PlatformAdminShell({
  children,
  maxWidth = 1380,
  contentPadding = '34px clamp(20px, 4vw, 52px) 60px',
}: {
  children: React.ReactNode
  maxWidth?: number
  contentPadding?: string
}) {
  return (
    <main style={pageStyle}>
      <style>{`
        @media (max-width: 900px) {
          .platform-admin-shell-sidebar {
            position: static !important;
            width: auto !important;
            min-height: auto !important;
            padding: 20px 16px 16px !important;
          }
          .platform-admin-shell-content {
            margin-left: 0 !important;
            padding: 22px 14px 48px !important;
          }
          .platform-admin-owner-link {
            margin-top: 16px !important;
          }
        }
      `}</style>

      <aside className="platform-admin-shell-sidebar" style={sidebarStyle}>
        <div>
          <div style={brandStyle}>CraftCompass AI</div>
          <div style={adminLabelStyle}>Platform Admin</div>
        </div>

        <PlatformAdminNav />

        <div style={{ marginTop: 'auto', display: 'grid', gap: 8, paddingTop: 18 }}>
          <a className="platform-admin-owner-link" href="/platform-admin/owner-workspace" style={ownerWorkspaceStyle}>
            ← Owner Workspace
          </a>
        </div>
      </aside>

      <section className="platform-admin-shell-content" style={{ marginLeft: 244, padding: contentPadding }}>
        <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
      </section>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f7f7f8',
  color: '#172033',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const sidebarStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '0 auto 0 0',
  width: 244,
  minHeight: '100vh',
  padding: '30px 20px 22px',
  boxSizing: 'border-box',
  background: '#111827',
  color: '#f8fafc',
  borderRight: '1px solid #1f2937',
  display: 'flex',
  flexDirection: 'column',
}

const brandStyle: React.CSSProperties = {
  fontSize: 23,
  lineHeight: 1.15,
  fontWeight: 850,
  letterSpacing: '-0.02em',
  whiteSpace: 'nowrap',
}

const adminLabelStyle: React.CSSProperties = {
  marginTop: 7,
  color: '#94a3b8',
  fontSize: 11,
  lineHeight: 1.2,
  fontWeight: 850,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
}

const ownerWorkspaceStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 11px',
  border: '1px solid #334155',
  borderRadius: 9,
  color: '#e2e8f0',
  textDecoration: 'none',
  fontSize: 12,
  lineHeight: 1.25,
  fontWeight: 800,
}
