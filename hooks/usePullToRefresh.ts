import { useState, useEffect, useRef } from 'react'

/**
 * usePullToRefresh — detects a swipe-down gesture when the page is
 * already scrolled to the top, then calls `onRefresh`.
 *
 * Returns `refreshing` (boolean) so the caller can show a spinner.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>): boolean {
  const [refreshing, setRefreshing] = useState(false)
  const startY      = useRef(0)
  const refreshRef  = useRef(onRefresh)

  // Keep the ref up-to-date without recreating the event listeners
  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY
    }

    const onTouchEnd = async (e: TouchEvent) => {
      const dy = e.changedTouches[0].clientY - startY.current
      // Require ≥80 px downward drag and page scrolled to the very top
      if (dy > 80 && window.scrollY === 0 && !refreshing) {
        setRefreshing(true)
        try { await refreshRef.current() } finally { setRefreshing(false) }
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run only once

  return refreshing
}
