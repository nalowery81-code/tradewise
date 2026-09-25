'use client'

import { usePathname } from 'next/navigation'

type IconName =
  | 'home'
  | 'building'
  | 'users'
  | 'card'
  | 'chart'
  | 'chat'
  | 'book'
  | 'queue'
  | 'database'
  | 'health'
  | 'shield'
  | 'key'
  | 'grid'
  | 'brain'

const groups = [
  {
    label: 'Core',
    icon: 'grid' as IconName,
    items: [
      { href: '/platform-admin', label: 'Dashboard', icon: 'home' as IconName },
      { href: '/platform-admin/companies', label: 'Companies', icon: 'building' as IconName },
      { href: '/platform-admin/users', label: 'Users', icon: 'users' as IconName },
      { href: '/platform-admin/billing-plans', label: 'Billing & Plans', icon: 'card' as IconName },
      { href: '/platform-admin/reports', label: 'Reports', icon: 'chart' as IconName },
    ],
  },
  {
    label: 'AI & Operations',
    icon: 'brain' as IconName,
    items: [
      { href: '/platform-admin/conversation-audit', label: 'Conversation Audit', icon: 'chat' as IconName },
      { href: '/platform-admin/guidance', label: 'Guidance Library', icon: 'book' as IconName },
      { href: '/platform-admin/normalization-candidates', label: 'Normalization Queue', icon: 'queue' as IconName },
      { href: '/platform-admin/knowledge-sources', label: 'Knowledge & Sources', icon: 'database' as IconName },
      { href: '/platform-admin/system-health', label: 'System Health', icon: 'health' as IconName },
    ],
  },
  {
    label: 'Administration',
    icon: 'shield' as IconName,
    items: [
      { href: '/platform-admin/security-audit', label: 'Security & Audit Log', icon: 'shield' as IconName },
      { href: '/platform-admin/account', label: 'Account & Password', icon: 'key' as IconName },
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
          gap: 14px;
          margin-top: 24px;
          width: 100%;
        }
        .platform-admin-nav-group {
          display: grid;
          gap: 5px;
          padding-bottom: 13px;
          border-bottom: 1px solid rgba(71,85,105,.58);
        }
        .platform-admin-nav-group:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }
        .platform-admin-nav-heading {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 3px;
          padding: 9px 11px;
          border-radius: 10px;
          background: #1c2738;
          color: #f8fafc;
          font-size: 12px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: .01em;
        }
        .platform-admin-nav-heading svg,
        .platform-admin-nav a svg {
          flex: 0 0 auto;
        }
        .platform-admin-nav a {
          display: flex;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          border-radius: 9px;
          padding: 8px 11px;
          color: #b7c2d1;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
          transition: background .15s ease, color .15s ease;
        }
        .platform-admin-nav a:hover {
          background: #1f2a3a;
          color: #f8fafc;
        }
        .platform-admin-nav a[data-active="true"] {
          background: #2b3b54;
          color: #ffffff;
        }
        .platform-admin-nav a[data-active="true"] svg {
          color: #dbeafe;
        }
        @media (max-width: 900px) {
          .platform-admin-nav {
            grid-template-columns: 1fr;
            gap: 12px;
            margin-top: 18px;
          }
          .platform-admin-nav-group {
            padding-bottom: 10px;
          }
          .platform-admin-nav a {
            white-space: normal;
          }
        }
      `}</style>

      <nav className="platform-admin-nav" aria-label="Platform Admin">
        {groups.map((group) => (
          <div className="platform-admin-nav-group" key={group.label}>
            <div className="platform-admin-nav-heading">
              <NavIcon name={group.icon} />
              <span>{group.label}</span>
            </div>
            {group.items.map((item) => {
              const active =
                item.href === '/platform-admin'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <a key={item.href} href={item.href} data-active={active ? 'true' : 'false'}>
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              )
            })}
          </div>
        ))}
      </nav>
    </>
  )
}

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
    case 'building':
      return <svg {...common}><path d="M4 21V3h10v18"/><path d="M14 8h6v13"/><path d="M8 7h2M8 11h2M8 15h2M17 12h1M17 16h1"/><path d="M2 21h20"/></svg>
    case 'users':
      return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8"/><path d="M17 15c2.5.3 4 2 4 4.5"/></svg>
    case 'card':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 15h4"/></svg>
    case 'chart':
      return <svg {...common}><path d="M5 20v-7h3v7zM11 20V8h3v12zM17 20V4h3v16z"/></svg>
    case 'chat':
      return <svg {...common}><path d="M21 14a7 7 0 0 1-7 7H8l-5 2 2-5a8 8 0 1 1 16-4Z"/></svg>
    case 'book':
      return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z"/></svg>
    case 'queue':
      return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
    case 'database':
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>
    case 'health':
      return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/><path d="M10 12h4M12 10v4"/></svg>
    case 'shield':
      return <svg {...common}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/></svg>
    case 'key':
      return <svg {...common}><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 8l2 2M17 6l2 2"/></svg>
    case 'brain':
      return <svg {...common}><path d="M9 5a3 3 0 0 0-5 2c0 1 .4 1.8 1 2.4A3.5 3.5 0 0 0 6 16a3 3 0 0 0 3 3"/><path d="M15 5a3 3 0 0 1 5 2c0 1-.4 1.8-1 2.4A3.5 3.5 0 0 1 18 16a3 3 0 0 1-3 3"/><path d="M9 5v14M15 5v14M9 9H7M15 9h2M9 14H7M15 14h2"/></svg>
    case 'grid':
    default:
      return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
  }
}
