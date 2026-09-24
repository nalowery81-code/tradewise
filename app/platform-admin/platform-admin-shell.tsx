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
          .platform-admin-shared-sidebar {
            position: static !important;
            width: auto !important;
            min-height: auto !important;
          }
          .platform-admin-shared-content {
            margin-left: 0 !important;
            padding: 22px 14px 48px !important;
          }
        }
      `}</style>

      <aside className="platform-admin-shared-sidebar" style={sidebarStyle}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 850 }}>CraftCompass AI</div>
          <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 11, fontWeight: 850, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Platform Admin
          </div>
        </div>
        <PlatformAdminNav variant="sidebar" />
        <a href="/platform-admin/owner-workspace" style={ownerWorkspaceStyle}>← Owner Workspace</a>
      </aside>

      <section className="platform-admin-shared-content" style={{ marginLeft: 244, padding: contentPadding }}>
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

const ownerWorkspaceStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 'auto',
  padding: '10px 11px',
  border: '1px solid #334155',
  borderRadius: 9,
  color: '#e2e8f0',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
}
