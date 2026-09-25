'use client'

import { usePathname } from 'next/navigation'

const items = [
  { href: '/platform-admin', label: 'Dashboard' },
  { href: '/platform-admin/companies', label: 'Companies' },
  { href: '/platform-admin/reports', label: 'Reports' },
  { href: '/platform-admin/users', label: 'Users' },
  { href: '/platform-admin/conversation-audit', label: 'Conversation Audit' },
  { href: '/platform-admin/guidance', label: 'Guidance Library' },
  { href: '/platform-admin/normalization-candidates', label: 'Normalization Queue' },
]

export default function PlatformAdminNav() {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        .platform-admin-nav {
          display: grid;
          gap: 6px;
          margin-top: 28px;
          width: 100%;
        }
        .platform-admin-nav a {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          border-radius: 9px;
          padding: 10px 12px;
          color: #a8b4c5;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.25;
          white-space: nowrap;
        }
        .platform-admin-nav a:hover {
          background: #1f2a3a;
          color: #f8fafc;
        }
        .platform-admin-nav a[data-active="true"] {
          background: #273449;
          color: #ffffff;
        }
        @media (max-width: 900px) {
          .platform-admin-nav {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px;
            margin-top: 18px;
          }
          .platform-admin-nav a {
            white-space: normal;
          }
        }
      `}</style>

      <nav className="platform-admin-nav" aria-label="Platform Admin">
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
