'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type FeedbackRequest = {
  id: string
  question: string
  created_at: string
}

export default function FeedbackRequestPrompt() {
  const [request, setRequest] = useState<FeedbackRequest | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return

      const response = await fetch('/api/feedback', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) return
      const data = await response.json().catch(() => ({}))
      setRequest(data.request || null)
    }

    void load()
  }, [])

  const submit = async (rating: 'helpful' | 'mixed' | 'not_helpful') => {
    if (!request || sending) return
    setSending(true)
    setStatus('')

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: request.id, rating, responseText: comment }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStatus(data.error || 'Could not save feedback.')
        return
      }

      setStatus('Thanks — your feedback was sent.')
      setTimeout(() => setRequest(null), 900)
    } catch {
      setStatus('Could not save feedback.')
    } finally {
      setSending(false)
    }
  }

  if (!request) return null

  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: '.08em', textTransform: 'uppercase', color: '#64748b' }}>
          CraftCompass feedback
        </div>
        <h2 style={{ margin: '7px 0 8px', fontSize: 21, color: '#172033' }}>Quick question</h2>
        <p style={{ margin: 0, lineHeight: 1.55, color: '#334155' }}>{request.question}</p>

        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional: tell us what worked or what should be better."
          rows={3}
          style={textareaStyle}
        />

        {status && <div style={{ marginTop: 9, fontSize: 12, color: status.startsWith('Thanks') ? '#166534' : '#991b1b' }}>{status}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button disabled={sending} onClick={() => void submit('helpful')} style={buttonStyle}>Helpful</button>
          <button disabled={sending} onClick={() => void submit('mixed')} style={buttonStyle}>Partly helpful</button>
          <button disabled={sending} onClick={() => void submit('not_helpful')} style={buttonStyle}>Not helpful</button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(15,23,42,.42)',
}

const cardStyle: React.CSSProperties = {
  width: 'min(520px, 100%)',
  boxSizing: 'border-box',
  borderRadius: 18,
  padding: 22,
  background: '#fff',
  boxShadow: '0 24px 70px rgba(15,23,42,.25)',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 14,
  padding: 11,
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  resize: 'vertical',
  fontSize: 13,
  fontFamily: 'inherit',
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '9px 11px',
  background: '#fff',
  color: '#172033',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}
