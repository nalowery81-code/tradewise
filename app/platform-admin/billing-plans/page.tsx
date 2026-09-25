'use client'

import { useEffect, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

export default function BillingPlansPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/platform-admin/billing-plans', {
          cache:'no-store',
          headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load billing and plans.')
        setData(body)
      } catch (e:any) { setError(e?.message || 'Could not load billing and plans.') }
    })()
  }, [])

  return (
    <PlatformAdminShell>
      <div style={eyebrowStyle}>Customers</div>
      <h1 style={headingStyle}>Billing & Plans</h1>
      <p style={subtleStyle}>Platform-wide plan allowances, subscription state, seat usage, and overage visibility.</p>
      {error && <div style={errorStyle}>{error}</div>}
      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Companies" value={data.summary.companies} />
            <Metric label="Active companies" value={data.summary.activeCompanies} />
            <Metric label="Active seats" value={data.summary.activeSeats} />
            <Metric label="Companies over plan" value={data.summary.overPlanCompanies} />
          </div>
          <div style={{ marginTop:12, padding:'10px 12px', border:'1px solid #bae6fd', borderRadius:9, background:'#f0f9ff', color:'#075985', fontSize:11 }}>
            {data.note}
          </div>
          <section style={{ ...cardStyle, marginTop:16 }}>
            <h2 style={{ margin:0, fontSize:19 }}>Company plans</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Company</th><th style={thStyle}>Plan</th><th style={thStyle}>Subscription</th><th style={thStyle}>Seats used / included</th><th style={thStyle}>Status</th></tr></thead>
                <tbody>
                  {data.companies.map((company:any) => (
                    <tr key={company.id}>
                      <td style={tdStyle}><a href={`/platform-admin/companies/${company.id}`} style={{ color:'#075985', fontWeight:850 }}>{company.name}</a><div style={subtleStyle}>{company.accountType}</div></td>
                      <td style={tdStyle}>{company.planCode}</td>
                      <td style={tdStyle}>{company.subscriptionStatus}</td>
                      <td style={tdStyle}>
                        Owners {company.used.owners}/{company.included.owners} · Managers {company.used.managers}/{company.included.managers} · Techs {company.used.technicians}/{company.included.technicians}
                      </td>
                      <td style={tdStyle}>{company.overPlan ? <strong style={{ color:'#9a3412' }}>Over plan</strong> : 'Within plan'}</td>
                    </tr>
                  ))}
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

