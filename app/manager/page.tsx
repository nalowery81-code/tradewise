'use client'

import { useEffect, useState } from 'react'

export default function ManagerPage() {
  const [message, setMessage] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedHistoryCategory, setSelectedHistoryCategory] = useState<string | null>(null)
  
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
  const handleNewChat = () => {
  setMessage('')
  setSidebarOpen(false)
  }
  const sidebarItems = [
    'New chat',
    'Search',
    'History',
    'To-Do',
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
    display: sidebarOpen ? 'block' : 'none',
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
  <div
    style={{
      fontWeight: 700,
      fontSize: 18,
    }}
  >
    Tradewise Manager
  </div>

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
</div> 
        
<div style={{ display: 'grid', gap: 6 }}>
 {sidebarItems.map((item) => (
  <div key={item}>
    <button
      type="button"
      onClick={() => {
        if (item === 'New chat') handleNewChat()
        if (item === 'History') setHistoryOpen(!historyOpen)
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
      <div
        style={{
          display: 'grid',
          gap: 4,
          margin: '4px 0 8px 12px',
        }}
      >
        {historyCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedHistoryCategory(category)}
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
  onClick={() => setSidebarOpen(!sidebarOpen)}
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
          padding: 'clamp(40px, 8vw, 90px) 16px 150px', 
          transform: isDesktop && sidebarOpen ? 'translateX(139px)' : 'none',
        }}
      >
        {selectedHistoryCategory ? (
        <div
  style={{
    maxWidth: 760,
    margin: '0 auto',
    width: '100%',
  }}
>
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
  <h1
    style={{
      margin: 0,
      fontSize: 'clamp(28px, 4vw, 38px)',
      fontWeight: 700,
    }}
  >
    {selectedHistoryCategory}
  </h1>

  <p
    style={{
      marginTop: 10,
      color: '#6b7280',
      fontSize: 15,
      lineHeight: 1.6,
    }}
  >
    Conversations and insights related to this area will appear here.
  </p>

  <div
  style={{
    marginTop: 32,
    display: 'grid',
    gap: 12,
  }}
>
  <button
    type="button"
    style={{
      width: '100%',
      textAlign: 'left',
      border: '1px solid #e5e7eb',
      borderRadius: 16,
      padding: '18px 20px',
      background: '#ffffff',
      cursor: 'pointer',
    }}
  >
    <div
      style={{
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
     Coaching follow-up: customer communication
    </div>

    <div
      style={{
        fontSize: 14,
        color: '#6b7280',
        lineHeight: 1.5,
      }}
    >
      Discussed a recurring communication issue and identified a coaching opportunity for the team.
    </div>

    <div
      style={{
        marginTop: 12,
        fontSize: 12,
        color: '#9ca3af',
      }}
    >
     <div
  style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  }}
>
  <span
    style={{
      fontSize: 12,
      color: '#4b5563',
      background: '#f3f4f6',
      borderRadius: 999,
      padding: '5px 9px',
    }}
  >
    Technician: Mike R.
  </span>

  <span
    style={{
      fontSize: 12,
      color: '#4b5563',
      background: '#f3f4f6',
      borderRadius: 999,
      padding: '5px 9px',
    }}
  >
    Communication
  </span>
</div> 
      August 21, 2026
    </div>
  </button>
</div>
</div> 
        ) : (
          <>
                  <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 5vw, 30px)',
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
          </>
        )}
      </section>  

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          paddingLeft: isDesktop && sidebarOpen ? 278 : 0,
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
