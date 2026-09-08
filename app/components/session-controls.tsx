'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SessionControls() {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  if (!pathname.startsWith('/platform-admin')) return null

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={signingOut}
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 500,
        border: '1px solid #cbd5e1',
        borderRadius: 9,
        padding: '9px 12px',
        background: '#ffffff',
        color: '#172033',
        fontSize: 13,
        fontWeight: 800,
        cursor: signingOut ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
        opacity: signingOut ? 0.65 : 1,
      }}
    >
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
