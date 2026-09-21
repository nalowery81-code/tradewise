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
  pendingFlagCount?: number
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

type AuditReview = {
  id: string
  message_id: string
  status: string
  category: string | null
  correction_note: string | null
  corrected_answer: string | null
  updated_at: string
}

type FeedbackAudit = {
  id: string
  message_id: string | null
  question: string
  status: string
  rating: string | null
  response_text: string | null
  created_at: string
  responded_at: string | null
}

type UserFeedbackSignal = {
  id: string
  message_id: string
  rating: string
  created_at: string
  updated_at: string
}

type AuditFlag = {
  id: string
  message_id: string
  reporter_role: string
  comment: string
  status: string
  created_at: string
  reviewed_at: string | null
}

type GuidanceDraft = {
  id: string
  title: string
  guidance_text: string
  topic: string | null
  scope: string
  priority: number
  status: string
}

type CompanyOption = { id: string; name: string }

export default function ConversationAuditPage() {
  const [conversations, setConversations] = useState<AuditConversation[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [selected, setSelected] = useState<AuditConversation | null>(null)
  const [messages, setMessages] = useState<AuditMessage[]>([])
  const [reviews, setReviews] = useState<AuditReview[]>([])
  const [feedbackRequests, setFeedbackRequests] = useState<FeedbackAudit[]>([])
  const [flags, setFlags] = useState<AuditFlag[]>([])
  const [userFeedback, setUserFeedback] = useState<UserFeedbackSignal[]>([])
  const [guidanceDrafts, setGuidanceDrafts] = useState<Record<string, GuidanceDraft>>({})
  const [editingMessageId, setEditingMessageId] = useState('')
  const [reviewStatus, setReviewStatus] = useState('incorrect')
  const [reviewCategory, setReviewCategory] = useState('technical_error')
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctedAnswer, setCorrectedAnswer] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [draftingCorrection, setDraftingCorrection] = useState(false)
  const [actionStatus, setActionStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [role, setRole] = useState('')
  const [needsAuditOnly, setNeedsAuditOnly] = useState(false)

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
      if (needsAuditOnly && !conversation.pendingFlagCount) return false
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
  }, [conversations, companyId, role, search, needsAuditOnly])

  const openConversation = async (conversation: AuditConversation) => {
    setSelected(conversation)
    setMessages([])
    setReviews([])
    setFeedbackRequests([])
    setFlags([])
    setUserFeedback([])
    setGuidanceDrafts({})
    setEditingMessageId('')
    setActionStatus('')
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
    setReviews(data.reviews || [])
    setFeedbackRequests(data.feedbackRequests || [])
    setFlags(data.flags || [])
    setUserFeedback(data.userFeedback || [])
    setTranscriptLoading(false)
  }

  const startCorrection = (message: AuditMessage) => {
    const existing = reviews.find((review) => review.message_id === message.id)
    setEditingMessageId(message.id)
    setReviewStatus(existing?.status || 'incorrect')
    setReviewCategory(existing?.category || 'technical_error')
    setCorrectionNote(existing?.correction_note || '')
    const savedCorrection = existing?.corrected_answer || ''
    setCorrectedAnswer(savedCorrection === message.content ? '' : savedCorrection)
    setActionStatus('')
  }

  const draftCorrection = async (messageId: string) => {
    if (!selected || draftingCorrection) return
    if (!correctionNote.trim()) {
      setActionStatus('Add an Admin finding before drafting a corrected answer.')
      return
    }

    setDraftingCorrection(true)
    setActionStatus('Drafting corrected answer…')

    const token = await getToken()
    if (!token) return void (window.location.href = '/login')

    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'draft_correction',
        conversationType: selected.type,
        conversationId: selected.id,
        messageId,
        category: reviewCategory,
        correctionNote,
      }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setActionStatus(data.error || 'Could not draft corrected answer.')
      setDraftingCorrection(false)
      return
    }

    setCorrectedAnswer(data.draft || '')
    setReviewStatus('corrected')
    setActionStatus('AI draft ready — review and edit it before saving.')
    setDraftingCorrection(false)
  }

  const saveCorrection = async (messageId: string) => {
    if (!selected || savingReview) return
    setSavingReview(true)
    setActionStatus('')

    const token = await getToken()
    if (!token) return void (window.location.href = '/login')

    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'save_review',
        conversationType: selected.type,
        conversationId: selected.id,
        messageId,
        status: reviewStatus,
        category: reviewCategory,
        correctionNote,
        correctedAnswer,
      }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setActionStatus(data.error || 'Could not save correction.')
      setSavingReview(false)
      return
    }

    setReviews((current) => [...current.filter((item) => item.message_id !== messageId), data.review])
    setEditingMessageId('')
    setActionStatus('Correction saved.')
    setSavingReview(false)
  }

  const markGood = async (messageId: string) => {
    if (!selected || savingReview) return
    setSavingReview(true)
    setActionStatus('')

    const token = await getToken()
    if (!token) return void (window.location.href = '/login')

    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'save_review',
        conversationType: selected.type,
        conversationId: selected.id,
        messageId,
        status: 'good',
        category: 'excellent_answer',
        correctionNote: '',
        correctedAnswer: '',
      }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setActionStatus(data.error || 'Could not mark this answer Good.')
      setSavingReview(false)
      return
    }

    setReviews((current) => [...current.filter((item) => item.message_id !== messageId), data.review])
    setEditingMessageId('')
    setActionStatus('Marked Good.')
    setSavingReview(false)
  }

  const askForFeedback = async (messageId: string) => {
    if (!selected) return
    const question = window.prompt(
      'Question to send to this user:',
      'Was this CraftCompass answer helpful and accurate? What should we improve?'
    )
    if (!question?.trim()) return

    setActionStatus('')
    const token = await getToken()
    if (!token) return void (window.location.href = '/login')

    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'request_feedback',
        conversationType: selected.type,
        conversationId: selected.id,
        messageId,
        question: question.trim(),
      }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setActionStatus(data.error || 'Could not request feedback.')
      return
    }

    setFeedbackRequests((current) => [data.feedbackRequest, ...current])
    setActionStatus('Feedback request sent.')
  }

  const updateFlag = async (flag: AuditFlag, status: 'confirmed' | 'dismissed') => {
    if (!selected) return
    const token = await getToken()
    if (!token) return void (window.location.href = '/login')
    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'update_flag', conversationType: selected.type, conversationId: selected.id, messageId: flag.message_id, flagId: flag.id, status }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setActionStatus(data.error || 'Could not update flag.')
    setFlags((current) => current.map((item) => item.id === flag.id ? data.flag : item))
    if (status === 'confirmed') {
      const message = messages.find((item) => item.id === flag.message_id)
      if (message) startCorrection(message)
      setActionStatus('Flag confirmed. Add the Admin finding/correction below.')
    } else setActionStatus('Flag dismissed.')
  }

  const learnNow = async (messageId: string) => {
    if (!selected) return
    setActionStatus('Building guidance draft…')
    const token = await getToken()
    if (!token) return void (window.location.href = '/login')
    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'draft_guidance', conversationType: selected.type, conversationId: selected.id, messageId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setActionStatus(data.error || 'Could not build guidance.')
    setGuidanceDrafts((current) => ({ ...current, [messageId]: data.guidance }))
    setActionStatus('Guidance draft ready. Review it, then Activate now.')
  }

  const activateGuidance = async (messageId: string) => {
    if (!selected) return
    const draft = guidanceDrafts[messageId]
    if (!draft) return
    const token = await getToken()
    if (!token) return void (window.location.href = '/login')
    const response = await fetch('/api/platform-admin/conversation-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'activate_guidance', conversationType: selected.type, conversationId: selected.id, messageId, guidanceId: draft.id }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setActionStatus(data.error || 'Could not activate guidance.')
    setGuidanceDrafts((current) => ({ ...current, [messageId]: data.guidance }))
    setActionStatus('Learn Now activated. This guidance is now available to future CraftCompass answers.')
  }

  const conversationCount = filtered.length
  const techCount = conversations.filter((item) => item.role === 'technician').length
  const managementCount = conversations.filter((item) => item.role === 'manager' || item.role === 'owner').length
  const needsAuditCount = conversations.filter((item) => (item.pendingFlagCount || 0) > 0).length

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
          <a href="/platform-admin/guidance" style={navStyle}>Guidance Library</a>
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
            <Metric label="Needs audit" value={needsAuditCount} />
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
            <label style={{ ...controlStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={needsAuditOnly} onChange={(event) => setNeedsAuditOnly(event.target.checked)} />
              Needs Audit only
            </label>
          </div>

          {error && <div style={errorStyle}>{error}</div>}
          {actionStatus && <div style={{ ...errorStyle, background: actionStatus.includes('saved') || actionStatus.includes('sent') ? '#f0fdf4' : '#fff7ed', color: actionStatus.includes('saved') || actionStatus.includes('sent') ? '#166534' : '#9a3412' }}>{actionStatus}</div>}

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
                        {(conversation.pendingFlagCount || 0) > 0 && <span style={{ ...roleBadgeStyle, background: '#fef3c7', color: '#92400e' }}>Needs audit {conversation.pendingFlagCount}</span>}
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

                            {message.role === 'assistant' && (
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                                {(() => {
                                  const review = reviews.find((item) => item.message_id === message.id)
                                  const feedback = feedbackRequests.find((item) => item.message_id === message.id)
                                  const messageFlags = flags.filter((item) => item.message_id === message.id)
                                  const positiveFeedback = userFeedback.find((item) => item.message_id === message.id && item.rating === 'helpful')
                                  const guidance = guidanceDrafts[message.id]
                                  return (
                                    <>
                                      {messageFlags.map((flag) => (
                                        <div key={flag.id} style={{ marginBottom: 9, padding: 10, borderRadius: 9, background: flag.status === 'pending' ? '#fff7ed' : '#f8fafc', color: '#7c2d12', fontSize: 12, lineHeight: 1.45 }}>
                                          <div style={{ fontWeight: 850 }}>User flag · {flag.reporter_role} · {flag.status}</div>
                                          <div style={{ marginTop: 4 }}>{flag.comment}</div>
                                          {flag.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                                              <button type="button" onClick={() => void updateFlag(flag, 'confirmed')} style={auditButtonStyle}>Confirm & review</button>
                                              <button type="button" onClick={() => void updateFlag(flag, 'dismissed')} style={auditButtonStyle}>Dismiss</button>
                                            </div>
                                          )}
                                        </div>
                                      ))}

                                      {(review || feedback || positiveFeedback) && (
                                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
                                          {review && <span style={auditTagStyle}>{review.status.replace(/_/g, ' ')}</span>}
                                          {feedback && <span style={auditTagStyle}>feedback {feedback.status}</span>}
                                          {feedback?.rating && <span style={auditTagStyle}>{feedback.rating.replace(/_/g, ' ')}</span>}
                                          {positiveFeedback && <span style={{ ...auditTagStyle, background: '#f0fdf4', color: '#166534', borderColor: '#86efac' }}>👍 technician helpful</span>}
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                        <button
                                          type="button"
                                          disabled={savingReview}
                                          onClick={() => void markGood(message.id)}
                                          style={{
                                            ...auditButtonStyle,
                                            background: review?.status === 'good' ? '#166534' : '#f0fdf4',
                                            color: review?.status === 'good' ? '#fff' : '#166534',
                                            borderColor: '#86efac',
                                          }}
                                        >
                                          {review?.status === 'good' ? 'Good ✓' : 'Good'}
                                        </button>
                                        <button type="button" onClick={() => startCorrection(message)} style={auditButtonStyle}>
                                          {review ? 'Edit correction' : 'Correct / Review'}
                                        </button>
                                        <button type="button" onClick={() => void askForFeedback(message.id)} style={auditButtonStyle}>
                                          Ask for feedback
                                        </button>
                                        {review && ['corrected', 'resolved'].includes(review.status) && (
                                          <button type="button" onClick={() => void learnNow(message.id)} style={{ ...auditButtonStyle, background: '#172033', color: '#fff', borderColor: '#172033' }}>
                                            Learn Now
                                          </button>
                                        )}
                                      </div>

                                      {guidance && (
                                        <div style={{ marginTop: 10, padding: 11, borderRadius: 9, background: '#eff6ff', color: '#1e3a8a', fontSize: 12, lineHeight: 1.5 }}>
                                          <div style={{ fontWeight: 850 }}>Guidance draft · {guidance.status}</div>
                                          <div style={{ marginTop: 4, fontWeight: 750 }}>{guidance.title}</div>
                                          <div style={{ marginTop: 5 }}>{guidance.guidance_text}</div>
                                          <div style={{ marginTop: 5, color: '#475569' }}>{guidance.topic || 'General'} · {guidance.scope} · priority {guidance.priority}</div>
                                          {guidance.status !== 'active' && (
                                            <button type="button" onClick={() => void activateGuidance(message.id)} style={{ ...auditButtonStyle, marginTop: 8, background: '#172033', color: '#fff', borderColor: '#172033' }}>
                                              Activate now
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {feedback?.response_text && (
                                        <div style={{ marginTop: 9, padding: 9, borderRadius: 8, background: '#f8fafc', color: '#475569', fontSize: 12 }}>
                                          User feedback: {feedback.response_text}
                                        </div>
                                      )}

                                      {editingMessageId === message.id && (
                                        <div style={reviewEditorStyle}>
                                          <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} style={reviewControlStyle}>
                                            <option value="good">Good</option>
                                            <option value="needs_review">Needs review</option>
                                            <option value="incorrect">Incorrect</option>
                                            <option value="corrected">Corrected</option>
                                            <option value="resolved">Resolved</option>
                                          </select>
                                          <select value={reviewCategory} onChange={(event) => setReviewCategory(event.target.value)} style={reviewControlStyle}>
                                            <option value="technical_error">Technical error</option>
                                            <option value="source_problem">Source problem</option>
                                            <option value="incomplete_answer">Incomplete answer</option>
                                            <option value="wrong_assumption">Wrong assumption</option>
                                            <option value="unsafe_guidance">Unsafe guidance</option>
                                            <option value="excellent_answer">Excellent answer</option>
                                            <option value="other">Other</option>
                                          </select>
                                          <div style={{ fontSize: 11, fontWeight: 850, color: '#475569' }}>Admin finding</div>
                                          <textarea
                                            value={correctionNote}
                                            onChange={(event) => setCorrectionNote(event.target.value)}
                                            rows={3}
                                            placeholder="What is wrong, misleading, incomplete, or especially good about this answer?"
                                            style={reviewTextareaStyle}
                                          />
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: 11, fontWeight: 850, color: '#475569' }}>Corrected answer <span style={{ fontWeight: 500, color: '#94a3b8' }}>(optional)</span></div>
                                            <button
                                              type="button"
                                              disabled={draftingCorrection}
                                              onClick={() => void draftCorrection(message.id)}
                                              style={{ ...auditButtonStyle, opacity: draftingCorrection ? 0.6 : 1 }}
                                            >
                                              {draftingCorrection ? 'Drafting…' : 'Draft corrected answer with AI'}
                                            </button>
                                          </div>
                                          <textarea
                                            value={correctedAnswer}
                                            onChange={(event) => setCorrectedAnswer(event.target.value)}
                                            rows={5}
                                            placeholder="Leave blank if you only want to record the finding, or write/draft a replacement answer."
                                            style={reviewTextareaStyle}
                                          />
                                          <div style={{ display: 'flex', gap: 7 }}>
                                            <button type="button" disabled={savingReview || draftingCorrection} onClick={() => void saveCorrection(message.id)} style={auditButtonStyle}>
                                              {savingReview ? 'Saving…' : 'Save review'}
                                            </button>
                                            <button type="button" onClick={() => setEditingMessageId('')} style={auditButtonStyle}>Cancel</button>
                                          </div>
                                        </div>
                                      )}

                                      {review && editingMessageId !== message.id && (review.corrected_answer || review.correction_note) && (
                                        <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: '#f0fdf4', color: '#166534', fontSize: 12, lineHeight: 1.5 }}>
                                          {review.correction_note && <><strong>Admin finding:</strong><br />{review.correction_note}</>}
                                          {review.corrected_answer && <><br /><br /><strong>Corrected answer:</strong><br />{review.corrected_answer}</>}
                                        </div>
                                      )}
                                    </>
                                  )
                                })()}
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
const metricsStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 11, marginTop: 28 }
const metricStyle: React.CSSProperties = { padding: 16, border: '1px solid #e2e8f0', borderRadius: 13, background: '#fff' }
const filtersStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 190px 160px 160px', gap: 10, marginTop: 14 }
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

const auditButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '7px 9px',
  background: '#fff',
  color: '#334155',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
}
const auditTagStyle: React.CSSProperties = {
  padding: '4px 7px',
  borderRadius: 999,
  background: '#eef2f6',
  color: '#475569',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'capitalize',
}
const reviewEditorStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
}
const reviewControlStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 9px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  fontSize: 12,
}
const reviewTextareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 9,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  fontFamily: 'inherit',
  fontSize: 12,
  resize: 'vertical',
}
