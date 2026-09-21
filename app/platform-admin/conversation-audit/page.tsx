'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type AuditConversation = {
  id: string
  type: 'technician' | 'management'
  role: 'technician' | 'manager' | 'owner'
  title: string
  companyId: string
  companyName: string
  userName: string
  userEmail: string
  createdAt: string
  updatedAt: string
  contextType: string
  modelName: string | null
}

type AuditSource = {
  title: string
  url?: string
  type?: string
}

type AuditMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | null
  createdAt: string
  modelName?: string | null
  sources: AuditSource[]
}

type CompanyOption = { id: string; name: string }

export default function ConversationAuditPage() {
  const [conversations, setConversations] = useState<AuditConversation[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [selected, setSelected] = useState<AuditConversation | null>(null)
  const [messages, setMessages] = useState<AuditMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [role, setRole] = useState('')

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token || ''

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      if (!token) return void (window.location.href = '/login')

      const response = await fetch('/api/platform-admin/conversation-audit', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))

      if (response.status === 403) return void (window.location.href = '/manager')
      if (!response.ok) {
        setError(data.error || 'Could not load conversation audit.')
        setLoading(false)
        return
      }

      setConversations(data.conversations || [])
      setCompanies(data.companies || [])
      setLoading(false)
    }

    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return conversations.filter((conversation) => {
      if (companyId && conversation.companyId !== companyId) return false
      if (role && conversation.role !== role) return false
      if (!needle) return true
      return [
        conversation.title,
        conversation.companyName,
        conversation.userName,
        conversation.userEmail,
        conversation.role,
        conversation.contextType,
      ].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [conversations, companyId, role, search])

  const openConversation = async (conversation: AuditConversation) => {
    setSelected(conversation)
    setMessages([])
    setTranscriptLoading(true)
    setError('')

    const token = await getToken()
    if (!token) return void (window.location.href = '/login')

    const params = new URLSearchParams({
      conversationId: conversation.id,
      conversationType: conversation.type,
    })

    const response = await fetch(`/api/platform-admin/conversation-audit?${params.toString()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Could not load transcript.')
      setTranscriptLoading(false)
      return
    }

    setSelected(data.conversation)
    setMessages(data.messages || [])
    setTranscriptLoading(false)
  }

  const conversationCount = filtered.length
  const techCount = conversations.filter((item) => item.role === 'technician').length
  const managementCount = conversations.filter((item) => item.role === 'manager' || item.role === 'owner').length

  return (
    <main style={pageStyle}>
      <style>{`
        @media (max-width: 900px) {
          .audit-layout { grid-template-columns: 1fr !important; }
          .audit-sidebar { position: static !important; width: auto !important; min-height: auto !important; }
          .audit-content { margin-left: 0 !important; padding: 24px 14px 50px !important; }
          .audit-filters { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <aside className="audit-sidebar" style={sidebarStyle}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>CraftCompass AI</div>
          <div style={eyebrowStyle}>Platform Admin</div>
        </div>
        <nav style={{ display: 'grid', gap: 7, marginTop: 32 }}>
          <a href="/platform-admin" style={navStyle}>Companies</a>
          <a href="/platform-admin/users" style={navStyle}>Users</a>
          <a href="/platform-admin/conversation-audit" style={activeNavStyle}>Conversation Audit</a>
        </nav>
        <a href="/manager" style={backStyle}>← Owner Workspace</a>
      </aside>

      <section className="audit-content" style={{ marginLeft: 244, padding: '38px clamp(20px, 4vw, 58px) 70px' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div>
            <div style={{ ...eyebrowStyle, color: '#64748b' }}>Quality & Safety</div>
            <h1 style={{ margin: '7px 0 8px', fontSize: 36, letterSpacing: '-0.035em' }}>Conversation Audit</h1>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>
              Review exactly what CraftCompass users asked and the responses they received.
            </p>
          </div>

          <div style={metricsStyle}>
            <Metric label="Shown" value={conversationCount} />
            <Metric label="Technician chats" value={techCount} />
            <Metric label="Manager + owner" value={managementCount} />
          </div>

          <div className="audit-filters" style={filtersStyle}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search user, company, title, email..."
              style={controlStyle}
            />
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} style={controlStyle}>
              <option value="">All companies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={role} onChange={(event) => setRole(event.target.value)} style={controlStyle}>
              <option value="">All roles</option>
              <option value="technician">Technicians</option>
              <option value="manager">Managers</option>
              <option value="owner">Owners</option>
            </select>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <div className="audit-layout" style={layoutStyle}>
            <section style={listCardStyle}>
              <div style={listHeaderStyle}>
                {loading ? 'Loading conversations…' : `${filtered.length} conversation${filtered.length === 1 ? '' : 's'}`}
              </div>
              <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
                {!loading && filtered.length === 0 && <div style={emptyStyle}>No conversations match these filters.</div>}
                {filtered.map((conversation) => {
                  const isActive = selected?.id === conversation.id && selected?.type === conversation.type
                  return (
                    <button
                      key={`${conversation.type}-${conversation.id}`}
                      type="button"
                      onClick={() => void openConversation(conversation)}
                      style={{ ...conversationRowStyle, background: isActive ? '#eef2f6' : '#fff' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={roleBadgeStyle}>{conversation.role}</span>
                        <span style={dateStyle}>{new Date(conversation.updatedAt || conversation.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ marginTop: 9, fontWeight: 800, color: '#172033', lineHeight: 1.35 }}>
                        {conversation.title}
                      </div>
                      <div style={{ marginTop: 6, color: '#475569', fontSize: 13 }}>
                        {conversation.userName}{conversation.userEmail ? ` · ${conversation.userEmail}` : ''}
                      </div>
                      <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 12 }}>
                        {conversation.companyName}{conversation.contextType === 'profile_summary' ? ' · Profile summary' : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section style={transcriptCardStyle}>
              {!selected ? (
                <div style={transcriptEmptyStyle}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#334155' }}>Select a conversation</div>
                  <div style={{ marginTop: 7 }}>The exact stored transcript will appear here.</div>
                </div>
              ) : (
                <>
                  <div style={transcriptHeaderStyle}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={roleBadgeStyle}>{selected.role}</span>
                        <span style={{ color: '#64748b', fontSize: 12 }}>{selected.companyName}</span>
                      </div>
                      <h2 style={{ margin: '8px 0 3px', fontSize: 22 }}>{selected.title}</h2>
                      <div style={{ color: '#64748b', fontSize: 13 }}>
                        {selected.userName}{selected.userEmail ? ` · ${selected.userEmail}` : ''}
                      </div>
                      <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 12 }}>
                        {selected.modelName || 'Model not recorded'} · Started {new Date(selected.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div style={transcriptBodyStyle}>
                    {transcriptLoading ? (
                      <div style={emptyStyle}>Loading full transcript…</div>
                    ) : messages.length === 0 ? (
                      <div style={emptyStyle}>No stored messages found.</div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          style={{
                            ...messageWrapStyle,
                            justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div style={message.role === 'user' ? userBubbleStyle : assistantBubbleStyle}>
                            <div style={messageLabelStyle}>
                              {message.role === 'user' ? selected.role : 'CraftCompass AI'}
                              <span style={{ fontWeight: 500, color: '#94a3b8' }}>
                                {new Date(message.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {message.imageUrl && (
                              <img
                                src={message.imageUrl}
                                alt="Conversation attachment"
                                style={{ width: '100%', maxWidth: 420, marginBottom: 10, borderRadius: 10 }}
                              />
                            )}
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.58 }}>{message.content || '[Image only]'}</div>

                            {message.role === 'assistant' && message.sources?.length > 0 && (
                              <div style={sourcesStyle}>
                                <div style={{ fontWeight: 800, fontSize: 12, color: '#475569' }}>Verified sources</div>
                                <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
                                  {message.sources.map((source, index) =>
                                    source.url ? (
                                      <a
                                        key={`${source.url}-${index}`}
                                        href={source.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ color: '#2563eb', fontSize: 13, overflowWrap: 'anywhere' }}
                                      >
                                        {source.title || source.url}
                                      </a>
                                    ) : (
                                      <div key={`${source.title}-${index}`} style={{ fontSize: 13, color: '#475569' }}>
                                        {source.title || 'Verified document'}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selected.type === 'technician' && messages.some((message) => message.role === 'assistant' && (!message.sources || message.sources.length === 0)) && (
                    <div style={historyNoteStyle}>
                      Older technician messages may not show their verified-source links because source metadata was not stored before Conversation Audit was added. New responses will retain those sources.
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metricStyle}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 28, fontWeight: 850 }}>{value}</div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { minHeight: '100vh', background: '#f7f7f8', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }
const sidebarStyle: React.CSSProperties = { position: 'fixed', inset: '0 auto 0 0', width: 244, minHeight: '100vh', padding: '30px 20px 22px', boxSizing: 'border-box', background: '#111827', color: '#f8fafc', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column' }
const eyebrowStyle: React.CSSProperties = { marginTop: 5, color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }
const navStyle: React.CSSProperties = { display: 'block', padding: '11px 12px', borderRadius: 9, color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 700 }
const activeNavStyle: React.CSSProperties = { ...navStyle, background: '#273449', color: '#fff', fontWeight: 800 }
const backStyle: React.CSSProperties = { marginTop: 'auto', padding: '10px 12px', border: '1px solid #334155', borderRadius: 9, color: '#cbd5e1', textDecoration: 'none', fontSize: 13, fontWeight: 700 }
const metricsStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 11, marginTop: 28 }
const metricStyle: React.CSSProperties = { padding: 16, border: '1px solid #e2e8f0', borderRadius: 13, background: '#fff' }
const filtersStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 220px 180px', gap: 10, marginTop: 14 }
const controlStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#172033', fontSize: 13 }
const layoutStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(330px, .8fr) minmax(480px, 1.45fr)', gap: 14, alignItems: 'start', marginTop: 14 }
const listCardStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }
const listHeaderStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 800 }
const conversationRowStyle: React.CSSProperties = { width: '100%', display: 'block', textAlign: 'left', padding: 14, border: 0, borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }
const roleBadgeStyle: React.CSSProperties = { display: 'inline-block', padding: '4px 8px', borderRadius: 999, background: '#e2e8f0', color: '#334155', fontSize: 10, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.04em' }
const dateStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 10 }
const transcriptCardStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff', minHeight: 520 }
const transcriptHeaderStyle: React.CSSProperties = { padding: '17px 18px', borderBottom: '1px solid #e2e8f0', background: '#fbfdff' }
const transcriptBodyStyle: React.CSSProperties = { maxHeight: 'calc(100vh - 350px)', minHeight: 390, overflowY: 'auto', padding: 18, background: '#f8fafc' }
const transcriptEmptyStyle: React.CSSProperties = { minHeight: 520, display: 'grid', placeContent: 'center', textAlign: 'center', color: '#94a3b8', padding: 30 }
const messageWrapStyle: React.CSSProperties = { display: 'flex', marginBottom: 14 }
const userBubbleStyle: React.CSSProperties = { width: 'min(82%, 720px)', padding: '12px 14px', borderRadius: '15px 15px 4px 15px', background: '#172033', color: '#fff', fontSize: 14 }
const assistantBubbleStyle: React.CSSProperties = { width: 'min(88%, 780px)', padding: '12px 14px', borderRadius: '15px 15px 15px 4px', background: '#fff', color: '#172033', border: '1px solid #e2e8f0', fontSize: 14 }
const messageLabelStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 7, fontSize: 10, fontWeight: 850, textTransform: 'capitalize', opacity: .9 }
const sourcesStyle: React.CSSProperties = { marginTop: 13, paddingTop: 11, borderTop: '1px solid #e2e8f0' }
const historyNoteStyle: React.CSSProperties = { padding: '11px 15px', borderTop: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: 12, lineHeight: 1.45 }
const emptyStyle: React.CSSProperties = { padding: 24, color: '#64748b', fontSize: 13 }
const errorStyle: React.CSSProperties = { marginTop: 14, padding: 11, borderRadius: 10, background: '#fef2f2', color: '#991b1b', fontSize: 13 }
