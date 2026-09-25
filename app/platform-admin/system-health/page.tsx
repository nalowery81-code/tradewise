'use client'

import { useEffect, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function SystemHealthPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/platform-admin/system-health', {
        cache:'no-store',
        headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not load system health.')
      setData(body)
    } catch (e:any) {
      setError(e?.message || 'Could not load system health.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const runLearning = async () => {
    if (!window.confirm('Run the learning and source-check cycle now? This can use AI and external-source calls.')) return
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
      if (!response.ok) throw new Error(body.error || 'Learning cycle failed.')
      setStatus('Learning and source-check cycle completed.')
      await load()
    } catch (e:any) {
      setError(e?.message || 'Learning cycle failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <PlatformAdminShell>
      <div style={headerRowStyle}>
        <div>
          <div style={eyebrowStyle}>Platform Operations</div>
          <h1 style={headingStyle}>System Health</h1>
          <p style={subtleStyle}>See what needs attention, refresh live status, and jump directly to the control surface behind each signal.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => void load()} disabled={loading} style={secondaryButton}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button onClick={() => void runLearning()} disabled={running} style={primaryButton}>{running ? 'Running…' : 'Run learning & source check'}</button>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={successStyle}>{status}</div>}

      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Overall" value={String(data.overall).toUpperCase()} href="/platform-admin" />
            <Metric label="Companies" value={data.metrics.companies} href="/platform-admin/companies" />
            <Metric label="Active users" value={data.metrics.activeUsers} href="/platform-admin/users" />
            <Metric label="Conversations 24h" value={data.metrics.conversations24h} href="/platform-admin/conversation-audit" />
            <Metric label="AI calls 24h" value={data.metrics.aiCalls24h} href="/platform-admin/reports" />
            <Metric label="AI tokens 24h" value={Number(data.metrics.aiTokens24h).toLocaleString()} href="/platform-admin/reports" />
            <Metric label="Source attention" value={data.metrics.sourceAttention} href="/platform-admin/knowledge-sources" />
          </div>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <h2 style={{ margin:'0 0 4px', fontSize:19 }}>Core checks</h2>
            <div style={gridStyle}>
              {Object.entries(data.checks || {}).map(([key, value]) => (
                <Metric key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value).toUpperCase()} />
              ))}
            </div>
            <div style={{ ...subtleStyle, marginTop:14 }}>
              Deployment: {data.deployment.environment} · {data.deployment.commitRef || 'unknown branch'} · {data.deployment.commitSha ? String(data.deployment.commitSha).slice(0,7) : 'unknown commit'}
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin:0, fontSize:19 }}>Recent learning runs</h2>
              <a href="/platform-admin/guidance" style={linkButton}>Open Guidance Library →</a>
            </div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Run</th><th style={thStyle}>Status</th><th style={thStyle}>Reviews</th><th style={thStyle}>Sources</th><th style={thStyle}>Issues</th></tr></thead>
                <tbody>
                  {(data.learningRuns || []).map((run:any) => (
                    <tr key={run.id}>
                      <td style={tdStyle}>{new Date(run.created_at).toLocaleString()}</td>
                      <td style={tdStyle}>{run.status}</td>
                      <td style={tdStyle}>{run.review_count || 0}</td>
                      <td style={tdStyle}>{run.source_checked_count || 0}</td>
                      <td style={tdStyle}>{run.source_issue_count || 0}{run.error_text ? ` · ${run.error_text}` : ''}</td>
                    </tr>
                  ))}
                  {!data.learningRuns?.length && <tr><td style={tdStyle} colSpan={5}>No learning runs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin:0, fontSize:19 }}>Source issues</h2>
              <a href="/platform-admin/knowledge-sources" style={linkButton}>Investigate sources →</a>
            </div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Source</th><th style={thStyle}>Status</th><th style={thStyle}>HTTP</th><th style={thStyle}>Checked</th></tr></thead>
                <tbody>
                  {(data.sourceIssues || []).map((issue:any) => (
                    <tr key={issue.id}>
                      <td style={tdStyle}>{issue.source_url ? <a href={issue.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{issue.source_title || issue.source_url}</a> : issue.source_title || 'Unknown source'}</td>
                      <td style={tdStyle}>{issue.status}</td>
                      <td style={tdStyle}>{issue.http_status || '—'}</td>
                      <td style={tdStyle}>{new Date(issue.checked_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!data.sourceIssues?.length && <tr><td style={tdStyle} colSpan={4}>No recent source issues.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PlatformAdminShell>
  )
}

function Metric({ label, value, href }: { label:string; value:string | number; href?:string }) {
  const content=<><div style={{ fontSize:21, fontWeight:900 }}>{value}</div><div style={{ marginTop:4, ...subtleStyle, fontSize:10, fontWeight:800 }}>{label}</div></>
  return href ? <a href={href} style={{ ...metricStyle, textDecoration:'none', color:'#172033' }}>{content}</a> : <div style={metricStyle}>{content}</div>
}
const headerRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }
const sectionHeaderStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { display:'block', padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:760, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const primaryButton: React.CSSProperties = { border:0, borderRadius:8, padding:'9px 11px', background:'#172033', color:'#fff', fontWeight:800, cursor:'pointer' }
const secondaryButton: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:8, padding:'9px 11px', background:'#fff', color:'#334155', fontWeight:800, cursor:'pointer' }
const linkButton: React.CSSProperties = { color:'#075985', fontWeight:800, textDecoration:'none', fontSize:12 }
const linkStyle: React.CSSProperties = { color:'#075985', fontWeight:800 }
const successStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
