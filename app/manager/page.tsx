'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type ManagerMessage = {
  role: 'user' | 'assistant'
  text: string
}

type TechnicianDirectoryItem = {
  id: string
  name: string
  reflectionCount: number
  latestReflectionAt: string | null
}

type TechnicianReflection = {
  job_type: string | null
  challenge: string | null
  what_went_well: string | null
  help_needed: string | null
  manager_insight: string | null
  created_at: string
}

type TechnicianProfile = {
  technician: { id: string; name: string }
  reflections: TechnicianReflection[]
  managerNote: { note: string | null; updated_at: string | null } | null
}

type ManagerSummarySection = {
  title: string
  body: string
}

const splitManagerSummary = (text: string): ManagerSummarySection[] => {
  const cleaned = text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\r/g, '')
    .trim()

  if (!cleaned) return []

  const parts = cleaned.split(
    /\b(Recent issues|Strengths|Support needs|Follow up)\b\s*:?\s*/gi
  )

  const sections: ManagerSummarySection[] = []

  for (let index = 1; index < parts.length; index += 2) {
    const title = parts[index]?.trim()
    const body = parts[index + 1]?.trim()
    if (title && body) sections.push({ title, body })
  }

  if (sections.length > 0) return sections

  return [{ title: 'Manager read', body: cleaned }]
}

const renderSummaryBody = (body: string) => {
  const bulletParts = body
    .split(/\n+/)
    .map((item) => item.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)

  if (bulletParts.length > 1) {
    return (
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7 }}>
        {bulletParts.map((item, index) => (
          <li key={`${item}-${index}`} style={{ lineHeight: 1.55 }}>
            {item}
          </li>
        ))}
      </ul>
    )
  }

  return <div style={{ lineHeight: 1.6 }}>{body}</div>
}

export default function ManagerPage() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ManagerMessage[]>([])
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedHistoryCategory, setSelectedHistoryCategory] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [managerView, setManagerView] = useState<'chat' | 'technicians' | 'technician-profile'>('chat')
  const [technicians, setTechnicians] = useState<TechnicianDirectoryItem[]>([])
  const [techniciansLoading, setTechniciansLoading] = useState(false)
  const [techniciansError, setTechniciansError] = useState('')
  const [technicianProfile, setTechnicianProfile] = useState<TechnicianProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSummary, setProfileSummary] = useState('')
  const [profileSummaryLoading, setProfileSummaryLoading] = useState(false)
  const [managerNoteDraft, setManagerNoteDraft] = useState('')
  const [managerNoteSaving, setManagerNoteSaving] = useState(false)
  const [managerNoteStatus, setManagerNoteStatus] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkManagerAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        window.location.replace('/login')
        return
      }

      try {
        const roleResponse = await fetch('/api/auth/role', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (!roleResponse.ok) {
          await supabase.auth.signOut()
          window.location.replace('/login')
          return
        }

        const { role } = await roleResponse.json()

        if (role !== 'manager') {
          window.location.replace('/technician')
          return
        }

        setCheckingAccess(false)
      } catch (error) {
        console.error('MANAGER ACCESS CHECK ERROR:', error)
        await supabase.auth.signOut()
        window.location.replace('/login')
      }
    }

    checkManagerAccess()
  }, [])

  useEffect(() => {
    const checkScreen = () => {
      const desktop = window.innerWidth >= 768
      setIsDesktop(desktop)
      setSidebarOpen(desktop)
    }

    checkScreen()
    window.addEventListener('resize', checkScreen)
    return () => window.removeEventListener('resize', checkScreen)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const getSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  }

  const loadTechnicians = async () => {
    setTechniciansLoading(true)
    setTechniciansError('')

    try {
      const session = await getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/manager/technicians', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()

      if (!response.ok) {
        setTechniciansError(data.error || 'Could not load technicians.')
        return
      }

      setTechnicians(data.technicians || [])
    } catch (error) {
      console.error('MANAGER TECHNICIAN DIRECTORY ERROR:', error)
      setTechniciansError('Could not load technicians.')
    } finally {
      setTechniciansLoading(false)
    }
  }

  const openTechnicians = () => {
    setManagerView('technicians')
    setTechnicianProfile(null)
    setProfileSummary('')
    setManagerNoteDraft('')
    setManagerNoteStatus('')
    setSelectedHistoryCategory(null)
    setSelectedConversation(null)
    void loadTechnicians()
    if (!isDesktop) setSidebarOpen(false)
  }

  const loadTechnicianProfile = async (technician: TechnicianDirectoryItem) => {
    setManagerView('technician-profile')
    setProfileLoading(true)
    setProfileError('')
    setProfileSummary('')
    setProfileSummaryLoading(true)
    setManagerNoteDraft('')
    setManagerNoteStatus('')
    setTechnicianProfile(null)

    try {
      const session = await getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const [profileResponse, summaryResponse] = await Promise.all([
        fetch(`/api/manager/technicians/${technician.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/manager/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message: `Give me a concise manager summary of ${technician.name}. Return exactly these four sections in this order: Recent issues, Strengths, Support needs, Follow up. Put each heading on its own line. Under each heading use 1 to 3 short bullet lines. No introduction. Do not use markdown heading or bold symbols such as # or **.`,
          }),
        }),
      ])

      const profileData = await profileResponse.json()
      const summaryData = await summaryResponse.json()

      if (!profileResponse.ok) {
        setProfileError(profileData.error || 'Could not load technician profile.')
      } else {
        setTechnicianProfile(profileData)
        setManagerNoteDraft(profileData.managerNote?.note || '')
      }

      if (summaryResponse.ok) {
        setProfileSummary(summaryData.reply || '')
      }
    } catch (error) {
      console.error('MANAGER TECHNICIAN PROFILE ERROR:', error)
      setProfileError('Could not load technician profile.')
    } finally {
      setProfileLoading(false)
      setProfileSummaryLoading(false)
    }
  }

  const saveManagerNote = async () => {
    if (!technicianProfile || managerNoteSaving) return

    setManagerNoteSaving(true)
    setManagerNoteStatus('')

    try {
      const session = await getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch(
        `/api/manager/technicians/${technicianProfile.technician.id}/note`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ note: managerNoteDraft }),
        }
      )
      const data = await response.json()

      if (!response.ok) {
        setManagerNoteStatus(data.error || 'Could not save note.')
        return
      }

      setTechnicianProfile((current) =>
        current
          ? {
              ...current,
              managerNote: data.managerNote,
            }
          : current
      )
      setManagerNoteDraft(data.managerNote?.note || '')
      setManagerNoteStatus('Saved')
    } catch (error) {
      console.error('MANAGER NOTE SAVE ERROR:', error)
      setManagerNoteStatus('Could not save note.')
    } finally {
      setManagerNoteSaving(false)
    }
  }

  const handleNewChat = () => {
    setMessage('')
    setMessages([])
    setManagerView('chat')
    setTechnicianProfile(null)
    setProfileSummary('')
    setManagerNoteDraft('')
    setManagerNoteStatus('')
    setSelectedHistoryCategory(null)
    setSelectedConversation(null)
    if (!isDesktop) setSidebarOpen(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const handleSend = async (questionOverride?: string) => {
    const question = (questionOverride ?? message).trim()
    if (!question || sending) return

    setManagerView('chat')
    setSelectedHistoryCategory(null)
    setSelectedConversation(null)
    setMessages((current) => [...current, { role: 'user', text: question }])
    setMessage('')
    setSending(true)

    try {
      const session = await getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/manager/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: question }),
      })

      const data = await response.json()

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: response.ok
            ? data.reply
            : data.error || 'I had trouble reading the team data. Try that again.',
        },
      ])
    } catch (error) {
      console.error('MANAGER CHAT ERROR:', error)
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: 'I could not connect to the manager assistant. Try that again.' },
      ])
    } finally {
      setSending(false)
    }
  }

  const askAboutProfile = () => {
    if (!technicianProfile) return
    const question = message.trim() || `What should I know about ${technicianProfile.technician.name} right now?`
    void handleSend(`${question}\n\nFocus specifically on ${technicianProfile.technician.name}.`)
  }

  const sidebarItems = ['New chat', 'Search', 'History', 'Follow-up', 'Technicians', 'Manager Notes']
  const historyCategories = [
    'Weekly Team Review',
    'Technician Development',
    'Training & Coaching',
    'Recurring Job Issues',
    'Team Performance Trends',
    'Customer Experience',
    'Safety & Risk',
    'Operations Follow-Up',
  ]
  const starters = [
    'Give me a weekly summary of what the team is dealing with.',
    'Who on the team may need a follow-up?',
    'What recurring issues are showing up?',
    'Where do you see training opportunities?',
  ]

  const managerSummarySections = splitManagerSummary(profileSummary)

  if (checkingAccess) {
    return (
      <main style={loadingPageStyle}>
        <div>Loading manager workspace...</div>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <aside style={{ ...sidebarStyle, display: sidebarOpen ? 'flex' : 'none' }}>
        <div style={sidebarHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Tradewise Manager</div>
          {!isDesktop && (
            <button type="button" onClick={() => setSidebarOpen(false)} style={iconButtonStyle}>×</button>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6, flex: 1, alignContent: 'start' }}>
          {sidebarItems.map((item) => (
            <div key={item}>
              <button
                type="button"
                onClick={() => {
                  if (item === 'New chat') handleNewChat()
                  if (item === 'History') setHistoryOpen((current) => !current)
                  if (item === 'Technicians') openTechnicians()
                }}
                style={{
                  ...sidebarButtonStyle,
                  background: item === 'Technicians' && managerView !== 'chat' ? '#eef2f5' : 'transparent',
                  fontWeight: item === 'Technicians' && managerView !== 'chat' ? 700 : 400,
                }}
              >
                {item}
              </button>

              {item === 'History' && historyOpen && (
                <div style={{ display: 'grid', gap: 4, margin: '4px 0 8px 12px' }}>
                  {historyCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setManagerView('chat')
                        setSelectedHistoryCategory(category)
                        setSelectedConversation(null)
                        if (!isDesktop) setSidebarOpen(false)
                      }}
                      style={historyButtonStyle}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={handleSignOut} style={signOutStyle}>Sign out</button>
      </aside>

      <header style={{ ...headerStyle, marginLeft: isDesktop && sidebarOpen ? 278 : 0 }}>
        <button type="button" onClick={() => setSidebarOpen((current) => !current)} style={menuButtonStyle}>☰</button>
        Tradewise
      </header>

      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: 'clamp(34px, 7vw, 76px) 16px 160px',
          transform: isDesktop && sidebarOpen ? 'translateX(139px)' : 'none',
        }}
      >
        {managerView === 'technicians' ? (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={eyebrowStyle}>Team</div>
              <h1 style={pageTitleStyle}>Technicians</h1>
              <p style={subtleTextStyle}>Open a technician to review their recent history, manager context, and coaching needs.</p>
            </div>

            {techniciansLoading ? (
              <div style={statusCardStyle}>Loading technicians...</div>
            ) : techniciansError ? (
              <div style={statusCardStyle}>{techniciansError}</div>
            ) : technicians.length === 0 ? (
              <div style={statusCardStyle}>No technicians found yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {technicians.map((technician) => (
                  <button key={technician.id} type="button" onClick={() => void loadTechnicianProfile(technician)} style={technicianCardStyle}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#172033' }}>{technician.name}</div>
                      <div style={{ marginTop: 6, fontSize: 14, color: '#64748b' }}>
                        {technician.reflectionCount} reflection{technician.reflectionCount === 1 ? '' : 's'}
                        {technician.latestReflectionAt ? ` · Latest ${new Date(technician.latestReflectionAt).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 20, color: '#94a3b8' }}>›</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : managerView === 'technician-profile' ? (
          <div>
            <button type="button" onClick={openTechnicians} style={backButtonStyle}>← Back to Technicians</button>

            {profileLoading && !technicianProfile ? (
              <div style={statusCardStyle}>Loading technician profile...</div>
            ) : profileError ? (
              <div style={statusCardStyle}>{profileError}</div>
            ) : technicianProfile ? (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={eyebrowStyle}>Technician profile</div>
                  <h1 style={pageTitleStyle}>{technicianProfile.technician.name}</h1>
                  <p style={subtleTextStyle}>
                    {technicianProfile.reflections.length} recent reflection{technicianProfile.reflections.length === 1 ? '' : 's'} loaded
                  </p>
                </div>

                <section style={profileSectionStyle}>
                  <h2 style={sectionTitleStyle}>Manager read</h2>
                  {profileSummaryLoading ? (
                    <div style={{ color: '#64748b' }}>Reading recent team data...</div>
                  ) : managerSummarySections.length > 0 ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {managerSummarySections.map((section) => (
                        <div key={section.title} style={summarySectionStyle}>
                          <div style={summarySectionTitleStyle}>{section.title}</div>
                          <div style={{ marginTop: 7 }}>{renderSummaryBody(section.body)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#64748b' }}>No summary available yet.</div>
                  )}
                </section>

                <section style={profileSectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <h2 style={sectionTitleStyle}>Manager note</h2>
                    {technicianProfile.managerNote?.updated_at && (
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        Updated {new Date(technicianProfile.managerNote.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <textarea
                    value={managerNoteDraft}
                    onChange={(event) => {
                      setManagerNoteDraft(event.target.value)
                      if (managerNoteStatus) setManagerNoteStatus('')
                    }}
                    placeholder={`Add a private manager note about ${technicianProfile.technician.name}...`}
                    rows={4}
                    style={managerNoteInputStyle}
                  />

                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => void saveManagerNote()}
                      disabled={managerNoteSaving}
                      style={{ ...saveNoteButtonStyle, opacity: managerNoteSaving ? 0.6 : 1 }}
                    >
                      {managerNoteSaving ? 'Saving...' : 'Save note'}
                    </button>
                    {managerNoteStatus && (
                      <div style={{ fontSize: 13, color: managerNoteStatus === 'Saved' ? '#475569' : '#991b1b' }}>
                        {managerNoteStatus}
                      </div>
                    )}
                  </div>
                </section>

                <section style={{ marginTop: 26 }}>
                  <h2 style={sectionTitleStyle}>Recent reflections</h2>
                  {technicianProfile.reflections.length === 0 ? (
                    <div style={statusCardStyle}>No reflections found for this technician.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {technicianProfile.reflections.map((reflection, index) => (
                        <div key={`${reflection.created_at}-${index}`} style={reflectionCardStyle}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                            <div style={{ fontWeight: 700 }}>{reflection.job_type || 'Job reflection'}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(reflection.created_at).toLocaleDateString()}</div>
                          </div>
                          <div style={{ marginTop: 10, lineHeight: 1.55 }}>{reflection.challenge || 'No challenge recorded.'}</div>
                          {reflection.manager_insight && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef2f5', color: '#475569', lineHeight: 1.55 }}>
                              {reflection.manager_insight}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        ) : selectedHistoryCategory ? (
          selectedConversation ? (
            <div>
              <button type="button" onClick={() => setSelectedConversation(null)} style={backButtonStyle}>← Back to History</button>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 38px)' }}>Coaching follow-up: customer communication</h1>
              <p style={subtleTextStyle}>Saved manager conversations will appear here as we build manager history.</p>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setSelectedHistoryCategory(null)} style={backButtonStyle}>← Back</button>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 38px)' }}>{selectedHistoryCategory}</h1>
              <p style={subtleTextStyle}>Conversations and insights related to this area will appear here.</p>
            </div>
          )
        ) : messages.length === 0 ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 34 }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: 700 }}>What would you like to know about your team?</h1>
              <p style={{ marginTop: 12, color: '#6b7280', fontSize: 16 }}>Ask Tradewise about technicians, trends, training, or team performance.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 28 }}>
              {starters.map((starter) => (
                <button key={starter} type="button" onClick={() => void handleSend(starter)} disabled={sending} style={starterStyle}>{starter}</button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} style={{ display: 'flex', justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={item.role === 'user' ? userBubbleStyle : assistantBubbleStyle}>{item.text}</div>
              </div>
            ))}
            {sending && <div style={readingStyle}>Reading the team data...</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </section>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to top, #f7f7f8 78%, rgba(247,247,248,0))',
          padding: '14px 20px 22px',
          paddingLeft: isDesktop && sidebarOpen ? 298 : 20,
        }}
      >
        <div style={composerStyle}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={managerView === 'technician-profile' && technicianProfile ? `Ask Tradewise about ${technicianProfile.technician.name}...` : 'Ask Tradewise about your team...'}
            rows={1}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (managerView === 'technician-profile') askAboutProfile()
                else void handleSend()
              }
            }}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => managerView === 'technician-profile' ? askAboutProfile() : void handleSend()}
            disabled={sending || !message.trim()}
            style={{ ...sendButtonStyle, opacity: sending || !message.trim() ? 0.45 : 1 }}
          >
            ↑
          </button>
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = { minHeight: '100vh', background: '#f7f7f8', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1f2937' }
const loadingPageStyle: React.CSSProperties = { ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const sidebarStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, bottom: 0, width: 250, background: '#ffffff', borderRight: '1px solid #e5e7eb', padding: '18px 14px', zIndex: 20, flexDirection: 'column' }
const sidebarHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, padding: '0 8px' }
const sidebarButtonStyle: React.CSSProperties = { width: '100%', border: 'none', textAlign: 'left', padding: '11px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 15 }
const historyButtonStyle: React.CSSProperties = { border: 'none', background: 'transparent', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#6b7280' }
const iconButtonStyle: React.CSSProperties = { border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }
const signOutStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', background: '#ffffff', textAlign: 'left', padding: '11px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 15, marginTop: 16 }
const headerStyle: React.CSSProperties = { height: 64, borderBottom: '1px solid #e5e7eb', background: '#ffffff', display: 'flex', alignItems: 'center', padding: '0 20px', fontWeight: 700, fontSize: 20 }
const menuButtonStyle: React.CSSProperties = { marginRight: 12, border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }
const backButtonStyle: React.CSSProperties = { border: 'none', background: 'transparent', padding: 0, marginBottom: 18, cursor: 'pointer', fontSize: 14, color: '#6b7280' }
const starterStyle: React.CSSProperties = { padding: 18, borderRadius: 16, border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer', fontSize: 15, fontWeight: 600, textAlign: 'left', lineHeight: 1.45 }
const userBubbleStyle: React.CSSProperties = { maxWidth: '78%', background: '#e7edf2', borderRadius: 18, padding: '12px 16px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }
const assistantBubbleStyle: React.CSSProperties = { width: '100%', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '18px 20px', lineHeight: 1.62, whiteSpace: 'pre-wrap', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }
const readingStyle: React.CSSProperties = { width: 'fit-content', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 16px', color: '#6b7280' }
const composerStyle: React.CSSProperties = { maxWidth: 760, margin: '0 auto', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 22, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 18px rgba(0,0,0,0.06)' }
const inputStyle: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 16, fontFamily: 'inherit', padding: '10px 8px', background: 'transparent' }
const sendButtonStyle: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#111827', color: '#ffffff', cursor: 'pointer', fontSize: 18 }
const statusCardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', color: '#64748b' }
const technicianCardStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', background: '#ffffff', cursor: 'pointer', boxShadow: '0 3px 12px rgba(15,23,42,0.035)' }
const eyebrowStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }
const pageTitleStyle: React.CSSProperties = { margin: '8px 0 0', fontSize: 'clamp(28px, 5vw, 38px)' }
const subtleTextStyle: React.CSSProperties = { marginTop: 10, color: '#6b7280', lineHeight: 1.6 }
const profileSectionStyle: React.CSSProperties = { marginTop: 18, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '20px 22px', boxShadow: '0 3px 14px rgba(15,23,42,0.03)' }
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: '#172033' }
const reflectionCardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', boxShadow: '0 3px 12px rgba(15,23,42,0.03)' }
const summarySectionStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #eef2f5', borderRadius: 14, padding: '14px 16px' }
const summarySectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#172033' }
const managerNoteInputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 12, padding: '12px 14px', resize: 'vertical', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.5, outline: 'none', background: '#ffffff' }
const saveNoteButtonStyle: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '9px 14px', background: '#172033', color: '#ffffff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
