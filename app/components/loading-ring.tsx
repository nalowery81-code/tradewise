'use client'

import { useEffect, useMemo, useState } from 'react'

export default function LoadingRing({ size = 42 }: { size?: number }) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = performance.now()

    const update = () => setElapsedMs(performance.now() - startedAt)
    update()

    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const progress = useMemo(() => (elapsedMs % 8000) / 8000, [elapsedMs])
  const angle = Math.round(progress * 360)
  const innerSize = Math.max(24, size - 8)

  return (
    <div
      aria-label={`Working for ${elapsedSeconds} seconds`}
      role="status"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        background: `conic-gradient(var(--cc-craft-cyan) 0deg ${angle}deg, rgba(8,43,77,0.12) ${angle}deg 360deg)`,
        boxShadow: 'var(--cc-shadow-soft)',
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: '#ffffff',
          border: '1px solid rgba(8,43,77,0.10)',
          color: 'var(--cc-deep-navy)',
          fontSize: 10,
          lineHeight: 1,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {elapsedSeconds}s
      </div>
    </div>
  )
}
