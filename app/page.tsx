'use client'

import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const [challenge, setChallenge] = useState('')
  const [frustration, setFrustration] = useState('')
  const [wentWell, setWentWell] = useState('')

  const handleSubmit = async () => {
  try {
    const { data, error } = await supabase.from('Reflections').insert([
      {
        technician_name: 'Test Technician',
        job_type: 'Service Call',
        challenge: challenge,
        frustration: frustration,
        went_well: wentWell,
      },
    ])

    if (error) {
      alert(`Supabase error: ${error.message}`)
      console.log('SUPABASE ERROR MESSAGE:', error.message)
      console.log('SUPABASE ERROR DETAILS:', error.details)
      console.log('SUPABASE ERROR HINT:', error.hint)
      console.log('SUPABASE ERROR CODE:', error.code)
      console.log('FULL ERROR:', JSON.stringify(error, null, 2))
      return
    }

    alert('Saved successfully!')
    console.log('Saved row:', data)
    setChallenge('')
    setFrustration('')
    setWentWell('')
  } catch (err: any) {
    alert(`Catch error: ${err?.message || 'Unknown error'}`)
    console.log('CATCH ERROR:', err)
  }
}

  return (
    <main style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        TradeWise Reflection
      </h1>

      <textarea
        placeholder="What was challenging?"
        value={challenge}
        onChange={(e) => setChallenge(e.target.value)}
        style={{ width: '100%', minHeight: '100px', marginBottom: '16px' }}
      />

      <textarea
        placeholder="Anything frustrating or uncomfortable?"
        value={frustration}
        onChange={(e) => setFrustration(e.target.value)}
        style={{ width: '100%', minHeight: '100px', marginBottom: '16px' }}
      />

      <textarea
        placeholder="What went well?"
        value={wentWell}
        onChange={(e) => setWentWell(e.target.value)}
        style={{ width: '100%', minHeight: '100px', marginBottom: '16px' }}
      />

      <button
        onClick={handleSubmit}
        style={{
          padding: '12px 20px',
          backgroundColor: 'blue',
          color: 'white',
          border: 'none',
        }}
      >
        Submit
      </button>
    </main>
  )
}