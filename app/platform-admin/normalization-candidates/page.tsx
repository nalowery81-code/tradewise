'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PlatformAdminNav from '../platform-admin-nav'

type Candidate = {
  normalizedKey: string
  sampleQuestion: string
  codeFamily: string
  count: number
  averageMs: number
  averagePrimaryMs: number
  helpfulCount: number
  flaggedCount: number
  lastSeen: string
  codeReferences: string[]
  sourceTitles: string[]
  score: number
  priority: 'high' | 'medium' | 'low'
  status: 'candidate' | 'reviewed' | 'approved' | 'normalized' | 'rejected'
  notes: string
}

export default function NormalizationCandidatesPage() {
  const [rows, setRows] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active')

  const load = async () => {
    setLoading(true)
    setError('')
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return void window.location.replace('/login')

    const response = await fetch('/api/platform-admin/normalization-candidates', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error || 'Could not load normalization candidates.')
      setLoading(false)
      return
    }
    setRows(data.candidates || [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'active') return rows.filter((row) => !['normalized','rejected'].includes(row.status))
    return rows.filter((row) => row.status === filter)
  }, [rows, filter])

  const updateStatus = async (row: Candidate, status: Candidate['status']) => {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return void window.location.replace('/login')
    const notes = window.prompt('Optional review note:', row.notes || '') ?? row.notes

    const response = await fetch('/api/platform-admin/normalization-candidates', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ normalizedKey: row.normalizedKey, status, notes }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return window.alert(data.error || 'Could not update candidate.')

    setRows((current) =>
      current.map((item) =>
        item.normalizedKey === row.normalizedKey
          ? { ...item, status, notes: data.review?.notes || notes || '' }
          : item
      )
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      <aside style={{ position: 'fixed', inset: '0 auto 0 0', width: 250, background: '#172033', color: '#fff', padding: '28px 20px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>CraftCompass AI</div>
        <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Platform Admin</div>
        <PlatformAdminNav variant="sidebar" />
      </aside>

      <section style={{ marginLeft: 250, padding: '34px 34px 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Verified knowledge growth</div>
              <h1 style={{ margin: '6px 0', fontSize: 34 }}>Normalization Candidates</h1>
              <p style={{ margin: 0, color: '#64748b', maxWidth: 760 }}>
                Straightforward technician questions that missed the normalized library and had to use the slower verified-source path.
              </p>
            </div>
            <button onClick={() => void load()} style={{ border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', padding: '9px 13px', fontWeight: 800, cursor: 'pointer' }}>Refresh</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22 }}>
            {['active','candidate','reviewed','approved','normalized','rejected','all'].map((value) => (
              <button key={value} onClick={() => setFilter(value)} style={{ border: '1px solid #cbd5e1', borderRadius: 999, padding: '7px 11px', background: filter === value ? '#123047' : '#fff', color: filter === value ? '#fff' : '#334155', fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{value}</button>
            ))}
          </div>

          {error && <div style={{ marginTop: 18, padding: 12, borderRadius: 9, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
          {loading && <div style={{ marginTop: 24, color: '#64748b' }}>Loading candidates…</div>}

          {!loading && visible.length === 0 && (
            <div style={{ marginTop: 24, padding: 24, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', color: '#64748b' }}>
              No candidates in this view yet. Keep testing CraftCompass and this queue will populate automatically.
            </div>
          )}

          <div style={{ display: 'grid', gap: 14, marginTop: 22 }}>
            {visible.map((row) => (
              <article key={row.normalizedKey} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '4px 7px', borderRadius: 999, background: row.priority === 'high' ? '#fee2e2' : row.priority === 'medium' ? '#fef3c7' : '#e2e8f0', color: row.priority === 'high' ? '#991b1b' : row.priority === 'medium' ? '#92400e' : '#475569' }}>{row.priority} priority · {row.score}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{row.status}</span>
                    </div>
                    <h2 style={{ margin: '10px 0 5px', fontSize: 20 }}>{row.sampleQuestion}</h2>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>Key: {row.normalizedKey}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', gap: 8 }}>
                    <Metric label="Asked" value={String(row.count)} />
                    <Metric label="Avg time" value={`${(row.averageMs / 1000).toFixed(1)}s`} />
                    <Metric label="Helpful" value={String(row.helpfulCount)} />
                    <Metric label="Flags" value={String(row.flaggedCount)} />
                  </div>
                </div>

                {row.codeReferences.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Code references seen</div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>{row.codeReferences.join(' · ')}</div>
                  </div>
                )}

                {row.sourceTitles.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Verified sources used</div>
                    <div style={{ marginTop: 6, color: '#475569', fontSize: 12 }}>{row.sourceTitles.join(' · ')}</div>
                  </div>
                )}

                {row.notes && <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 8, color: '#475569', fontSize: 12 }}><strong>Review note:</strong> {row.notes}</div>}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <Action label="Reviewed" onClick={() => void updateStatus(row, 'reviewed')} />
                  <Action label="Approve" onClick={() => void updateStatus(row, 'approved')} />
                  <Action label="Mark normalized" onClick={() => void updateStatus(row, 'normalized')} />
                  <Action label="Reject" onClick={() => void updateStatus(row, 'rejected')} muted />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 10px', textAlign: 'center' }}><div style={{ fontWeight: 900 }}>{value}</div><div style={{ marginTop: 2, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>{label}</div></div>
}

function Action({ label, onClick, muted = false }: { label: string; onClick: () => void; muted?: boolean }) {
  return <button onClick={onClick} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', background: muted ? '#f8fafc' : '#fff', color: muted ? '#64748b' : '#123047', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
}
