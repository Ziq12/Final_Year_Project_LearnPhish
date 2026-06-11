/**
 * useAnimatedChecklist.js
 * Staggered reveal: 40ms per item, giving educational rhythm without lag.
 */
import { useState, useEffect, useRef } from 'react'
import useScanStore from '../store/useScanStore'

const STAGGER_MS = 40

export function useAnimatedChecklist(groups) {
  const status      = useScanStore(s => s.status)
  const setComplete = useScanStore(s => s.setComplete)
  const [revealed, setRevealed] = useState(new Set())
  const timerRef = useRef([])

  useEffect(() => {
    // Clear any pending timers
    timerRef.current.forEach(clearTimeout)
    timerRef.current = []

    if (status === 'scanning') {
      setRevealed(new Set())
      return
    }

    if (status === 'revealing' && groups?.length) {
      const allItems = groups.flatMap(g => g.items.map(i => i.id))

      allItems.forEach((id, idx) => {
        const t = setTimeout(() => {
          setRevealed(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
          })
          // Call setComplete after the last item
          if (idx === allItems.length - 1) {
            setTimeout(setComplete, 50)
          }
        }, idx * STAGGER_MS)
        timerRef.current.push(t)
      })
    }

    return () => timerRef.current.forEach(clearTimeout)
  }, [status, groups?.length]) // eslint-disable-line

  return revealed
}
