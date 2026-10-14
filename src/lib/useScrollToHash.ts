import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** After data loads, scroll to #q-12 style anchors (client-side navigation doesn't do it for us). */
export function useScrollToHash(ready: boolean) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [ready, hash])
}
