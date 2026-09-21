'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type GuidanceItem = {
  id: string; created_at: string; updated_at: string; title: string; guidance_text: string;
  scope: 'all'|'technician'|'management'; topic: string|null; priority: number;
  status: 'draft'|'active'|'inactive'|'superseded'; source_review_id: string|null; source_weekly_run_id?: string|null; activated_at: string|null
}

type WeeklyRun = {
  id:string; created_at:string; completed_at:string|null; trigger_type:'scheduled'|'manual';
  period_start:string; period_end:string; status:'running'|'completed'|'failed';
  review_count:number; helpful_count:number; guidance_count:number; source_checked_count:number; source_issue_count:number; synopsis:string|null; model_name:string|null; error_text:string|null
}

type SourceIssue = {
  id:string; weekly_run_id:string; message_id:string|null; source_title:string|null; source_url:string;
  status:'dead'|'blocked'|'unreachable'|'invalid'; http_status:number|null; final_url:string|null; error_text:string|null; checked_at:string
}

export default function GuidanceLibraryPage() {
  const [items,setItems]=useState<GuidanceItem[]>([])
  const [loading,setLoading]=useState(true)
  const [weeklyRuns,setWeeklyRuns]=useState<WeeklyRun[]>([])
  const [sourceIssues,setSourceIssues]=useState<SourceIssue[]>([])
  const [runningWeekly,setRunningWeekly]=useState(false)
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
    setItems(data.guidance||[]);setWeeklyRuns(data.weeklyRuns||[]);setSourceIssues(data.sourceIssues||[]);setLoading(false)
  }
  useEffect(()=>{void load()},[])
  const visible=useMemo(()=>filter?items.filter(i=>i.status===filter):items,[items,filter])

  const runWeeklyNow=async()=>{
    setError('');setStatus('');setRunningWeekly(true)
    const token=await getToken()
    const response=await fetch('/api/platform-admin/guidance',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({action:'run_weekly_learning'})
    })
    const data=await response.json().catch(()=>({}))
    if(!response.ok){setError(data.error||'Weekly learning failed.');setRunningWeekly(false);return}
    if(data.skipped){setStatus(data.reason||'A weekly learning run is already in progress.')}
    else setStatus(`Sunday cycle complete: ${data.run?.review_count||0} corrected reviews + ${data.run?.helpful_count||0} Helpful signals → ${data.run?.guidance_count||0} draft guidance items; ${data.run?.source_checked_count||0} source links checked, ${data.run?.source_issue_count||0} exceptions.`)
    await load()
    setRunningWeekly(false)
  }

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

      <section style={{...cardStyle,marginTop:22,background:'#f8fafc'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:20,fontWeight:850}}>Sunday Weekly Learning</div>
            <div style={{marginTop:6,color:'#64748b',lineHeight:1.5,maxWidth:720}}>
              Runs automatically every Sunday morning. It synthesizes new Corrected/Resolved Admin reviews plus technician Helpful signals into draft guidance and batch-checks recent technician-facing Verified Source links. Helpful examples reinforce what worked, but are not treated as technical verification. Source exceptions are surfaced for Admin review. Nothing becomes active until Admin approval.
            </div>
          </div>
          <button onClick={()=>void runWeeklyNow()} disabled={runningWeekly} style={{...primaryButtonStyle,opacity:runningWeekly?0.6:1}}>
            {runningWeekly?'Running Sunday cycle…':'Run Sunday cycle now'}
          </button>
        </div>

        <div style={{display:'grid',gap:8,marginTop:14}}>
          {weeklyRuns.length===0?<div style={{color:'#64748b',fontSize:13}}>No weekly learning runs yet.</div>:weeklyRuns.slice(0,5).map(run=>
            <div key={run.id} style={{padding:11,borderRadius:9,background:'#fff',border:'1px solid #e2e8f0'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
                <strong>{new Date(run.created_at).toLocaleString()} · {run.trigger_type}</strong>
                <span style={{fontSize:12,color:run.status==='failed'?'#b91c1c':'#64748b'}}>{run.status}</span>
              </div>
              <div style={{marginTop:5,fontSize:12,color:'#64748b'}}>
                {run.review_count} reviewed corrections · {run.helpful_count||0} Helpful signals · {run.guidance_count} guidance drafts · {run.source_checked_count||0} sources checked · {run.source_issue_count||0} exceptions
              </div>
              {run.synopsis&&<div style={{marginTop:7,lineHeight:1.5,fontSize:13}}>{run.synopsis}</div>}
              {run.error_text&&<div style={{marginTop:7,color:'#b91c1c',fontSize:12}}>{run.error_text}</div>}
            </div>)}
        </div>
      </section>

      <section style={{...cardStyle,marginTop:22}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:20,fontWeight:850}}>Verified Source Audit</div>
            <div style={{marginTop:6,color:'#64748b',lineHeight:1.5,maxWidth:720}}>
              Sunday checks unique Verified Source links from recent technician answers. Working links stay quiet; dead, blocked, invalid, or unreachable links appear here for review.
            </div>
          </div>
          <div style={{fontSize:12,color:'#64748b',fontWeight:800}}>
            {sourceIssues.length} recent exception{sourceIssues.length===1?'':'s'}
          </div>
        </div>

        <div style={{display:'grid',gap:8,marginTop:14}}>
          {sourceIssues.length===0 ? (
            <div style={{padding:12,borderRadius:9,background:'#f0fdf4',color:'#166534',fontSize:13}}>
              No recent source-link exceptions.
            </div>
          ) : sourceIssues.slice(0,12).map(issue=>(
            <div key={issue.id} style={{padding:11,borderRadius:9,background:'#fff7ed',border:'1px solid #fed7aa'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
                <strong style={{color:'#7c2d12'}}>{issue.source_title||'Verified source'}</strong>
                <span style={{fontSize:11,fontWeight:850,textTransform:'uppercase',color:'#9a3412'}}>{issue.status}{issue.http_status?` · HTTP ${issue.http_status}`:''}</span>
              </div>
              <div style={{marginTop:6,fontSize:12,color:'#475569',overflowWrap:'anywhere'}}>{issue.source_url}</div>
              {issue.final_url&&issue.final_url!==issue.source_url&&<div style={{marginTop:4,fontSize:11,color:'#64748b',overflowWrap:'anywhere'}}>Final URL: {issue.final_url}</div>}
              {issue.error_text&&<div style={{marginTop:4,fontSize:11,color:'#9a3412'}}>{issue.error_text}</div>}
              <div style={{marginTop:5,fontSize:10,color:'#94a3b8'}}>Checked {new Date(issue.checked_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

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
            {item.source_review_id&&<div style={{marginTop:9,color:'#94a3b8',fontSize:11}}>Created with Learn Now from an Admin-reviewed conversation.</div>}
            {item.source_weekly_run_id&&<div style={{marginTop:9,color:'#94a3b8',fontSize:11}}>Created by the Sunday Weekly Learning cycle.</div>}
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
