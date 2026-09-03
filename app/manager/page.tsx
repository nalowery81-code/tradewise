'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type ManagerMessage = {
  role: 'user' | 'assistant'
  text: string
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
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
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

  const handleNewChat = () => {
    setMessage('')
    setMessages([])
    setSelectedHistoryCategory(null)
    setSelectedConversation(null)

    if (!isDesktop) {
      setSidebarOpen(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const handleSend = async (questionOverride?: string) => {
    const question = (questionOverride ?? message).trim()
    if (!question || sending) return

    setSelectedHistoryCategory(null)
    setSelectedConversation(null)
    setMessages((current) => [...current, { role: 'user', text: question }])
    setMessage('')
    setSending(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

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

      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            text: data.error || 'I had trouble reading the team data. Try that again.',
          },
        ])
        return
      }

      setMessages((current) => [
        ...current,
        { role: 'assistant', text: data.reply },
      ])
    } catch (error) {
      console.error('MANAGER CHAT ERROR:', error)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: 'I could not connect to the manager assistant. Try that again.',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const sidebarItems = [
    'New chat',
    'Search',
    'History',
    'Follow-up',
    'Technicians',
    'Manager Notes',
  ]

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

  if (checkingAccess) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f7f8',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
        }}
      >
        <div>Loading manager workspace...</div>
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f7f7f8',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#1f2937',
      }}
    >
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 250,
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          padding: '18px 14px',
          zIndex: 20,
          display: sidebarOpen ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 22,
            padding: '0 8px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>Tradewise Manager</div>

          {!isDesktop && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gap: 6,
            flex: 1,
            alignContent: 'start',
          }}
        >
          {sidebarItems.map((item) => (
            <div key={item}>
              <button
                type="button"
                onClick={() => {
                  if (item === 'New chat') handleNewChat()
                  if (item === 'History') setHistoryOpen((current) => !current)
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '11px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 15,
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
                        setSelectedHistoryCategory(category)
                        setSelectedConversation(null)
                        if (!isDesktop) setSidebarOpen(false)
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#6b7280',
                      }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          style={{
            width: '100%',
            border: '1px solid #e5e7eb',
            background: '#ffffff',
            textAlign: 'left',
            padding: '11px 10px',
            borderRadius: 10,
            cursor: 'pointer',
            fontSize: 15,
            marginTop: 16,
          }}
        >
          Sign out
        </button>
      </aside>

      <header
        style={{
          height: 64,
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          marginLeft: isDesktop && sidebarOpen ? 278 : 0,
          fontWeight: 700,
          fontSize: 20,
        }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen((current) => !current)}
          style={{
            marginRight: 12,
            border: 'none',
            background: 'transparent',
            fontSize: 22,
            cursor: 'pointer',
          }}
        >
          ☰
        </button>
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
        {selectedHistoryCategory ? (
          selectedConversation ? (
            <div>
              <button
                type="button"
                onClick={() => setSelectedConversation(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  marginBottom: 18,
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#6b7280',
                }}
              >
                ← Back to History
              </button>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 38px)' }}>
                Coaching follow-up: customer communication
              </h1>
              <p style={{ marginTop: 12, color: '#6b7280', lineHeight: 1.6 }}>
                Saved manager conversations will appear here as we build manager history.
              </p>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setSelectedHistoryCategory(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  marginBottom: 18,
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#6b7280',
                }}
              >
                ← Back
              </button>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 38px)' }}>
                {selectedHistoryCategory}
              </h1>
              <p style={{ marginTop: 10, color: '#6b7280', lineHeight: 1.6 }}>
                Conversations and insights related to this area will appear here.
              </p>
              <button
                type="button"
                onClick={() => setSelectedConversation('coaching-follow-up')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #e5e7eb',
                  borderRadius: 16,
                  padding: '18px 20px',
                  background: '#ffffff',
                  cursor: 'pointer',
                  marginTop: 28,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  Coaching follow-up: customer communication
                </div>
                <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
                  Manager history is still being connected to saved conversations.
                </div>
              </button>
            </div>
          )
        ) : messages.length === 0 ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 34 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(26px, 5vw, 34px)',
                  fontWeight: 700,
                }}
              >
                What would you like to know about your team?
              </h1>
              <p style={{ marginTop: 12, color: '#6b7280', fontSize: 16 }}>
                Ask Tradewise about technicians, trends, training, or team performance.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                marginBottom: 28,
              }}
            >
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void handleSend(starter)}
                  disabled={sending}
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    cursor: sending ? 'default' : 'pointer',
                    fontSize: 15,
                    fontWeight: 600,
                    textAlign: 'left',
                    lineHeight: 1.45,
                  }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={
                    item.role === 'user'
                      ? {
                          maxWidth: '78%',
                          background: '#e7edf2',
                          borderRadius: 18,
                          padding: '12px 16px',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                        }
                      : {
                          width: '100%',
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 18,
                          padding: '18px 20px',
                          lineHeight: 1.62,
                          whiteSpace: 'pre-wrap',
                          boxShadow: '0 4px 18px rgba(0,0,0,0.04)',
                        }
                  }
                >
                  {item.text}
                </div>
              </div>
            ))}

            {sending && (
              <div
                style={{
                  width: 'fit-content',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 16,
                  padding: '12px 16px',
                  color: '#6b7280',
                }}
              >
                Reading the team data...
              </div>
            )}
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
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: 22,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
          }}
        >
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask Tradewise about your team..."
            rows={1}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 16,
              fontFamily: 'inherit',
              padding: '10px 8px',
              background: 'transparent',
            }}
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !message.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: '#111827',
              color: '#ffffff',
              cursor: sending || !message.trim() ? 'default' : 'pointer',
              fontSize: 18,
              opacity: sending || !message.trim() ? 0.45 : 1,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </main>
  )
}
