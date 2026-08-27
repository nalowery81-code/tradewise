'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function TechnicianPage() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [messages, setMessages] = useState<
  {
    role: 'user' | 'assistant'
    text: string
    image?: string
  }[]
>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
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
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    body: JSON.stringify({
  message: text,
  image: imageData,
  history: messages.slice(-12),
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

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: data.reply,
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
      {/* Backdrop */}
      {drawerOpen && (
        <div
          style={styles.backdrop}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Left drawer */}
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
          <div style={styles.emptyText}>No recent conversations yet.</div>
        </div>

        <div style={styles.drawerSection}>
          <div style={styles.sectionTitle}>Projects</div>
          <div style={styles.emptyText}>Projects will appear here.</div>
        </div>
      </aside>

      {/* Header */}
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

      {/* Main content */}
      <section style={styles.content}>
      {messages.length === 0 && ( 
        <div style={styles.hero}>

  <div style={styles.brandBlock}>
    <div style={styles.brandName}>Tradewise</div>
    <div style={styles.brandTagline}>
      Your AI partner in the trades
    </div>
  </div>

  <h1 style={styles.greeting}>Hey, Nate.</h1>

  <p style={styles.subGreeting}>
    What are we working on?
  </p>
</div>
    )}  
    <div style={styles.chatArea}>
  {messages.map((item, index) => (
    <div
      key={index}
      style={{
        ...styles.messageRow,
        justifyContent:
          item.role === 'user' ? 'flex-end' : 'flex-start',
      }}
    >
    <div
  style={
    item.role === 'user'
      ? styles.userBubble
      : styles.assistantBubble
  }
>
  {item.image && (
    <img
      src={item.image}
      alt="Uploaded equipment"
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: 320,
        borderRadius: 12,
        marginBottom: item.text ? 8 : 0,
      }}
    />
  )}

  {item.text && <div>{item.text}</div>}
</div> 
    </div>
  ))}
<div ref={bottomRef} />     
</div>    
      </section>

      {/* Composer area */}
      <div style={styles.composerArea}>
        <div style={styles.composerWrap}>
          {selectedImage && (
            <div style={styles.previewWrap}>
              <img
                src={selectedImage}
                alt="Selected attachment"
                style={styles.previewImage}
              />

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
              placeholder="Ask Tradewise…"
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
              style={styles.voiceButton}
              aria-label="Voice input"
            >
              🎙
            </button>

            <button
              type="button"
              style={{
                ...styles.sendButton,
                opacity:
                  message.trim() || selectedImage
                    ? 1
                    : 0.45,
              }}
              onClick={handleSend}
              aria-label="Send"
            >
              ↑
            </button>
          </div>

          <div style={styles.footerText}>
            Tradewise can make mistakes. Verify important field information.
          </div>
        </div>
      </div>

      {/* Hidden attachment inputs */}
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
    fontFamily:
      'Arial, Helvetica, sans-serif',
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
  padding: '0 22px 150px',
},

  hero: {
    width: '100%',
    maxWidth: 760,
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
  maxWidth: 760,
  margin: '32px auto 0',
  paddingBottom: 24,
},

messageRow: {
  width: '100%',
  display: 'flex',
  marginBottom: 18,
},

userBubble: {
  maxWidth: '78%',
  background: '#e7edf2',
  color: '#172033',
  padding: '12px 16px',
  borderRadius: 18,
  fontSize: 16,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
},

assistantBubble: {
  maxWidth: '88%',
  color: '#172033',
  padding: '4px 2px',
  fontSize: 16,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
},
  composerArea: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    padding: '14px 14px 12px',
    background:
      'linear-gradient(to top, #f7f7f5 72%, rgba(247,247,245,0))',
  },

  composerWrap: {
    width: '100%',
    maxWidth: 820,
    margin: '0 auto',
    position: 'relative',
  },

  composer: {
    minHeight: 62,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 24,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 7,
    padding: '9px',
    boxShadow:
      '0 6px 24px rgba(15,23,42,0.08)',
  },

  plusButton: {
    width: 44,
    height: 44,
    flex: '0 0 44px',
    borderRadius: '50%',
    border: '1px solid #e2e8f0',
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
    padding: '11px 4px 8px',
    fontFamily: 'inherit',
    color: '#171717',
  },

  voiceButton: {
    width: 44,
    height: 44,
    flex: '0 0 44px',
    border: 'none',
    background: 'transparent',
    fontSize: 20,
    cursor: 'pointer',
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
    boxShadow:
      '0 14px 40px rgba(15,23,42,0.16)',
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
    boxShadow:
      '0 5px 20px rgba(15,23,42,0.08)',
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
