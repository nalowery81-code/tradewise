'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function SecurityAuditPage() {
  const [data, setData] = useState<any>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/platform-admin/security-audit', {
          cache:'no-store',
          headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load audit log.')
        setData(body)
      } catch (e:any) { setError(e?.message || 'Could not load audit log.') }
    })()
  }, [])

  const events = useMemo(() => {
    if (!data?.events) return []
    return filter === 'all' ? data.events : data.events.filter((event:any) => event.category === filter)
  }, [data, filter])

  return (
    <PlatformAdminShell>
      <div style={eyebrowStyle}>Administration</div>
      <h1 style={headingStyle}>Security & Audit Log</h1>
      <p style={subtleStyle}>Administrative changes and impersonation activity retained as an operational record.</p>
      {error && <div style={errorStyle}>{error}</div>}
      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Audit events" value={data.summary.totalEvents} />
            <Metric label="User admin events" value={data.summary.userAdminEvents} />
            <Metric label="Impersonation events" value={data.summary.impersonationEvents} />
          </div>
          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              <h2 style={{ margin:0, fontSize:19 }}>Event history</h2>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:8 }}>
                <option value="all">All events</option>
                <option value="user_admin">User administration</option>
                <option value="impersonation">Impersonation</option>
              </select>
            </div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Time</th><th style={thStyle}>Action</th><th style={thStyle}>Administrator</th><th style={thStyle}>Target</th><th style={thStyle}>Company / Detail</th></tr></thead>
                <tbody>
                  {events.map((event:any) => (
                    <tr key={event.id}>
                      <td style={tdStyle}>{new Date(event.createdAt).toLocaleString()}</td>
                      <td style={tdStyle}><strong>{event.action}</strong><div style={subtleStyle}>{event.category}</div></td>
                      <td style={tdStyle}>{event.admin?.displayName || 'Unknown'}<div style={subtleStyle}>{event.admin?.email || ''}</div></td>
                      <td style={tdStyle}>{event.target?.displayName || '—'}<div style={subtleStyle}>{event.target?.email || ''}</div></td>
                      <td style={tdStyle}>{event.companyName || '—'}{event.note ? <div style={subtleStyle}>{event.note}</div> : null}</td>
                    </tr>
                  ))}
                  {!events.length && <tr><td style={tdStyle} colSpan={5}>No matching audit events.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PlatformAdminShell>
  )
}
function Metric({ label, value }: { label:string; value:string | number }) {
  return <div style={metricStyle}><div style={{ fontSize:21, fontWeight:900 }}>{value}</div><div style={{ marginTop:4, ...subtleStyle, fontSize:10, fontWeight:800 }}>{label}</div></div>
}

const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:13, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:760, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }

