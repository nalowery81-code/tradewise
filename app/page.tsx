'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Reflection = {
  technician_name: string
  job_type: string
  challenge: string
  frustration: string
  went_well: string
  created_at?: string
}

export default function Home() {
  const [technicianName, setTechnicianName] = useState('')
  const [jobType, setJobType] = useState('Service Call')
  const [challenge, setChallenge] = useState('')
  const [frustration, setFrustration] = useState('')
  const [wentWell, setWentWell] = useState('')
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [loading, setLoading] = useState(false)

  const generateInsight = (reflection: Reflection) => {
    const text = `${reflection.challenge} ${reflection.frustration}`.toLowerCase()

    if (text.includes('confused') || text.includes('unsure')) {
      return 'Technician may need additional training or clarification.'
    }

    if (text.includes('long') || text.includes('took too long')) {
      return 'Job efficiency could be improved.'
    }

    if (text.includes('customer') && text.includes('frustrated')) {
      return 'Customer communication may need support.'
    }

    if (reflection.went_well.length > 20) {
      return 'Strong reflection and awareness shown — good growth mindset.'
    }

    return 'No major issues detected. Keep up the good work.'
  }

  const fetchReflections = async () => {
    const { data, error } = await supabase
      .from('Reflections')
      .select('*')

    if (error) {
      alert(`Fetch error: ${error.message}`)
      console.error(error)
      return
    }

    setReflections(data || [])
  }

  useEffect(() => {
    fetchReflections()
  }, [])

  const handleSubmit = async () => {
    if (!technicianName.trim()) {
      alert('Please enter technician name')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.from('Reflections').insert([
        {
          technician_name: technicianName,
          job_type: jobType,
          challenge,
          frustration,
          went_well: wentWell,
        },
      ])

      if (error) {
        alert(`Supabase error: ${error.message}`)
        console.error(error)
        return
      }

      alert('Saved successfully!')

      setTechnicianName('')
      setJobType('Service Call')
      setChallenge('')
      setFrustration('')
      setWentWell('')
      fetchReflections()
    } catch (err: any) {
      alert(`Catch error: ${err?.message || 'Unknown error'}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        TradeWise Reflection
      </h1>

      <input
        type="text"
        placeholder="Technician Name"
        value={technicianName}
        onChange={(e) => setTechnicianName(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          marginBottom: '16px',
          border: '1px solid #ccc',
          borderRadius: '6px',
        }}
      />

      <select
        value={jobType}
        onChange={(e) => setJobType(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          marginBottom: '16px',
          border: '1px solid #ccc',
          borderRadius: '6px',
        }}
      >
        <option value="Service Call">Service Call</option>
        <option value="Install">Install</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Inspection">Inspection</option>
        <option value="Callback">Callback</option>
      </select>

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
        disabled={loading}
        style={{
          padding: '12px 20px',
          backgroundColor: 'blue',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          marginBottom: '32px',
        }}
      >
        {loading ? 'Saving...' : 'Submit'}
      </button>

      <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>
        Saved Reflections
      </h2>

      {reflections.length === 0 ? (
        <p>No reflections saved yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {reflections.map((reflection, index) => (
            <div
              key={index}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <p><strong>Technician:</strong> {reflection.technician_name}</p>
              <p><strong>Job Type:</strong> {reflection.job_type}</p>
              <p><strong>Challenge:</strong> {reflection.challenge}</p>
              <p><strong>Frustration:</strong> {reflection.frustration}</p>
              <p><strong>Went Well:</strong> {reflection.went_well}</p>

              <p style={{ marginTop: '10px', color: 'green' }}>
                <strong>Insight:</strong> {generateInsight(reflection)}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
