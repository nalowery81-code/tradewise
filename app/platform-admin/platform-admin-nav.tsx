'use client'

import { usePathname } from 'next/navigation'

const groups = [
  {
    label: 'Overview',
    items: [
      { href: '/platform-admin', label: 'Dashboard' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/platform-admin/companies', label: 'Companies' },
      { href: '/platform-admin/users', label: 'Users' },
      { href: '/platform-admin/billing-plans', label: 'Billing & Plans' },
      { href: '/platform-admin/reports', label: 'Reports' },
    ],
  },
  {
    label: 'AI & Quality',
    items: [
      { href: '/platform-admin/conversation-audit', label: 'Conversation Audit' },
      { href: '/platform-admin/guidance', label: 'Guidance Library' },
      { href: '/platform-admin/normalization-candidates', label: 'Normalization Queue' },
      { href: '/platform-admin/knowledge-sources', label: 'Knowledge & Sources' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/platform-admin/system-health', label: 'System Health' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/platform-admin/security-audit', label: 'Security & Audit Log' },
    ],
  },
]

export default function PlatformAdminNav() {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        .platform-admin-nav {
          display: grid;
          gap: 16px;
          margin-top: 26px;
          width: 100%;
        }
        .platform-admin-nav-group {
          display: grid;
          gap: 5px;
        }
        .platform-admin-nav-heading {
          padding: 0 11px 3px;
          color: #64748b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .11em;
          text-transform: uppercase;
        }
        .platform-admin-nav a {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          border-radius: 9px;
          padding: 9px 12px;
          color: #a8b4c5;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.25;
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
            gap: 12px;
            margin-top: 18px;
          }
          .platform-admin-nav a {
            white-space: normal;
          }
        }
      `}</style>

      <nav className="platform-admin-nav" aria-label="Platform Admin">
        {groups.map((group) => (
          <div className="platform-admin-nav-group" key={group.label}>
            <div className="platform-admin-nav-heading">{group.label}</div>
            {group.items.map((item) => {
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
          </div>
        ))}
      </nav>
    </>
  )
}
