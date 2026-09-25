'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function KnowledgeSourcesPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tab, setTab] = useState<'documents'|'editions'|'checks'>('documents')
  const [running, setRunning] = useState(false)

  const load = async () => {
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/platform-admin/knowledge-sources', {
      cache:'no-store',
      headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load knowledge sources.')
    setData(body)
  }

  useEffect(() => { void load().catch((e:any) => setError(e?.message || 'Could not load knowledge sources.')) }, [])

  const runCheck = async () => {
    if (!window.confirm('Run the learning and source-check cycle now?')) return
    setRunning(true)
    setStatus('')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/platform-admin/guidance', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ action:'run_weekly_learning' }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Source check failed.')
      setStatus('Learning and source-check cycle completed.')
      await load()
      setTab('checks')
    } catch (e:any) {
      setError(e?.message || 'Source check failed.')
    } finally {
      setRunning(false)
    }
  }

  const q=search.trim().toLowerCase()
  const documents=useMemo(() => (data?.documents || []).filter((doc:any) =>
    (statusFilter === 'all' || doc.status === statusFilter) &&
    (!q || [doc.title, doc.authority, doc.source_type, doc.source_url].some((value) => String(value || '').toLowerCase().includes(q)))
  ), [data, q, statusFilter])

  const editions=useMemo(() => (data?.editions || []).filter((edition:any) =>
    (statusFilter === 'all' || edition.status === statusFilter) &&
    (!q || [edition.title, edition.code_family, edition.model_code_edition, edition.rule_citation].some((value) => String(value || '').toLowerCase().includes(q)))
  ), [data, q, statusFilter])

  const checks=useMemo(() => (data?.recentChecks || []).filter((check:any) =>
    !q || [check.source_title, check.source_url, check.status, check.error_text].some((value) => String(value || '').toLowerCase().includes(q))
  ), [data, q])

  return (
    <PlatformAdminShell>
      <div style={headerRowStyle}>
        <div>
          <div style={eyebrowStyle}>AI & Quality</div>
          <h1 style={headingStyle}>Knowledge & Sources</h1>
          <p style={subtleStyle}>Search what CraftCompass knows, inspect coverage, open the original authority, and rerun source verification.</p>
        </div>
        <button onClick={() => void runCheck()} disabled={running} style={primaryButton}>{running ? 'Running…' : 'Run source check'}</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={successStyle}>{status}</div>}

      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Source documents" value={data.summary.documents} />
            <Metric label="Current documents" value={data.summary.currentDocuments} />
            <Metric label="Code editions" value={data.summary.editions} />
            <Metric label="Verified sections" value={data.summary.sections} />
            <Metric label="Relationships" value={data.summary.relationships} />
            <Metric label="Recent source issues" value={data.summary.recentCheckIssues} />
          </div>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={toolbarStyle}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Tab active={tab==='documents'} onClick={() => setTab('documents')}>Documents</Tab>
                <Tab active={tab==='editions'} onClick={() => setTab('editions')}>Code editions</Tab>
                <Tab active={tab==='checks'} onClick={() => setTab('checks')}>Source checks</Tab>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sources…" style={inputStyle} />
                {tab !== 'checks' && (
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
                    <option value="all">All statuses</option>
                    <option value="current">Current</option>
                    <option value="draft">Draft</option>
                    <option value="superseded">Superseded</option>
                    <option value="inactive">Inactive</option>
                  </select>
                )}
              </div>
            </div>

            {tab === 'documents' && (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Document</th><th style={thStyle}>Authority</th><th style={thStyle}>Type</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th><th style={thStyle}>Last verified</th></tr></thead>
                  <tbody>
                    {documents.map((doc:any) => (
                      <tr key={doc.id}>
                        <td style={tdStyle}>{doc.source_url ? <a href={doc.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{doc.title}</a> : <strong>{doc.title}</strong>}<div style={subtleStyle}>{doc.content_rights || ''}</div></td>
                        <td style={tdStyle}>{doc.authority || '—'}</td>
                        <td style={tdStyle}>{doc.source_type || '—'}</td>
                        <td style={tdStyle}>{doc.sectionCount}</td>
                        <td style={tdStyle}>{doc.status}</td>
                        <td style={tdStyle}>{doc.last_verified_at ? new Date(doc.last_verified_at).toLocaleString() : 'Not recorded'}</td>
                      </tr>
                    ))}
                    {!documents.length && <tr><td style={tdStyle} colSpan={6}>No matching documents.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'editions' && (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Edition</th><th style={thStyle}>Code family</th><th style={thStyle}>Model edition</th><th style={thStyle}>Documents</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th></tr></thead>
                  <tbody>
                    {editions.map((edition:any) => (
                      <tr key={edition.id}>
                        <td style={tdStyle}>{edition.source_url ? <a href={edition.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{edition.title}</a> : <strong>{edition.title}</strong>}<div style={subtleStyle}>{edition.rule_citation || ''}</div></td>
                        <td style={tdStyle}>{edition.code_family}</td>
                        <td style={tdStyle}>{edition.model_code_edition || '—'}</td>
                        <td style={tdStyle}>{edition.documentCount}</td>
                        <td style={tdStyle}>{edition.sectionCount}</td>
                        <td style={tdStyle}>{edition.status}</td>
                      </tr>
                    ))}
                    {!editions.length && <tr><td style={tdStyle} colSpan={6}>No matching code editions.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'checks' && (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Source</th><th style={thStyle}>Status</th><th style={thStyle}>HTTP</th><th style={thStyle}>Checked</th><th style={thStyle}>Detail</th></tr></thead>
                  <tbody>
                    {checks.map((check:any) => (
                      <tr key={check.id}>
                        <td style={tdStyle}><a href={check.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{check.source_title || check.source_url}</a></td>
                        <td style={tdStyle}>{check.status}</td>
                        <td style={tdStyle}>{check.http_status || '—'}</td>
                        <td style={tdStyle}>{new Date(check.checked_at).toLocaleString()}</td>
                        <td style={tdStyle}>{check.error_text || (check.final_url && check.final_url !== check.source_url ? `Redirected to ${check.final_url}` : '—')}</td>
                      </tr>
                    ))}
                    {!checks.length && <tr><td style={tdStyle} colSpan={5}>No matching source checks.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </PlatformAdminShell>
  )
}

function Tab({ active, onClick, children }: { active:boolean; onClick:()=>void; children:React.ReactNode }) {
  return <button onClick={onClick} style={active ? primaryButton : secondaryButton}>{children}</button>
}
function Metric({ label, value }: { label:string; value:string | number }) {
  return <div style={metricStyle}><div style={{ fontSize:21, fontWeight:900 }}>{value}</div><div style={{ marginTop:4, ...subtleStyle, fontSize:10, fontWeight:800 }}>{label}</div></div>
}
const headerRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }
const toolbarStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const inputStyle: React.CSSProperties = { padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:12 }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:820, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const primaryButton: React.CSSProperties = { border:0, borderRadius:8, padding:'9px 11px', background:'#172033', color:'#fff', fontWeight:800, cursor:'pointer' }
const secondaryButton: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:8, padding:'9px 11px', background:'#fff', color:'#334155', fontWeight:800, cursor:'pointer' }
const linkStyle: React.CSSProperties = { color:'#075985', fontWeight:800 }
const successStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
