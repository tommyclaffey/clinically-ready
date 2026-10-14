import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PRODUCT_NAME, rememberOrg } from './lib/brand'
import { api, ApiError, setUnauthorizedHandler, type Me, type Practice, type Role, type Session } from './api'
import { hexToRgba, isHexColor } from './lib/contrast'
import { FullPageLoading, FullPageError } from './components/ui'

type Status = 'loading' | 'authed' | 'anon' | 'error'

interface AuthValue {
  status: Status
  me: Me | null
  practice: Practice | null
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  adopt: (s: Session) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Writes the organisation's brand colour into --blue-deep (and the ghost border derived from it). */
export function applyBrand(practice: Pick<Practice, 'brandColor' | 'name' | 'terms'> | null) {
  const root = document.documentElement
  const c = practice?.brandColor
  if (c && isHexColor(c)) {
    root.style.setProperty('--blue-deep', c)
    root.style.setProperty('--border-ghost', hexToRgba(c, 0.55))
  } else {
    root.style.removeProperty('--blue-deep')
    root.style.removeProperty('--border-ghost')
  }
  const portal = practice?.terms?.portal ?? 'Team portal'
  document.title = practice?.name ? `${practice.name} · ${portal}` : PRODUCT_NAME
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [error, setError] = useState<string | null>(null)

  const adopt = useCallback((s: Session) => {
    if (!s.practice.isDemo) rememberOrg(s.practice.slug) // a demo copy is deleted within a day
    setMe(s.me)
    setPractice(s.practice)
    setStatus('authed')
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setMe(null)
    setPractice(null)
    setStatus('anon')
  }, [])

  const refresh = useCallback(async () => {
    try {
      adopt(await api.me())
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clear()
      else {
        setError(e instanceof Error ? e.message : 'Could not load your account.')
        setStatus('error')
      }
    }
  }, [adopt, clear])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    return () => setUnauthorizedHandler(null)
  }, [clear])

  useEffect(() => {
    applyBrand(practice)
  }, [practice])

  const signIn = useCallback(
    async (email: string, password: string) => {
      adopt(await api.login(email, password))
    },
    [adopt],
  )

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      clear()
    }
  }, [clear])

  const value = useMemo<AuthValue>(
    () => ({ status, me, practice, error, signIn, signOut, adopt, refresh }),
    [status, me, practice, error, signIn, signOut, adopt, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}

export const isAdminRole = (r: Role | undefined) => r === 'owner' || r === 'admin'

/** Gate for signed-in routes. `roles` narrows to specific roles (admin screens). */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { status, me, error, refresh } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageLoading />
  if (status === 'error') return <FullPageError message={error ?? 'Something went wrong.'} onRetry={() => void refresh()} />
  if (status === 'anon' || !me) {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  }
  if (roles && !roles.includes(me.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Public-only routes (sign in/up): signed-in users go home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <FullPageLoading />
  if (status === 'authed') return <Navigate to="/" replace />
  return <>{children}</>
}
