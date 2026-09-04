'use client'

import { useEffect, useRef, useState } from 'react'

import { supabase } from '../lib/supabase'

function renderAssistantText(text: string) {
  const lines = text.split('\n')
  const headingLabels = new Set([
    'Indiana Code',
    'Manufacturer',
    'What this means',
    'Conclusion',
  ])

  const lastContentIndex = [...lines]
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .at(-1)?.index

  return (
    <div>
      {lines.map((line, index) => {
        const trimmed = line.trim()
        const cleaned = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/:$/, '')
        const isHeading = headingLabels.has(cleaned)
        const isFinalQuestion = index === lastContentIndex && trimmed.endsWith('?')

        if (!trimmed) return <div key={index} style={{ height: 10 }} />

        if (isHeading) {
          return (
            <div
              key={index}
              style={{
                marginTop: index === 0 ? 0 : 8,
                marginBottom: 6,
                fontSize: 17,
                fontWeight: 800,
                color: '#123047',
                letterSpacing: '-0.01em',
              }}
            >
              {cleaned}
            </div>
          )
        }

        if (isFinalQuestion) {
          return (
            <div
              key={index}
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: '#eef4f7',
                borderLeft: '4px solid #123047',
                fontWeight: 700,
                lineHeight: 1.5,
                color: '#123047',
              }}
            >
              {trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '')}
            </div>
          )
        }

        return <div key={index}>{line}</div>
      })}
    </div>
  )
}

export default function TechnicianPage() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<
    {
      role: 'user' | 'assistant'
      text: string
      image?: string
      sources?: {
        title: string
        url?: string
        type: 'web' | 'file'
      }[]
    }[]
  >([])

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [technicianId, setTechnicianId] = useState<string | null>(null)
  const [technicianName, setTechnicianName] = useState('')
  const [recentConversationsLoading, setRecentConversationsLoading] = useState(true)
  const [recentConversations, setRecentConversations] = useState<
    {
      id: string
      title: string
      created_at: string
      updated_at: string
      status: string
    }[]
  >([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.()
      } catch {
        // Ignore cleanup errors from browser speech recognition.
      }
    }
  }, [])

  const loadRecentConversations = async (id?: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch('/api/conversations', {
        headers: {
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('RECENT CONVERSATIONS LOAD ERROR:', data.error)
        return
      }

      setRecentConversations(data.conversations || [])
    } catch (error) {
      console.error('RECENT CONVERSATIONS LOAD ERROR:', error)
    } finally {
      setRecentConversationsLoading(false)
    }
  }

  useEffect(() => {
    loadRecentConversations()
  }, [])

  useEffect(() => {
    const loadTechnicianIdentity = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error('AUTH USER LOAD ERROR:', userError)
        window.location.replace('/login')
        return
      }

      const { data, error } = await supabase
        .from('Technicians')
        .select('id, canonical_name')
        .eq('auth_user_id', user.id)
        .single()

      if (error) {
        console.error('TECHNICIAN IDENTITY LOAD ERROR:', error)
        return
      }

      setTechnicianId(data.id)
      setTechnicianName(data.canonical_name)
      loadRecentConversations(data.id)
    }

    loadTechnicianIdentity()
  }, [])

  const handleImage = (file?: File) => {
    if (!file) return

    if (file.type.startsWith('image/')) {
      setSelectedImage(URL.createObjectURL(file))
      setSelectedImageFile(file)
    }
    setAttachOpen(false)
  }

  const handleNewConversation = () => {
    setMessages([])
    setMessage('')
    setSelectedImage(null)
    setSelectedImageFile(null)
    setAttachOpen(false)
    setDrawerOpen(false)
    setConversationId(null)
  }

  const loadConversation = async (id: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch(`/api/conversations/${id}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      })
      const data = await res.json()

      if (!res.ok) {
        console.error('CONVERSATION LOAD ERROR:', data.error)
        return
      }

      setConversationId(id)
      setMessages(data.messages || [])
      setDrawerOpen(false)
    } catch (error) {
      console.error('CONVERSATION LOAD ERROR:', error)
    }
  }

  const prepareImageForSend = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        const img = new Image()

        img.onload = () => {
          const maxSize = 1800
          let width = img.width
          let height = img.height

          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Could not prepare image'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        }

        img.onerror = () => reject(new Error('Could not read image'))
        img.src = reader.result as string
      }

      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsDataURL(file)
    })
  }

  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop?.()
      return
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      window.alert(
        'Voice input is not supported by this browser yet. You can still use your keyboard microphone for dictation.'
      )
      return
    }

    const recognition = new SpeechRecognition()
    const startingMessage = message.trim()

    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event: any) => {
      let transcript = ''

      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript || ''
      }

      const spokenText = transcript.trim()
      setMessage([startingMessage, spokenText].filter(Boolean).join(' '))
    }
    recognition.onerror = (event: any) => {
      setIsListening(false)

      if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
        console.error('VOICE INPUT ERROR:', event?.error)
        window.alert('I could not start voice input. Check microphone permission and try again.')
      }
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (error) {
      console.error('VOICE INPUT START ERROR:', error)
      setIsListening(false)
      recognitionRef.current = null
    }
  }

  const handleSend = async () => {
    const text = message.trim()

    if (!text && !selectedImageFile) return

    const imageData = selectedImageFile
      ? await prepareImageForSend(selectedImageFile)
      : null

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: text || '',
        image: selectedImage || undefined,
      },
    ])
    setSelectedImage(null)
    setSelectedImageFile(null)
    setMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          message: text,
          image: imageData,
          history: messages.slice(-12),
          conversationId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.error || 'I had trouble responding. Try that again.',
          },
        ])
        return
      }

      setConversationId(data.conversationId)
      loadRecentConversations()

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply,
          sources: data.sources || [],
        },
      ])
    } catch (error) {
      console.error('Tradewise chat error:', error)

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'I could not connect. Try sending that again.',
        },
      ])
    }
  }

  return (
    <main style={styles.page}>
      {drawerOpen && (
        <div style={styles.backdrop} onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        style={{
          ...styles.drawer,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div style={styles.drawerHeader}>
          <div style={styles.drawerBrand}>Tradewise</div>

          <button
            type="button"
            style={styles.iconButton}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <button type="button" style={styles.newConversation} onClick={handleNewConversation}>
          ＋ New conversation
        </button>

        <div style={styles.drawerSection}>
          <div style={styles.sectionTitle}>Recent conversations</div>
          {recentConversationsLoading ? (
            <div style={styles.emptyText}>Loading conversations...</div>
          ) : recentConversations.length === 0 ? (
            <div style={styles.emptyText}>No recent conversations yet.</div>
          ) : (
            recentConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => loadConversation(conversation.id)}
                style={{
                  ...styles.emptyText,
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '6px 0',
                  cursor: 'pointer',
                }}
              >
                {conversation.title}
              </button>
            ))
          )}
        </div>

        <div style={styles.drawerSection}>
          <div style={styles.sectionTitle}>Projects</div>
          <div style={styles.emptyText}>Projects will appear here.</div>
        </div>

        <button
          type="button"
          style={styles.newConversation}
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.replace('/login')
          }}
        >
          Sign out
        </button>
      </aside>

      <header style={styles.header}>
        <button
          type="button"
          style={styles.menuButton}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>

        <div style={styles.headerBrand}>Tradewise</div>
        <div style={{ width: 42 }} />
      </header>

      <section style={styles.content}>
        {messages.length === 0 && (
          <div style={styles.hero}>
            <div style={styles.brandBlock}>
              <div style={styles.brandName}>Tradewise</div>
              <div style={styles.brandTagline}>Your AI partner in the trades</div>
            </div>

            <h1 style={styles.greeting}>
              {technicianName ? `Hey, ${technicianName}.` : 'Hey.'}
            </h1>

            <p style={styles.subGreeting}>What are we working on?</p>
          </div>
        )}

        <div style={styles.chatArea}>
          {messages.map((item, index) => (
            <div
              key={index}
              style={{
                ...styles.messageRow,
                justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={item.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                {item.image && (
                  <img
                    src={item.image}
                    alt="Uploaded equipment"
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: 390,
                      borderRadius: 14,
                      marginBottom: item.text ? 8 : 0,
                    }}
                  />
                )}

                {item.text &&
                  (item.role === 'assistant' ? (
                    renderAssistantText(item.text)
                  ) : (
                    <div>{item.text}</div>
                  ))}

                {item.sources && item.sources.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: '1px solid #e5e7eb',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Verified sources
                    </div>

                    {item.sources.map((source, sourceIndex) =>
                      source.type === 'web' && source.url ? (
                        <a
                          key={sourceIndex}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            textDecoration: 'underline',
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {source.title}
                        </a>
                      ) : (
                        <div
                          key={sourceIndex}
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#334155',
                          }}
                        >
                          📄 {source.title}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </section>

      <div style={styles.composerArea}>
        <div style={styles.composerWrap}>
          {selectedImage && (
            <div style={styles.previewWrap}>
              <img src={selectedImage} alt="Selected attachment" style={styles.previewImage} />

              <button
                type="button"
                style={styles.removePreview}
                onClick={() => setSelectedImage(null)}
              >
                ✕
              </button>
            </div>
          )}

          {attachOpen && (
            <div style={styles.attachmentMenu}>
              <button
                type="button"
                style={styles.attachmentOption}
                onClick={() => cameraInputRef.current?.click()}
              >
                <span style={styles.attachmentIcon}>📷</span>
                Camera
              </button>

              <button
                type="button"
                style={styles.attachmentOption}
                onClick={() => photoInputRef.current?.click()}
              >
                <span style={styles.attachmentIcon}>🖼️</span>
                Photos
              </button>

              <button
                type="button"
                style={styles.attachmentOption}
                onClick={() => fileInputRef.current?.click()}
              >
                <span style={styles.attachmentIcon}>📎</span>
                Files
              </button>
            </div>
          )}

          <div style={styles.composer}>
            <button
              type="button"
              style={styles.plusButton}
              onClick={() => setAttachOpen((prev) => !prev)}
              aria-label="Add attachment"
            >
              +
            </button>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isListening ? 'Listening…' : 'Ask Tradewise…'}
              rows={1}
              style={styles.input}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />

            <button
              type="button"
              style={{
                ...styles.voiceButton,
                ...(isListening ? styles.voiceButtonActive : {}),
              }}
              onClick={handleVoiceInput}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={isListening}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <path d="M12 17v5" />
                <path d="M8 22h8" />
              </svg>
            </button>

            <button
              type="button"
              style={{
                ...styles.sendButton,
                opacity: message.trim() || selectedImage ? 1 : 0.45,
              }}
              onClick={handleSend}
              aria-label="Send"
            >
              ↑
            </button>
          </div>

          <div style={styles.footerText}>
            {isListening
              ? 'Listening — tap the microphone again to stop.'
              : 'Tradewise can make mistakes. Verify important field information.'}
          </div>
        </div>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleImage(e.target.files?.[0])}
      />

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleImage(e.target.files?.[0])}
      />

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={() => setAttachOpen(false)}
      />
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#f7f7f5',
    color: '#171717',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Arial, Helvetica, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    zIndex: 40,
  },
  drawer: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: 'min(330px, 88vw)',
    height: '100dvh',
    background: '#ffffff',
    zIndex: 50,
    padding: '20px',
    boxSizing: 'border-box',
    transition: 'transform 180ms ease',
    boxShadow: '8px 0 30px rgba(0,0,0,0.10)',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '22px',
  },
  drawerBrand: {
    fontSize: '22px',
    fontWeight: 700,
  },
  iconButton: {
    width: 38,
    height: 38,
    border: 'none',
    background: 'transparent',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 18,
  },
  newConversation: {
    width: '100%',
    border: '1px solid #e5e7eb',
    background: '#f8fafc',
    borderRadius: 12,
    padding: '13px 14px',
    textAlign: 'left',
    fontSize: 15,
    cursor: 'pointer',
    marginBottom: '26px',
  },
  drawerSection: {
    marginBottom: '28px',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '9px',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  header: {
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid rgba(15,23,42,0.06)',
    background: 'rgba(247,247,245,0.92)',
  },
  menuButton: {
    width: 42,
    height: 42,
    border: 'none',
    borderRadius: 12,
    background: 'transparent',
    fontSize: 24,
    cursor: 'pointer',
    color: '#334155',
  },
  headerBrand: {
    fontSize: 18,
    fontWeight: 700,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 clamp(18px, 4vw, 48px) 165px',
  },
  hero: {
    width: '100%',
    maxWidth: 900,
    marginTop: 'clamp(90px, 17vh, 180px)',
    textAlign: 'center',
  },
  brandBlock: {
    marginBottom: 42,
  },
  brandName: {
    fontSize: 'clamp(42px, 9vw, 68px)',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.055em',
    color: '#123047',
  },
  brandTagline: {
    marginTop: 10,
    fontSize: 'clamp(14px, 3vw, 17px)',
    fontWeight: 500,
    color: '#527080',
    letterSpacing: '0.01em',
  },
  greeting: {
    fontSize: 'clamp(34px, 7vw, 54px)',
    lineHeight: 1.05,
    margin: 0,
    fontWeight: 650,
    letterSpacing: '-0.04em',
  },
  subGreeting: {
    fontSize: 'clamp(18px, 4vw, 23px)',
    marginTop: 14,
    color: '#64748b',
    fontWeight: 400,
  },
  chatArea: {
    width: '100%',
    maxWidth: 1040,
    margin: '30px auto 0',
    paddingBottom: 28,
  },
  messageRow: {
    width: '100%',
    display: 'flex',
    marginBottom: 22,
  },
  userBubble: {
    maxWidth: '72%',
    background: '#e7edf2',
    color: '#172033',
    padding: '12px 16px',
    borderRadius: 18,
    fontSize: 16,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  assistantBubble: {
    maxWidth: 880,
    width: 'min(880px, 92%)',
    background: '#ffffff',
    border: '1px solid #e7eaec',
    borderRadius: 18,
    boxShadow: '0 4px 18px rgba(15,23,42,0.045)',
    color: '#172033',
    padding: '18px 20px',
    fontSize: 16,
    lineHeight: 1.62,
    whiteSpace: 'pre-wrap',
  },
  composerArea: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    padding: '16px 18px 12px',
    background: 'linear-gradient(to top, #f7f7f5 74%, rgba(247,247,245,0))',
  },
  composerWrap: {
    width: '100%',
    maxWidth: 1040,
    margin: '0 auto',
    position: 'relative',
  },
  composer: {
    minHeight: 64,
    background: '#ffffff',
    border: '1px solid #dfe5e9',
    borderRadius: 24,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '9px',
    boxShadow: '0 8px 30px rgba(15,23,42,0.09)',
  },
  plusButton: {
    width: 44,
    height: 44,
    flex: '0 0 44px',
    borderRadius: '50%',
    border: '1px solid #dfe5e9',
    background: '#f8fafc',
    fontSize: 28,
    lineHeight: 1,
    cursor: 'pointer',
    color: '#334155',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    resize: 'none',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 16,
    padding: '11px 6px 8px',
    fontFamily: 'inherit',
    color: '#171717',
  },
  voiceButton: {
    width: 44,
    height: 44,
    flex: '0 0 44px',
    borderRadius: '50%',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    transition: 'background 120ms ease, color 120ms ease, transform 120ms ease',
  },
  voiceButtonActive: {
    background: '#123047',
    color: '#ffffff',
    borderColor: '#123047',
    transform: 'scale(1.06)',
  },
  sendButton: {
    width: 44,
    height: 44,
    flex: '0 0 44px',
    borderRadius: '50%',
    border: 'none',
    background: '#172033',
    color: '#ffffff',
    fontSize: 24,
    cursor: 'pointer',
    transition: 'opacity 120ms ease',
  },
  attachmentMenu: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    width: 210,
    padding: 8,
    borderRadius: 16,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 14px 40px rgba(15,23,42,0.16)',
    zIndex: 20,
  },
  attachmentOption: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    border: 'none',
    background: 'transparent',
    padding: '12px',
    borderRadius: 10,
    textAlign: 'left',
    fontSize: 15,
    cursor: 'pointer',
    color: '#1e293b',
  },
  attachmentIcon: {
    width: 26,
    fontSize: 19,
  },
  previewWrap: {
    position: 'relative',
    display: 'inline-block',
    marginBottom: 10,
    padding: 5,
    background: '#ffffff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    boxShadow: '0 5px 20px rgba(15,23,42,0.08)',
  },
  previewImage: {
    width: 92,
    height: 92,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 10,
  },
  removePreview: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 'none',
    background: '#172033',
    color: '#ffffff',
    cursor: 'pointer',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 8,
    padding: '0 10px',
  },
}
