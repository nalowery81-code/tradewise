'use client'

import { useEffect, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function KnowledgeSourcesPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/platform-admin/knowledge-sources', {
          cache:'no-store',
          headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load knowledge sources.')
        setData(body)
      } catch (e:any) { setError(e?.message || 'Could not load knowledge sources.') }
    })()
  }, [])

  return (
    <PlatformAdminShell>
      <div style={eyebrowStyle}>AI & Quality</div>
      <h1 style={headingStyle}>Knowledge & Sources</h1>
      <p style={subtleStyle}>Verified source coverage, code editions, indexed sections, verification state, and source-check health.</p>
      {error && <div style={errorStyle}>{error}</div>}
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
            <h2 style={{ margin:0, fontSize:19 }}>Verified source documents</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Document</th><th style={thStyle}>Authority</th><th style={thStyle}>Type</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th><th style={thStyle}>Last verified</th></tr></thead>
                <tbody>
                  {data.documents.map((doc:any) => (
                    <tr key={doc.id}>
                      <td style={tdStyle}>{doc.source_url ? <a href={doc.source_url} target="_blank" rel="noreferrer" style={{ color:'#075985', fontWeight:850 }}>{doc.title}</a> : <strong>{doc.title}</strong>}</td>
                      <td style={tdStyle}>{doc.authority || '—'}</td>
                      <td style={tdStyle}>{doc.source_type || '—'}</td>
                      <td style={tdStyle}>{doc.sectionCount}</td>
                      <td style={tdStyle}>{doc.status}</td>
                      <td style={tdStyle}>{doc.last_verified_at ? new Date(doc.last_verified_at).toLocaleString() : 'Not recorded'}</td>
                    </tr>
                  ))}
                  {!data.documents.length && <tr><td style={tdStyle} colSpan={6}>No verified documents loaded.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <h2 style={{ margin:0, fontSize:19 }}>Code editions</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Edition</th><th style={thStyle}>Code family</th><th style={thStyle}>Model edition</th><th style={thStyle}>Documents</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th></tr></thead>
                <tbody>
                  {data.editions.map((edition:any) => (
                    <tr key={edition.id}>
                      <td style={tdStyle}><strong>{edition.title}</strong><div style={subtleStyle}>{edition.rule_citation || ''}</div></td>
                      <td style={tdStyle}>{edition.code_family}</td>
                      <td style={tdStyle}>{edition.model_code_edition || '—'}</td>
                      <td style={tdStyle}>{edition.documentCount}</td>
                      <td style={tdStyle}>{edition.sectionCount}</td>
                      <td style={tdStyle}>{edition.status}</td>
                    </tr>
                  ))}
                  {!data.editions.length && <tr><td style={tdStyle} colSpan={6}>No verified code editions loaded.</td></tr>}
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

