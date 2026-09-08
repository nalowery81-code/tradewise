'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type TechnicianSummary = {
  id: string
  name: string
}

type ManagerSummary = {
  id: string
  name: string
  email: string
  isActive: boolean
  technicianCount: number
  technicians: TechnicianSummary[]
  openFollowUps: number
  recentActivity7d: number
  lastActivityAt: string | null
}

type OwnerOverview = {
  company: {
    id: string
    name: string
  }
  snapshot: {
    managers: number
    activeManagers: number
    technicians: number
    assignedTechnicians: number
    unassignedTechnicians: number
    openFollowUps: number
    activeTechnicians7d: number
    latestCompanyActivityAt: string | null
  }
  managers: ManagerSummary[]
  unassignedTechnicians: TechnicianSummary[]
}

const formatActivity = (value: string | null) => {
  if (!value) return 'No activity yet'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'No activity yet'

  const diffMs = Date.now() - time
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

export default function OwnerOverviewPage() {
  const [data, setData] = useState<OwnerOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          window.location.replace('/login')
          return
        }

        const response = await fetch('/api/owner/overview', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const result = await response.json().catch(() => ({}))

        if (response.status === 401) {
          window.location.replace('/login')
          return
        }

        if (response.status === 403) {
          window.location.replace('/manager')
          return
        }

        if (!response.ok) {
          setError(result.error || 'Could not load company overview.')
          return
        }

        setData(result)
      } catch (loadError) {
        console.error('OWNER OVERVIEW PAGE LOAD ERROR:', loadError)
        setError('Could not load company overview.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={eyebrowStyle}>Owner workspace</div>
        <div style={headingRowStyle}>
          <div>
            <h1 style={titleStyle}>Company overview</h1>
            <p style={subtitleStyle}>
              {data?.company.name || 'Your company'} at a glance — managers, technicians, follow-ups, and recent field activity.
            </p>
          </div>
          <div style={quickLinksStyle}>
            <a href="/manager/company" style={secondaryLinkStyle}>Company</a>
            <a href="/manager/assignments" style={primaryLinkStyle}>Manage assignments</a>
          </div>
        </div>

        {loading ? (
          <div style={statusCardStyle}>Loading company overview...</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : data ? (
          <>
            <section style={snapshotGridStyle} aria-label="Company snapshot">
              <SnapshotCard label="Managers" value={data.snapshot.managers} note={`${data.snapshot.activeManagers} active`} />
              <SnapshotCard label="Technicians" value={data.snapshot.technicians} note={`${data.snapshot.assignedTechnicians} assigned`} />
              <SnapshotCard label="Open follow-ups" value={data.snapshot.openFollowUps} note="Across the company" attention={data.snapshot.openFollowUps > 0} />
              <SnapshotCard label="Active techs" value={data.snapshot.activeTechnicians7d} note="Activity in last 7 days" />
              <SnapshotCard label="Unassigned" value={data.snapshot.unassignedTechnicians} note="Technicians needing a manager" attention={data.snapshot.unassignedTechnicians > 0} />
            </section>

            <div style={companyActivityStyle}>
              <span style={{ fontWeight: 800 }}>Latest company activity</span>
              <span>{formatActivity(data.snapshot.latestCompanyActivityAt)}</span>
            </div>

            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <div style={sectionEyebrowStyle}>Team structure</div>
                  <h2 style={sectionTitleStyle}>Managers and their technicians</h2>
                  <p style={sectionTextStyle}>See who each manager is responsible for and where attention may be needed.</p>
                </div>
                <a href="/manager/assignments" style={textLinkStyle}>Edit assignments →</a>
              </div>

              {data.managers.length ? (
                <div style={managerGridStyle}>
                  {data.managers.map((manager) => (
                    <article key={manager.id} style={managerCardStyle}>
                      <div style={managerHeaderStyle}>
                        <div style={{ minWidth: 0 }}>
                          <div style={managerNameStyle}>{manager.name}</div>
                          <div style={managerEmailStyle}>{manager.email || 'No email available'}</div>
                        </div>
                        <div style={manager.isActive ? activeBadgeStyle : inactiveBadgeStyle}>
                          {manager.isActive ? 'Active' : 'Inactive'}
                        </div>
                      </div>

                      <div style={managerStatsStyle}>
                        <ManagerStat value={manager.technicianCount} label="Techs" />
                        <ManagerStat value={manager.openFollowUps} label="Open follow-ups" attention={manager.openFollowUps > 0} />
                        <ManagerStat value={manager.recentActivity7d} label="7-day activity" />
                      </div>

                      <div style={lastActivityStyle}>
                        Last team activity: <strong>{formatActivity(manager.lastActivityAt)}</strong>
                      </div>

                      <div style={technicianSectionStyle}>
                        <div style={technicianLabelStyle}>Assigned technicians</div>
                        {manager.technicians.length ? (
                          <div style={technicianChipsStyle}>
                            {manager.technicians.map((technician) => (
                              <span key={technician.id} style={technicianChipStyle}>{technician.name}</span>
                            ))}
                          </div>
                        ) : (
                          <div style={emptyManagerTextStyle}>No technicians assigned yet.</div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  <div style={{ fontWeight: 800 }}>No managers yet</div>
                  <div style={{ marginTop: 6, color: '#64748b' }}>Add a manager, then assign technicians to build the company hierarchy.</div>
                  <a href="/manager/add-manager" style={{ ...primaryLinkStyle, marginTop: 14, display: 'inline-block' }}>+ Add Manager</a>
                </div>
              )}
            </section>

            {data.unassignedTechnicians.length > 0 && (
              <section style={attentionSectionStyle}>
                <div style={sectionHeaderStyle}>
                  <div>
                    <div style={attentionEyebrowStyle}>Needs attention</div>
                    <h2 style={{ ...sectionTitleStyle, marginTop: 5 }}>Unassigned technicians</h2>
                    <p style={sectionTextStyle}>These technicians are not currently assigned to a manager.</p>
                  </div>
                  <a href="/manager/assignments" style={textLinkStyle}>Assign technicians →</a>
                </div>
                <div style={technicianChipsStyle}>
                  {data.unassignedTechnicians.map((technician) => (
                    <span key={technician.id} style={unassignedChipStyle}>{technician.name}</span>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}

function SnapshotCard({ label, value, note, attention = false }: { label: string; value: number; note: string; attention?: boolean }) {
  return (
    <div style={{ ...snapshotCardStyle, ...(attention ? snapshotAttentionStyle : {}) }}>
      <div style={snapshotLabelStyle}>{label}</div>
      <div style={snapshotValueStyle}>{value}</div>
      <div style={snapshotNoteStyle}>{note}</div>
    </div>
  )
}

function ManagerStat({ value, label, attention = false }: { value: number; label: string; attention?: boolean }) {
  return (
    <div style={managerStatStyle}>
      <div style={{ ...managerStatValueStyle, ...(attention ? { color: '#b45309' } : {}) }}>{value}</div>
      <div style={managerStatLabelStyle}>{label}</div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f7f7f8',
  color: '#172033',
  fontFamily: 'Arial, Helvetica, sans-serif',
  padding: '42px 18px 70px',
  boxSizing: 'border-box',
}

const shellStyle: React.CSSProperties = { maxWidth: 1120, margin: '0 auto' }
const eyebrowStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }
const headingRowStyle: React.CSSProperties = { marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 'clamp(32px, 5vw, 46px)', letterSpacing: '-0.035em', lineHeight: 1.05 }
const subtitleStyle: React.CSSProperties = { maxWidth: 700, margin: '12px 0 0', color: '#64748b', fontSize: 15, lineHeight: 1.65 }
const quickLinksStyle: React.CSSProperties = { display: 'flex', gap: 9, flexWrap: 'wrap' }
const secondaryLinkStyle: React.CSSProperties = { padding: '10px 13px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#475569', textDecoration: 'none', fontSize: 13, fontWeight: 800 }
const primaryLinkStyle: React.CSSProperties = { padding: '10px 13px', border: '1px solid #172033', borderRadius: 9, background: '#172033', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 800 }
const statusCardStyle: React.CSSProperties = { marginTop: 28, padding: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', color: '#64748b' }
const errorStyle: React.CSSProperties = { marginTop: 28, padding: 16, border: '1px solid #fed7aa', borderRadius: 12, background: '#fff7ed', color: '#9a3412' }

const snapshotGridStyle: React.CSSProperties = { marginTop: 30, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12 }
const snapshotCardStyle: React.CSSProperties = { padding: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', boxShadow: '0 3px 12px rgba(15,23,42,0.035)' }
const snapshotAttentionStyle: React.CSSProperties = { borderColor: '#fdba74', background: '#fffaf3' }
const snapshotLabelStyle: React.CSSProperties = { color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }
const snapshotValueStyle: React.CSSProperties = { marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 850, letterSpacing: '-0.03em' }
const snapshotNoteStyle: React.CSSProperties = { marginTop: 8, color: '#64748b', fontSize: 12, lineHeight: 1.4 }
const companyActivityStyle: React.CSSProperties = { marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '11px 14px', borderRadius: 10, background: '#eef2f6', color: '#475569', fontSize: 13 }

const sectionStyle: React.CSSProperties = { marginTop: 30, padding: 22, border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }
const attentionSectionStyle: React.CSSProperties = { ...sectionStyle, borderColor: '#fdba74', background: '#fffaf3' }
const sectionHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }
const sectionEyebrowStyle: React.CSSProperties = { color: '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }
const attentionEyebrowStyle: React.CSSProperties = { ...sectionEyebrowStyle, color: '#b45309' }
const sectionTitleStyle: React.CSSProperties = { margin: '6px 0 0', fontSize: 24, letterSpacing: '-0.02em' }
const sectionTextStyle: React.CSSProperties = { margin: '7px 0 0', color: '#64748b', fontSize: 14, lineHeight: 1.55 }
const textLinkStyle: React.CSSProperties = { color: '#334155', textDecoration: 'none', fontSize: 13, fontWeight: 800, padding: '6px 0' }
const managerGridStyle: React.CSSProperties = { marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }
const managerCardStyle: React.CSSProperties = { padding: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fbfcfd' }
const managerHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }
const managerNameStyle: React.CSSProperties = { fontSize: 18, fontWeight: 850, overflowWrap: 'anywhere' }
const managerEmailStyle: React.CSSProperties = { marginTop: 4, color: '#64748b', fontSize: 12, overflowWrap: 'anywhere' }
const activeBadgeStyle: React.CSSProperties = { padding: '5px 8px', borderRadius: 999, background: '#ecfdf5', color: '#047857', fontSize: 11, fontWeight: 800 }
const inactiveBadgeStyle: React.CSSProperties = { padding: '5px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 800 }
const managerStatsStyle: React.CSSProperties = { marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }
const managerStatStyle: React.CSSProperties = { minWidth: 0, padding: '10px 8px', borderRadius: 10, background: '#fff', border: '1px solid #e8edf2', textAlign: 'center' }
const managerStatValueStyle: React.CSSProperties = { fontSize: 20, fontWeight: 850 }
const managerStatLabelStyle: React.CSSProperties = { marginTop: 3, color: '#64748b', fontSize: 10, lineHeight: 1.25 }
const lastActivityStyle: React.CSSProperties = { marginTop: 13, color: '#64748b', fontSize: 12 }
const technicianSectionStyle: React.CSSProperties = { marginTop: 16, paddingTop: 14, borderTop: '1px solid #e2e8f0' }
const technicianLabelStyle: React.CSSProperties = { color: '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }
const technicianChipsStyle: React.CSSProperties = { marginTop: 9, display: 'flex', gap: 7, flexWrap: 'wrap' }
const technicianChipStyle: React.CSSProperties = { padding: '6px 9px', borderRadius: 999, background: '#eef2f6', color: '#334155', fontSize: 12, fontWeight: 700 }
const unassignedChipStyle: React.CSSProperties = { ...technicianChipStyle, background: '#ffedd5', color: '#9a3412' }
const emptyManagerTextStyle: React.CSSProperties = { marginTop: 8, color: '#94a3b8', fontSize: 12 }
const emptyStateStyle: React.CSSProperties = { marginTop: 18, padding: 20, border: '1px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc' }
