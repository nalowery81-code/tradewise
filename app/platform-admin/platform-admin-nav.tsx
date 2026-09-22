'use client'

import { usePathname } from 'next/navigation'

type Variant = 'sidebar' | 'header'

const items = [
  { href: '/platform-admin', label: 'Dashboard' },
  { href: '/platform-admin/companies', label: 'Companies' },
  { href: '/platform-admin/users', label: 'Users' },
  { href: '/platform-admin/conversation-audit', label: 'Conversation Audit' },
  { href: '/platform-admin/guidance', label: 'Guidance Library' },
]

export default function PlatformAdminNav({ variant = 'sidebar' }: { variant?: Variant }) {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        .platform-admin-nav {
          gap: 8px;
        }
        .platform-admin-nav-sidebar {
          display: grid;
          margin-top: 30px;
        }
        .platform-admin-nav-header {
          display: flex;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .platform-admin-nav a {
          box-sizing: border-box;
          min-width: 0;
          border-radius: 9px;
          padding: 11px 12px;
          color: #a8b4c5;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.25;
        }
        .platform-admin-nav a[data-active="true"] {
          background: #273449;
          color: #ffffff;
        }
        @media (max-width: 1000px) {
          .platform-admin-nav-sidebar,
          .platform-admin-nav-header {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100%;
            gap: 8px !important;
            margin-top: 20px !important;
          }
          .platform-admin-nav a {
            width: 100%;
            padding: 12px 14px;
            text-align: left;
          }
        }
      `}</style>

      <nav className={`platform-admin-nav platform-admin-nav-${variant}`}>
        {items.map((item) => {
          const active =
            item.href === '/platform-admin'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <a key={item.href} href={item.href} data-active={active ? 'true' : 'false'}>
              {item.label}
            </a>
          )
        })}
      </nav>
    </>
  )
}
