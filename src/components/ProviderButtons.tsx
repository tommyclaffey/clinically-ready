// "Continue with Google / Microsoft". Full-page links (not fetch): the provider's page has to load in the tab.
// Logos are the official files in /public/brand — never recoloured or redrawn.
import { useEffect, useState } from 'react'
import { api, type Provider, type SignInMethods } from '../api'

const LABEL: Record<Provider, string> = { google: 'Continue with Google', microsoft: 'Sign in with Microsoft' }
const LOGO: Record<Provider, string> = { google: '/brand/google-g.svg', microsoft: '/brand/microsoft.svg' }

/** Which providers the server has credentials for (cached for the page's life). */
let cache: Promise<Record<Provider, boolean>> | null = null
export function useProviders() {
  const [p, setP] = useState<Record<Provider, boolean> | null>(null)
  useEffect(() => {
    let live = true
    cache ??= api.providers().catch(() => ({ google: false, microsoft: false }))
    void cache.then((v) => { if (live) setP(v) })
    return () => { live = false }
  }, [])
  return p
}

export function startUrl(provider: Provider, params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return `/api/auth/oauth/${provider}/start${s ? `?${s}` : ''}`
}

export function ProviderButtons({ allowed, params = {}, divider }: { allowed?: SignInMethods | null; params?: Record<string, string | undefined>; divider?: string }) {
  const configured = useProviders()
  if (!configured) return null
  const list = (['google', 'microsoft'] as Provider[]).filter((p) => configured[p] && (allowed ? allowed[p] : true))
  if (!list.length) return null
  return (
    <div className="sso">
      {list.map((p) => (
        <a key={p} className="sso__btn" href={startUrl(p, params)}>
          <img src={LOGO[p]} alt="" width={20} height={20} />
          <span>{LABEL[p]}</span>
        </a>
      ))}
      {divider && <p className="or-rule">{divider}</p>}
    </div>
  )
}

/** Plain-English reasons for ?error= on the sign-in page. */
export const SSO_ERRORS: Record<string, string> = {
  state: 'That sign-in took too long or was opened in another browser. Please try again.',
  cancelled: 'Sign-in was cancelled.',
  provider: 'We couldn’t confirm that account. Please try again.',
  email_mismatch: 'That account’s email doesn’t match your invite. Use the work account your invite was sent to.',
  unverified: 'That Google account’s email isn’t verified yet.',
  no_account: 'There’s no account for that login yet. Ask your organisation for an invite, then use its link.',
  not_allowed: 'Your organisation doesn’t use that way of signing in.',
  inactive: 'Your access has been turned off. Contact your organisation’s admin.',
  invite: 'That invite has expired or was already used. Ask for a new one.',
  exists: 'That email already has an account. Sign in instead.',
  taken: 'That account is already connected to someone else.',
}
