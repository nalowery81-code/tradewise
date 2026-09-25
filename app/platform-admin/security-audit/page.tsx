'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function SecurityAuditPage() {
  const [data, setData] = useState<any>(null)
  const [category, setCategory] = useState('all')
  const [action, setAction] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/platform-admin/security-audit', {
      cache:'no-store',
      headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load audit log.')
    setData(body)
  }

  useEffect(() => { void load().catch((e:any) => setError(e?.message || 'Could not load audit log.')) }, [])

  const actions = useMemo<string[]>(() =>
    [...new Set<string>((data?.events || []).map((event:any) => String(event.action || '')))]
      .filter(Boolean)
      .sort(),
    [data]
  )

  const events = useMemo(() => {
    const q=search.trim().toLowerCase()
    return (data?.events || []).filter((event:any) => {
      if (category !== 'all' && event.category !== category) return false
      if (action !== 'all' && event.action !== action) return false
      if (!q) return true
      return [
        event.action, event.category, event.companyName, event.note,
        event.admin?.displayName, event.admin?.email, event.target?.displayName, event.target?.email
      ].some((value) => String(value || '').toLowerCase().includes(q))
    })
  }, [data, category, action, search])

  const exportCsv = () => {
    const headers=['Time','Category','Action','Administrator','Admin Email','Target','Target Email','Company','Note','Before','After']
    const rows=events.map((event:any) => [
      event.createdAt,event.category,event.action,event.admin?.displayName || '',event.admin?.email || '',
      event.target?.displayName || '',event.target?.email || '',event.companyName || '',event.note || '',
      JSON.stringify(event.beforeState || ''),JSON.stringify(event.afterState || '')
    ])
    const escape=(value:unknown) => `"${String(value ?? '').replace(/"/g,'""')}"`
    const csv=[headers,...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob=new Blob([csv],{ type:'text/csv;charset=utf-8' })
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url; a.download=`craftcompass-audit-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <PlatformAdminShell>
      <div style={headerRowStyle}>
        <div>
          <div style={eyebrowStyle}>Administration</div>
          <h1 style={headingStyle}>Security & Audit Log</h1>
          <p style={subtleStyle}>Find who changed what, inspect before/after state, and export the operational record.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => void load().catch((e:any) => setError(e?.message || 'Could not refresh.'))} style={secondaryButton}>Refresh</button>
          <button onClick={exportCsv} disabled={!events.length} style={primaryButton}>Export CSV</button>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Audit events" value={data.summary.totalEvents} />
            <Metric label="User admin" value={data.summary.userAdminEvents} />
            <Metric label="Company admin" value={data.summary.companyAdminEvents} />
            <Metric label="Impersonation" value={data.summary.impersonationEvents} />
          </div>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={toolbarStyle}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search admin, user, company, action…" style={{ ...inputStyle, minWidth:260 }} />
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                  <option value="all">All categories</option>
                  <option value="user_admin">User administration</option>
                  <option value="company_admin">Company administration</option>
                  <option value="impersonation">Impersonation</option>
                </select>
                <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
                  <option value="all">All actions</option>
                  {actions.map((item:string) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div style={subtleStyle}>{events.length} matching events</div>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Time</th><th style={thStyle}>Action</th><th style={thStyle}>Administrator</th><th style={thStyle}>Target</th><th style={thStyle}>Company</th><th style={thStyle}>Detail</th></tr></thead>
                <tbody>
                  {events.map((event:any) => (
                    <>
                      <tr key={event.id}>
                        <td style={tdStyle}>{new Date(event.createdAt).toLocaleString()}</td>
                        <td style={tdStyle}><strong>{event.action}</strong><div style={subtleStyle}>{event.category}</div></td>
                        <td style={tdStyle}>{event.admin?.displayName || 'Unknown'}<div style={subtleStyle}>{event.admin?.email || ''}</div></td>
                        <td style={tdStyle}>{event.target?.displayName || '—'}<div style={subtleStyle}>{event.target?.email || ''}</div></td>
                        <td style={tdStyle}>{event.companyId ? <a href={`/platform-admin/companies/${event.companyId}`} style={linkStyle}>{event.companyName || 'Company'}</a> : event.companyName || '—'}</td>
                        <td style={tdStyle}>
                          <button onClick={() => setExpanded(expanded === event.id ? '' : event.id)} style={secondaryButton}>
                            {expanded === event.id ? 'Hide' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                      {expanded === event.id && (
                        <tr key={`${event.id}:detail`}>
                          <td colSpan={6} style={{ ...tdStyle, background:'#f8fafc' }}>
                            {event.note && <div style={{ marginBottom:8 }}><strong>Note:</strong> {event.note}</div>}
                            <div style={detailGridStyle}>
                              <div><strong>Before</strong><pre style={preStyle}>{JSON.stringify(event.beforeState, null, 2) || '—'}</pre></div>
                              <div><strong>After</strong><pre style={preStyle}>{JSON.stringify(event.afterState, null, 2) || '—'}</pre></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {!events.length && <tr><td style={tdStyle} colSpan={6}>No matching audit events.</td></tr>}
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
const headerRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }
const toolbarStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }
const detailGridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }
const preStyle: React.CSSProperties = { margin:'6px 0 0', padding:10, border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', overflowX:'auto', fontSize:11, whiteSpace:'pre-wrap' }
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const inputStyle: React.CSSProperties = { padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:12 }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:900, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const primaryButton: React.CSSProperties = { border:0, borderRadius:8, padding:'9px 11px', background:'#172033', color:'#fff', fontWeight:800, cursor:'pointer' }
const secondaryButton: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:8, padding:'7px 9px', background:'#fff', color:'#334155', fontWeight:800, cursor:'pointer' }
const linkStyle: React.CSSProperties = { color:'#075985', fontWeight:800 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
