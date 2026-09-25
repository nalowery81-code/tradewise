'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

type EditState = {
  planCode: string
  subscriptionStatus: string
  owners: number
  managers: number
  technicians: number
}

export default function BillingPlansPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/platform-admin/billing-plans', {
      cache:'no-store',
      headers:{ Authorization:`Bearer ${session?.access_token || ''}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load billing and plans.')
    setData(body)
  }

  useEffect(() => { void load().catch((e:any) => setError(e?.message || 'Could not load billing and plans.')) }, [])

  const companies = useMemo(() => {
    const rows = data?.companies || []
    const q = search.trim().toLowerCase()
    return q ? rows.filter((company:any) =>
      company.name.toLowerCase().includes(q) ||
      company.planCode.toLowerCase().includes(q) ||
      company.subscriptionStatus.toLowerCase().includes(q)
    ) : rows
  }, [data, search])

  const beginEdit = (company:any) => {
    setStatus('')
    setEditingId(company.id)
    setEdit({
      planCode: company.planCode,
      subscriptionStatus: company.subscriptionStatus,
      owners: company.included.owners,
      managers: company.included.managers,
      technicians: company.included.technicians,
    })
  }

  const save = async (company:any) => {
    if (!edit) return
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/platform-admin/companies/${company.id}`, {
        method:'PATCH',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          planCode: edit.planCode,
          subscriptionStatus: edit.subscriptionStatus,
          seatLimits: { owners: edit.owners, managers: edit.managers, technicians: edit.technicians },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not update billing controls.')
      setEditingId('')
      setEdit(null)
      setStatus(`${company.name} billing controls updated and audited.`)
      await load()
    } catch (e:any) {
      setError(e?.message || 'Could not update billing controls.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PlatformAdminShell>
      <div style={eyebrowStyle}>Customers</div>
      <h1 style={headingStyle}>Billing & Plans</h1>
      <p style={subtleStyle}>Manage plan allowances, subscription state, and seat usage across every company.</p>
      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={successStyle}>{status}</div>}
      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Companies" value={data.summary.companies} />
            <Metric label="Active companies" value={data.summary.activeCompanies} />
            <Metric label="Active seats" value={data.summary.activeSeats} />
            <Metric label="Companies over plan" value={data.summary.overPlanCompanies} />
          </div>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={toolbarStyle}>
              <div>
                <h2 style={{ margin:0, fontSize:19 }}>Company plans</h2>
                <div style={subtleStyle}>Changes made here are written to the Security & Audit Log.</div>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or plan…" style={inputStyle} />
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Company</th><th style={thStyle}>Plan</th><th style={thStyle}>Subscription</th><th style={thStyle}>Seats</th><th style={thStyle}>Status</th><th style={thStyle}>Action</th></tr></thead>
                <tbody>
                  {companies.map((company:any) => {
                    const editing = editingId === company.id && edit
                    return (
                      <tr key={company.id}>
                        <td style={tdStyle}>
                          <a href={`/platform-admin/companies/${company.id}`} style={linkStyle}>{company.name}</a>
                          <div style={subtleStyle}>{company.accountType}</div>
                        </td>
                        <td style={tdStyle}>
                          {editing ? <input value={edit.planCode} onChange={(e) => setEdit({ ...edit, planCode:e.target.value })} style={smallInputStyle} /> : company.planCode}
                        </td>
                        <td style={tdStyle}>
                          {editing ? (
                            <select value={edit.subscriptionStatus} onChange={(e) => setEdit({ ...edit, subscriptionStatus:e.target.value })} style={smallInputStyle}>
                              <option value="manual">manual</option>
                              <option value="trialing">trialing</option>
                              <option value="active">active</option>
                              <option value="past_due">past_due</option>
                              <option value="paused">paused</option>
                              <option value="canceled">canceled</option>
                            </select>
                          ) : company.subscriptionStatus}
                        </td>
                        <td style={tdStyle}>
                          {editing ? (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              <Seat label="O" value={edit.owners} onChange={(v) => setEdit({ ...edit, owners:v })} />
                              <Seat label="M" value={edit.managers} onChange={(v) => setEdit({ ...edit, managers:v })} />
                              <Seat label="T" value={edit.technicians} onChange={(v) => setEdit({ ...edit, technicians:v })} />
                            </div>
                          ) : (
                            <>O {company.used.owners}/{company.included.owners} · M {company.used.managers}/{company.included.managers} · T {company.used.technicians}/{company.included.technicians}</>
                          )}
                        </td>
                        <td style={tdStyle}>{company.overPlan ? <strong style={{ color:'#9a3412' }}>Over plan</strong> : 'Within plan'}</td>
                        <td style={tdStyle}>
                          {editing ? (
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={() => void save(company)} disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save'}</button>
                              <button onClick={() => { setEditingId(''); setEdit(null) }} disabled={saving} style={secondaryButton}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => beginEdit(company)} style={secondaryButton}>Edit plan</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {!companies.length && <tr><td style={tdStyle} colSpan={6}>No matching companies.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PlatformAdminShell>
  )
}

function Seat({ label, value, onChange }: { label:string; value:number; onChange:(value:number)=>void }) {
  return <label style={{ display:'flex', alignItems:'center', gap:4 }}><strong>{label}</strong><input type="number" min={0} step={1} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallInputStyle, width:58 }} /></label>
}
function Metric({ label, value }: { label:string; value:string | number }) {
  return <div style={metricStyle}><div style={{ fontSize:21, fontWeight:900 }}>{value}</div><div style={{ marginTop:4, ...subtleStyle, fontSize:10, fontWeight:800 }}>{label}</div></div>
}
const cardStyle: React.CSSProperties = { padding:18, border:'1px solid #dbe3ec', borderRadius:14, background:'#fff' }
const headingStyle: React.CSSProperties = { fontSize:34, margin:'7px 0 7px', fontWeight:900 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const toolbarStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }
const inputStyle: React.CSSProperties = { minWidth:240, padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:8 }
const smallInputStyle: React.CSSProperties = { padding:'7px 8px', border:'1px solid #cbd5e1', borderRadius:7, fontSize:12 }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:900, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const linkStyle: React.CSSProperties = { color:'#075985', fontWeight:850 }
const primaryButton: React.CSSProperties = { border:0, borderRadius:8, padding:'8px 10px', background:'#172033', color:'#fff', fontWeight:800, cursor:'pointer' }
const secondaryButton: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:8, padding:'8px 10px', background:'#fff', color:'#334155', fontWeight:800, cursor:'pointer' }
const successStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
