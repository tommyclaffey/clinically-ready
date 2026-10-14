import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

export interface ApiState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  setData: Dispatch<SetStateAction<T | null>>
}

/** Runs `fn` on mount and whenever `deps` change. Ignores stale responses. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => {
        if (live) setData(d)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Something went wrong.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [tick, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
