'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ReturnToPlatformAdminPage() {
  const [message, setMessage] = useState('Returning to Platform Admin…')

  useEffect(() => {
    const clearWorkspace = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        window.location.replace('/login')
        return
      }

      const response = await fetch('/api/platform-admin/workspace', {
        method: 'DELETE',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) {
        setMessage('Could not exit the demo workspace. Please sign out and back in.')
        return
      }

      window.location.replace('/platform-admin')
    }

    void clearWorkspace()
  }, [])

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: '#f7f7f8',
      color: '#172033',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 700,
    }}>
      {message}
    </main>
  )
}
