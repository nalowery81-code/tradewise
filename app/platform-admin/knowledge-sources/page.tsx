'use client'

import { useEffect, useMemo, useState } from 'react'
import PlatformAdminShell from '../platform-admin-shell'
import { supabase } from '../../lib/supabase'

type TabName = 'documents'|'editions'|'checks'|'manufacturers'

export default function KnowledgeSourcesPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tab, setTab] = useState<TabName>('documents')
  const [running, setRunning] = useState(false)
  const [selectedManufacturerId, setSelectedManufacturerId] = useState('')
  const [busy, setBusy] = useState('')
  const [manufacturerForm, setManufacturerForm] = useState({ name:'', websiteUrl:'' })
  const [productForm, setProductForm] = useState({ model:'', productFamily:'', equipmentType:'' })
  const [sourceForm, setSourceForm] = useState({ title:'', sourceUrl:'', documentType:'', model:'', equipmentType:'' })
  const [factForm, setFactForm] = useState({ productId:'', sourceDocumentId:'', factKey:'', valueText:'', unit:'', sourceLocator:'' })

  const authHeaders = async (json = false) => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      ...(json ? { 'Content-Type':'application/json' } : {}),
      Authorization:`Bearer ${session?.access_token || ''}`,
    }
  }

  const load = async () => {
    setError('')
    const response = await fetch('/api/platform-admin/knowledge-sources', {
      cache:'no-store',
      headers: await authHeaders(),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load knowledge sources.')
    setData(body)
    if (!selectedManufacturerId && body.manufacturers?.length) setSelectedManufacturerId(body.manufacturers[0].id)
  }

  useEffect(() => { void load().catch((e:any) => setError(e?.message || 'Could not load knowledge sources.')) }, [])

  const postAction = async (action:string, payload:Record<string, unknown>) => {
    setBusy(action)
    setStatus('')
    setError('')
    try {
      const response = await fetch('/api/platform-admin/knowledge-sources', {
        method:'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ action, ...payload }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Knowledge update failed.')
      setStatus('Manufacturer knowledge updated and audited.')
      await load()
      return body
    } catch (e:any) {
      setError(e?.message || 'Knowledge update failed.')
      return null
    } finally {
      setBusy('')
    }
  }

  const runCheck = async () => {
    if (!window.confirm('Run the learning and source-check cycle now?')) return
    setRunning(true)
    setStatus('')
    setError('')
    try {
      const response = await fetch('/api/platform-admin/guidance', {
        method:'POST',
        headers: await authHeaders(true),
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

  const manufacturers=useMemo(() => (data?.manufacturers || []).filter((manufacturer:any) =>
    !q || [manufacturer.name, manufacturer.website_url, manufacturer.status].some((value) => String(value || '').toLowerCase().includes(q))
  ), [data, q])

  const selectedManufacturer = (data?.manufacturers || []).find((item:any) => item.id === selectedManufacturerId)
  const selectedProducts = (data?.manufacturerProducts || []).filter((item:any) => item.manufacturer_id === selectedManufacturerId)
  const selectedDocs = (data?.manufacturerDocuments || []).filter((item:any) => item.manufacturer_id === selectedManufacturerId)
  const selectedProductIds = new Set(selectedProducts.map((item:any) => item.id))
  const selectedFacts = (data?.manufacturerFacts || []).filter((item:any) => selectedProductIds.has(item.product_id))
  const readyDocs = selectedDocs.filter((item:any) => item.status === 'ready')

  return (
    <PlatformAdminShell>
      <div style={headerRowStyle}>
        <div>
          <div style={eyebrowStyle}>AI & Quality</div>
          <h1 style={headingStyle}>Knowledge & Sources</h1>
          <p style={subtleStyle}>Control verified code and manufacturer knowledge, inspect provenance, and keep source coverage current.</p>
        </div>
        <button onClick={() => void runCheck()} disabled={running} style={primaryButton}>{running ? 'Running…' : 'Run source check'}</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={successStyle}>{status}</div>}

      {data && (
        <>
          <div style={gridStyle}>
            <Metric label="Code/source docs" value={data.summary.documents} />
            <Metric label="Verified sections" value={data.summary.sections} />
            <Metric label="Manufacturers" value={data.summary.manufacturers} />
            <Metric label="Products" value={data.summary.manufacturerProducts} />
            <Metric label="Verified product facts" value={data.summary.verifiedManufacturerFacts} />
            <Metric label="Manufacturer sources" value={data.summary.manufacturerSources} />
          </div>

          <section style={{ ...cardStyle, marginTop:16 }}>
            <div style={toolbarStyle}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Tab active={tab==='documents'} onClick={() => setTab('documents')}>Documents</Tab>
                <Tab active={tab==='editions'} onClick={() => setTab('editions')}>Code editions</Tab>
                <Tab active={tab==='checks'} onClick={() => setTab('checks')}>Source checks</Tab>
                <Tab active={tab==='manufacturers'} onClick={() => setTab('manufacturers')}>Manufacturer Knowledge</Tab>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge…" style={inputStyle} />
                {tab !== 'checks' && tab !== 'manufacturers' && (
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

            {tab === 'documents' && <SimpleDocuments documents={documents} />}
            {tab === 'editions' && <SimpleEditions editions={editions} />}
            {tab === 'checks' && <SimpleChecks checks={checks} />}

            {tab === 'manufacturers' && (
              <div style={{ marginTop:14 }}>
                <div style={{ ...cardStyle, background:'#f8fafc' }}>
                  <div style={sectionTitle}>Add manufacturer</div>
                  <div style={formRow}>
                    <input style={inputStyle} placeholder="Manufacturer name" value={manufacturerForm.name} onChange={(e) => setManufacturerForm({ ...manufacturerForm, name:e.target.value })} />
                    <input style={{...inputStyle, minWidth:260}} placeholder="Official website" value={manufacturerForm.websiteUrl} onChange={(e) => setManufacturerForm({ ...manufacturerForm, websiteUrl:e.target.value })} />
                    <button style={primaryButton} disabled={busy === 'create_manufacturer'} onClick={async () => {
                      const result = await postAction('create_manufacturer', manufacturerForm)
                      if (result?.manufacturer) {
                        setManufacturerForm({ name:'', websiteUrl:'' })
                        setSelectedManufacturerId(result.manufacturer.id)
                      }
                    }}>Add manufacturer</button>
                  </div>
                </div>

                <div style={manufacturerLayout}>
                  <div style={tableWrapStyle}>
                    <table style={{...tableStyle, minWidth:620}}>
                      <thead><tr><th style={thStyle}>Manufacturer</th><th style={thStyle}>Products</th><th style={thStyle}>Sources</th><th style={thStyle}>Facts</th></tr></thead>
                      <tbody>
                        {manufacturers.map((manufacturer:any) => (
                          <tr key={manufacturer.id} onClick={() => setSelectedManufacturerId(manufacturer.id)} style={{ cursor:'pointer', background:manufacturer.id===selectedManufacturerId ? '#eef6ff' : '#fff' }}>
                            <td style={tdStyle}><strong>{manufacturer.name}</strong><div style={subtleStyle}>{manufacturer.website_url || 'No website recorded'}</div></td>
                            <td style={tdStyle}>{manufacturer.productCount}</td>
                            <td style={tdStyle}>{manufacturer.readySourceCount}/{manufacturer.sourceCount} ready</td>
                            <td style={tdStyle}>{manufacturer.verifiedFactCount}</td>
                          </tr>
                        ))}
                        {!manufacturers.length && <tr><td style={tdStyle} colSpan={4}>No matching manufacturers.</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    {selectedManufacturer ? (
                      <>
                        <section style={cardStyle}>
                          <div style={sectionTitle}>{selectedManufacturer.name}</div>
                          <div style={subtleStyle}>Products, verified facts, and authoritative sources all remain traceable to this manufacturer record.</div>
                          <div style={formRow}>
                            <input style={inputStyle} placeholder="Model" value={productForm.model} onChange={(e) => setProductForm({ ...productForm, model:e.target.value })} />
                            <input style={inputStyle} placeholder="Product family" value={productForm.productFamily} onChange={(e) => setProductForm({ ...productForm, productFamily:e.target.value })} />
                            <input style={inputStyle} placeholder="Equipment type" value={productForm.equipmentType} onChange={(e) => setProductForm({ ...productForm, equipmentType:e.target.value })} />
                            <button style={primaryButton} onClick={async () => {
                              const result = await postAction('create_product', { manufacturerId:selectedManufacturerId, ...productForm })
                              if (result) setProductForm({ model:'', productFamily:'', equipmentType:'' })
                            }}>Add product</button>
                          </div>
                        </section>

                        <section style={{...cardStyle, marginTop:12}}>
                          <div style={sectionTitle}>Register authoritative source</div>
                          <div style={subtleStyle}>Registration does not make a source verified. New sources stay queued until reviewed/ingested.</div>
                          <div style={formGrid}>
                            <input style={inputStyle} placeholder="Document title" value={sourceForm.title} onChange={(e) => setSourceForm({ ...sourceForm, title:e.target.value })} />
                            <input style={inputStyle} placeholder="Official source URL" value={sourceForm.sourceUrl} onChange={(e) => setSourceForm({ ...sourceForm, sourceUrl:e.target.value })} />
                            <input style={inputStyle} placeholder="Document type (manual, submittal…)" value={sourceForm.documentType} onChange={(e) => setSourceForm({ ...sourceForm, documentType:e.target.value })} />
                            <input style={inputStyle} placeholder="Model (optional)" value={sourceForm.model} onChange={(e) => setSourceForm({ ...sourceForm, model:e.target.value })} />
                            <input style={inputStyle} placeholder="Equipment type (optional)" value={sourceForm.equipmentType} onChange={(e) => setSourceForm({ ...sourceForm, equipmentType:e.target.value })} />
                            <button style={primaryButton} onClick={async () => {
                              const result = await postAction('register_source', { manufacturerId:selectedManufacturerId, ...sourceForm })
                              if (result) setSourceForm({ title:'', sourceUrl:'', documentType:'', model:'', equipmentType:'' })
                            }}>Register source</button>
                          </div>
                        </section>

                        <section style={{...cardStyle, marginTop:12}}>
                          <div style={sectionTitle}>Add verified fact</div>
                          <div style={subtleStyle}>A fact cannot be created unless its supporting manufacturer source is already verified and ready.</div>
                          <div style={formGrid}>
                            <select style={inputStyle} value={factForm.productId} onChange={(e) => setFactForm({ ...factForm, productId:e.target.value })}>
                              <option value="">Select product</option>
                              {selectedProducts.map((product:any) => <option key={product.id} value={product.id}>{product.model}{product.product_family ? ` — ${product.product_family}` : ''}</option>)}
                            </select>
                            <select style={inputStyle} value={factForm.sourceDocumentId} onChange={(e) => setFactForm({ ...factForm, sourceDocumentId:e.target.value })}>
                              <option value="">Select verified source</option>
                              {readyDocs.map((doc:any) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                            </select>
                            <input style={inputStyle} placeholder="Fact key (voltage, basin_diameter…)" value={factForm.factKey} onChange={(e) => setFactForm({ ...factForm, factKey:e.target.value })} />
                            <input style={inputStyle} placeholder="Value" value={factForm.valueText} onChange={(e) => setFactForm({ ...factForm, valueText:e.target.value })} />
                            <input style={inputStyle} placeholder="Unit (optional)" value={factForm.unit} onChange={(e) => setFactForm({ ...factForm, unit:e.target.value })} />
                            <input style={inputStyle} placeholder="Source locator (page/table/section)" value={factForm.sourceLocator} onChange={(e) => setFactForm({ ...factForm, sourceLocator:e.target.value })} />
                            <button style={primaryButton} onClick={async () => {
                              const result = await postAction('create_fact', factForm)
                              if (result) setFactForm({ productId:'', sourceDocumentId:'', factKey:'', valueText:'', unit:'', sourceLocator:'' })
                            }}>Add verified fact</button>
                          </div>
                        </section>

                        <section style={{...cardStyle, marginTop:12}}>
                          <div style={sectionTitle}>Coverage</div>
                          <div style={coverageGrid}>
                            <div><strong>{selectedProducts.length}</strong><span> products</span></div>
                            <div><strong>{selectedDocs.length}</strong><span> sources</span></div>
                            <div><strong>{selectedFacts.filter((fact:any) => fact.verification_status === 'verified').length}</strong><span> verified facts</span></div>
                          </div>
                          <div style={{...tableWrapStyle, marginTop:12}}>
                            <table style={{...tableStyle, minWidth:760}}>
                              <thead><tr><th style={thStyle}>Source</th><th style={thStyle}>Model</th><th style={thStyle}>Type</th><th style={thStyle}>Status</th><th style={thStyle}>Last verified</th></tr></thead>
                              <tbody>
                                {selectedDocs.map((doc:any) => (
                                  <tr key={doc.id}>
                                    <td style={tdStyle}>{doc.source_url ? <a href={doc.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{doc.title}</a> : doc.title}</td>
                                    <td style={tdStyle}>{doc.model || '—'}</td>
                                    <td style={tdStyle}>{doc.document_type || '—'}</td>
                                    <td style={tdStyle}>{doc.status}</td>
                                    <td style={tdStyle}>{doc.last_verified_at ? new Date(doc.last_verified_at).toLocaleString() : 'Not verified'}</td>
                                  </tr>
                                ))}
                                {!selectedDocs.length && <tr><td style={tdStyle} colSpan={5}>No manufacturer sources registered yet.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      </>
                    ) : <div style={cardStyle}>Select a manufacturer.</div>}
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </PlatformAdminShell>
  )
}

function SimpleDocuments({ documents }:{ documents:any[] }) {
  return <div style={tableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>Document</th><th style={thStyle}>Authority</th><th style={thStyle}>Type</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th><th style={thStyle}>Last verified</th></tr></thead><tbody>{documents.map((doc:any)=><tr key={doc.id}><td style={tdStyle}>{doc.source_url?<a href={doc.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{doc.title}</a>:<strong>{doc.title}</strong>}</td><td style={tdStyle}>{doc.authority||'—'}</td><td style={tdStyle}>{doc.source_type||'—'}</td><td style={tdStyle}>{doc.sectionCount}</td><td style={tdStyle}>{doc.status}</td><td style={tdStyle}>{doc.last_verified_at?new Date(doc.last_verified_at).toLocaleString():'Not recorded'}</td></tr>)}</tbody></table></div>
}
function SimpleEditions({ editions }:{ editions:any[] }) {
  return <div style={tableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>Edition</th><th style={thStyle}>Code family</th><th style={thStyle}>Model edition</th><th style={thStyle}>Documents</th><th style={thStyle}>Sections</th><th style={thStyle}>Status</th></tr></thead><tbody>{editions.map((edition:any)=><tr key={edition.id}><td style={tdStyle}>{edition.title}<div style={subtleStyle}>{edition.rule_citation||''}</div></td><td style={tdStyle}>{edition.code_family}</td><td style={tdStyle}>{edition.model_code_edition||'—'}</td><td style={tdStyle}>{edition.documentCount}</td><td style={tdStyle}>{edition.sectionCount}</td><td style={tdStyle}>{edition.status}</td></tr>)}</tbody></table></div>
}
function SimpleChecks({ checks }:{ checks:any[] }) {
  return <div style={tableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>Source</th><th style={thStyle}>Status</th><th style={thStyle}>HTTP</th><th style={thStyle}>Checked</th><th style={thStyle}>Detail</th></tr></thead><tbody>{checks.map((check:any)=><tr key={check.id}><td style={tdStyle}><a href={check.source_url} target="_blank" rel="noreferrer" style={linkStyle}>{check.source_title||check.source_url}</a></td><td style={tdStyle}>{check.status}</td><td style={tdStyle}>{check.http_status||'—'}</td><td style={tdStyle}>{new Date(check.checked_at).toLocaleString()}</td><td style={tdStyle}>{check.error_text||'—'}</td></tr>)}</tbody></table></div>
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
const sectionTitle: React.CSSProperties = { fontSize:15, fontWeight:900, marginBottom:8 }
const eyebrowStyle: React.CSSProperties = { color:'#46688e', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'.09em' }
const subtleStyle: React.CSSProperties = { color:'#64748b', fontSize:12, lineHeight:1.45 }
const gridStyle: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginTop:18 }
const metricStyle: React.CSSProperties = { padding:14, border:'1px solid #e2e8f0', borderRadius:11, background:'#f8fafc' }
const inputStyle: React.CSSProperties = { padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:12, minWidth:160, background:'#fff' }
const formRow: React.CSSProperties = { display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:10 }
const formGrid: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:8, marginTop:10 }
const manufacturerLayout: React.CSSProperties = { display:'grid', gridTemplateColumns:'minmax(420px,.85fr) minmax(520px,1.3fr)', gap:14, marginTop:14, alignItems:'start' }
const coverageGrid: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(3,minmax(100px,1fr))', gap:8, marginTop:10 }
const tableWrapStyle: React.CSSProperties = { overflowX:'auto', border:'1px solid #e2e8f0', borderRadius:11, marginTop:14 }
const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', minWidth:820, fontSize:12 }
const thStyle: React.CSSProperties = { padding:'10px 12px', textAlign:'left', background:'#f8fafc', color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding:'11px 12px', verticalAlign:'top', borderBottom:'1px solid #eef2f7', lineHeight:1.45 }
const primaryButton: React.CSSProperties = { border:0, borderRadius:8, padding:'9px 11px', background:'#172033', color:'#fff', fontWeight:800, cursor:'pointer' }
const secondaryButton: React.CSSProperties = { border:'1px solid #cbd5e1', borderRadius:8, padding:'9px 11px', background:'#fff', color:'#334155', fontWeight:800, cursor:'pointer' }
const linkStyle: React.CSSProperties = { color:'#075985', fontWeight:800 }
const successStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #bbf7d0', borderRadius:9, background:'#f0fdf4', color:'#166534', fontSize:12 }
const errorStyle: React.CSSProperties = { marginTop:14, padding:'10px 12px', border:'1px solid #fecaca', borderRadius:9, background:'#fef2f2', color:'#991b1b', fontSize:12 }
