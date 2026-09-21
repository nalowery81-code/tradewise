'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type GuidanceItem = {
  id: string; created_at: string; updated_at: string; title: string; guidance_text: string;
  scope: 'all'|'technician'|'management'; topic: string|null; priority: number;
  status: 'draft'|'active'|'inactive'|'superseded'; source_review_id: string|null; activated_at: string|null
}

export default function GuidanceLibraryPage() {
  const [items,setItems]=useState<GuidanceItem[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('')
  const [error,setError]=useState('')
  const [status,setStatus]=useState('')
  const getToken=async()=> (await supabase.auth.getSession()).data.session?.access_token || ''

  const load=async()=>{
    const token=await getToken()
    if(!token) return void (window.location.href='/login')
    const response=await fetch('/api/platform-admin/guidance',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
    const data=await response.json().catch(()=>({}))
    if(!response.ok){setError(data.error||'Could not load guidance library.');setLoading(false);return}
    setItems(data.guidance||[]);setLoading(false)
  }
  useEffect(()=>{void load()},[])
  const visible=useMemo(()=>filter?items.filter(i=>i.status===filter):items,[items,filter])

  const update=async(item:GuidanceItem,patch:Record<string,unknown>)=>{
    setError('');setStatus('')
    const token=await getToken()
    const response=await fetch('/api/platform-admin/guidance',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:item.id,...patch})})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)return setError(data.error||'Could not update guidance.')
    setItems(current=>current.map(row=>row.id===item.id?data.guidance:row));setStatus('Guidance updated.')
  }

  return <main style={pageStyle}>
    <header style={headerStyle}>
      <div style={{fontSize:22,fontWeight:850}}>CraftCompass AI</div>
      <div style={{marginTop:4,color:'#94a3b8',fontSize:11,fontWeight:850,letterSpacing:'.08em'}}>PLATFORM ADMIN · GUIDANCE LIBRARY</div>
      <nav style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
        <a href="/platform-admin" style={navStyle}>Companies</a>
        <a href="/platform-admin/users" style={navStyle}>Users</a>
        <a href="/platform-admin/conversation-audit" style={navStyle}>Conversation Audit</a>
        <a href="/platform-admin/guidance" style={{...navStyle,background:'#273449'}}>Guidance Library</a>
      </nav>
    </header>
    <section style={{maxWidth:1040,margin:'0 auto',padding:'32px 16px 70px'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}>
        <div><h1 style={{margin:0,fontSize:34}}>Guidance Library</h1><p style={{color:'#64748b',lineHeight:1.55,maxWidth:720}}>Admin-approved lessons used by CraftCompass in future technician and management answers.</p></div>
        <select value={filter} onChange={e=>setFilter(e.target.value)} style={controlStyle}>
          <option value="">All guidance</option><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option><option value="superseded">Superseded</option>
        </select>
      </div>
      {error&&<div style={errorStyle}>{error}</div>}{status&&<div style={successStyle}>{status}</div>}
      <div style={{display:'grid',gap:12,marginTop:22}}>
        {loading?<div>Loading guidance…</div>:visible.length===0?<div style={{color:'#64748b'}}>No guidance items found.</div>:visible.map(item=>
          <section key={item.id} style={cardStyle}>
            <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
              <div><div style={{fontSize:18,fontWeight:850}}>{item.title}</div><div style={{marginTop:5,color:'#64748b',fontSize:12}}>{item.topic||'General'} · {item.scope} · priority {item.priority} · {item.status}</div></div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {item.status!=='active'?<button onClick={()=>void update(item,{status:'active'})} style={primaryButtonStyle}>Activate</button>:<button onClick={()=>void update(item,{status:'inactive'})} style={buttonStyle}>Deactivate</button>}
                {item.status!=='superseded'&&<button onClick={()=>void update(item,{status:'superseded'})} style={buttonStyle}>Supersede</button>}
              </div>
            </div>
            <div style={{marginTop:13,padding:13,borderRadius:10,background:'#f8fafc',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{item.guidance_text}</div>
            {item.source_review_id&&<div style={{marginTop:9,color:'#94a3b8',fontSize:11}}>Created from an Admin-reviewed conversation.</div>}
          </section>)}
      </div>
    </section>
  </main>
}
const pageStyle:React.CSSProperties={minHeight:'100vh',background:'#f7f7f8',color:'#172033',fontFamily:'Arial, Helvetica, sans-serif'}
const headerStyle:React.CSSProperties={background:'#111827',color:'#fff',padding:'18px 20px'}
const navStyle:React.CSSProperties={color:'#fff',textDecoration:'none',padding:'8px 10px',borderRadius:8,fontSize:13,fontWeight:800}
const controlStyle:React.CSSProperties={border:'1px solid #cbd5e1',borderRadius:9,padding:'9px 10px',background:'#fff'}
const cardStyle:React.CSSProperties={padding:18,border:'1px solid #e2e8f0',borderRadius:14,background:'#fff'}
const buttonStyle:React.CSSProperties={border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 10px',background:'#fff',color:'#334155',fontSize:12,fontWeight:800,cursor:'pointer'}
const primaryButtonStyle:React.CSSProperties={...buttonStyle,background:'#172033',color:'#fff',borderColor:'#172033'}
const errorStyle:React.CSSProperties={marginTop:14,padding:11,borderRadius:9,background:'#fef2f2',color:'#991b1b'}
const successStyle:React.CSSProperties={marginTop:14,padding:11,borderRadius:9,background:'#f0fdf4',color:'#166534'}
