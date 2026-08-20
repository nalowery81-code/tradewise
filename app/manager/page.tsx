'use client'

import { useState } from 'react'

export default function ManagerPage() {
  const [message, setMessage] = useState('')

  const starters = [
    'Weekly Summary',
    'Technician Summary',
    'Team Trends',
    'Training Opportunities',
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f7f7f8',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#1f2937',
      }}
    >
      <header
        style={{
          height: 64,
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          fontWeight: 700,
          fontSize: 20,
        }}
      >
        Tradewise
      </header>

      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '90px 20px 150px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            What would you like to know about your team?
          </h1>

          <p
            style={{
              marginTop: 12,
              color: '#6b7280',
              fontSize: 16,
            }}
          >
            Ask Tradewise about technicians, trends, training, or team performance.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
            marginBottom: 28,
          }}
        >
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => setMessage(starter)}
              style={{
                padding: '18px',
                borderRadius: 16,
                border: '1px solid #d1d5db',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              {starter}
            </button>
          ))}
        </div>
      </section>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#f7f7f8',
          padding: '14px 20px 22px',
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
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 16,
              fontFamily: 'inherit',
              padding: '10px 8px',
            }}
          />

          <button
            type="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: '#111827',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </main>
  )
}
