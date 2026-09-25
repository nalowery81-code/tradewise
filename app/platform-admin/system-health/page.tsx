'use client'

import { useEffect, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

type HealthData = any

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/platform-admin/system-health', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load system health.')
        setData(body)
      } catch (e: any) {
        setError(e?.message || 'Could not load system health.')
      }
    })()
  }, [])

  return (
    <PlatformAdminShell>
      <div style={eyebrowStyle}>Platform Operations</div>
      <h1 style={headingStyle}>System Health</h1>
      <p style={subtleStyle}>One place to answer: is CraftCompass working right now?</p>
      {error && <div style={errorStyle}>{error}</div>}
      {!data ? <div style={{ ...cardStyle, marginTop:18 }}>Loading system health…</div> : (
        <>
          <div style={gridStyle}>
            <Metric label="Overall" value={String(data.overall).toUpperCase()} />
            <Metric label="Companies" value={data.metrics.companies} />
            <Metric label="Active users" value={data.metrics.activeUsers} />
            <Metric label="Conversations 24h" value={data.metrics.conversations24h} />
            <Metric label="AI calls 24h" value={data.metrics.aiCalls24h} />
            <Metric label="AI tokens 24h" value={Number(data.metrics.aiTokens24h).toLocaleString()} />
            <Metric label="Source attention" value={data.metrics.sourceAttention} />
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
            <h2 style={{ margin:'0 0 4px', fontSize:19 }}>Recent learning runs</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Run</th><th style={thStyle}>Status</th><th style={thStyle}>Reviews</th><th style={thStyle}>Sources</th><th style={thStyle}>Issues</th></tr></thead>
                <tbody>
                  {(data.learningRuns || []).map((run: any) => (
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

