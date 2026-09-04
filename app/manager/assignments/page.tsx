'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Manager = { id: string; name: string; email: string }
type Technician = { id: string; name: string }
type Assignment = { manager_profile_id: string; technician_id: string }

export default function ManagerAssignmentsPage() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string[]>>({})

  const getSession = async () => (await supabase.auth.getSession()).data.session

  const loadAssignments = async () => {
    setLoading(true)
    setError('')
    try {
      const session = await getSession()
      if (!session) return window.location.replace('/login')

      const response = await fetch('/api/owner/assignments', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()

      if (response.status === 401) return window.location.replace('/login')
      if (response.status === 403) return window.location.replace('/manager')
      if (!response.ok) return setError(data.error || 'Could not load assignments.')

      const nextMap: Record<string, string[]> = {}
      for (const assignment of (data.assignments || []) as Assignment[]) {
        nextMap[assignment.manager_profile_id] ||= []
        nextMap[assignment.manager_profile_id].push(assignment.technician_id)
      }

      setManagers(data.managers || [])
      setTechnicians(data.technicians || [])
      setAssignmentMap(nextMap)

      const firstManagerId = data.managers?.[0]?.id || ''
      setSelectedManagerId(firstManagerId)
      setSelectedTechnicianIds(firstManagerId ? nextMap[firstManagerId] || [] : [])
    } catch (loadError) {
      console.error('ASSIGNMENTS PAGE LOAD ERROR:', loadError)
      setError('Could not load assignments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAssignments()
  }, [])

  const selectedManager = useMemo(
    () => managers.find((manager) => manager.id === selectedManagerId) || null,
    [managers, selectedManagerId]
  )

  const chooseManager = (managerId: string) => {
    setSelectedManagerId(managerId)
    setSelectedTechnicianIds(assignmentMap[managerId] || [])
    setStatus('')
  }

  const toggleTechnician = (technicianId: string) => {
    setSelectedTechnicianIds((current) =>
      current.includes(technicianId)
        ? current.filter((id) => id !== technicianId)
        : [...current, technicianId]
    )
    setStatus('')
  }

  const saveAssignments = async () => {
    if (!selectedManagerId || saving) return
    setSaving(true)
    setStatus('')

    try {
      const session = await getSession()
      if (!session) return window.location.replace('/login')

      const response = await fetch('/api/owner/assignments', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          managerProfileId: selectedManagerId,
          technicianIds: selectedTechnicianIds,
        }),
      })
      const data = await response.json()

      if (response.status === 401) return window.location.replace('/login')
      if (response.status === 403) return window.location.replace('/manager')
      if (!response.ok) return setStatus(data.error || 'Could not save assignments.')

      setAssignmentMap((current) => ({ ...current, [selectedManagerId]: data.technicianIds || [] }))
      setStatus('Assignments saved.')
    } catch (saveError) {
      console.error('ASSIGNMENTS PAGE SAVE ERROR:', saveError)
      setStatus('Could not save assignments.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f8', padding: '40px 18px 70px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#172033' }}>
      <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/manager/company" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>← Back to Company</a>
          <a href="/manager" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>Manager workspace</a>
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Owner workspace</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(30px, 5vw, 42px)' }}>Manager assignments</h1>
          <p style={{ marginTop: 10, color: '#64748b', lineHeight: 1.6, maxWidth: 700 }}>
            Choose which technicians each manager is responsible for. Owners continue to see the full company.
          </p>
        </div>

        {loading ? (
          <div style={cardStyle}>Loading assignments...</div>
        ) : error ? (
          <div style={{ ...cardStyle, color: '#991b1b', borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>
        ) : managers.length === 0 ? (
          <div style={cardStyle}>Add a manager first, then assign technicians here.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(280px, 1.2fr)', gap: 16, marginTop: 24 }}>
            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>Managers</h2>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {managers.map((manager) => {
                  const active = manager.id === selectedManagerId
                  const assignedCount = assignmentMap[manager.id]?.length || 0
                  return (
                    <button
                      key={manager.id}
                      type="button"
                      onClick={() => chooseManager(manager.id)}
                      style={{
                        textAlign: 'left',
                        border: active ? '1px solid #172033' : '1px solid #e5e7eb',
                        background: active ? '#eef2f6' : '#ffffff',
                        borderRadius: 11,
                        padding: '12px 13px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{manager.name}</div>
                      <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>{manager.email || `${assignedCount} assigned`}</div>
                      <div style={{ marginTop: 5, fontSize: 12, color: '#475569' }}>{assignedCount} technician{assignedCount === 1 ? '' : 's'} assigned</div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>{selectedManager ? `Technicians for ${selectedManager.name}` : 'Technicians'}</h2>
              <div style={{ marginTop: 8, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                A manager with no assignments will see no technicians in their directory.
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {technicians.map((technician) => {
                  const checked = selectedTechnicianIds.includes(technician.id)
                  return (
                    <label key={technician.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e7eb', borderRadius: 10, padding: '11px 12px', cursor: 'pointer', background: checked ? '#f8fafc' : '#ffffff' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTechnician(technician.id)} />
                      <span style={{ fontWeight: 600 }}>{technician.name}</span>
                    </label>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" disabled={saving || !selectedManagerId} onClick={() => void saveAssignments()} style={{ border: 'none', borderRadius: 10, padding: '10px 14px', background: '#172033', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving...' : 'Save assignments'}
                </button>
                {status && <span style={{ fontSize: 13, color: status === 'Assignments saved.' ? '#166534' : '#991b1b' }}>{status}</span>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

const cardStyle: React.CSSProperties = { marginTop: 0, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', boxShadow: '0 3px 14px rgba(15,23,42,0.03)' }
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700, color: '#172033' }
