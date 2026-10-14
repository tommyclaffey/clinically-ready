// Your account: how you sign in. Connect Google or Microsoft so you can stop using a password.
import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Provider } from '../api'
import { SSO_ERRORS, startUrl } from '../components/ProviderButtons'
import { TopBar } from '../components/Shell'
import { ErrorState, PageHead, Spinner } from '../components/ui'
import { relativeDate } from '../lib/format'
import { useApi } from '../lib/useApi'

const NAME: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft' }
const LOGO: Record<Provider, string> = { google: '/brand/google-g.svg', microsoft: '/brand/microsoft.svg' }

export function AccountPage() {
  const { data, error, loading, reload } = useApi(() => api.account())
  const [params] = useSearchParams()
  const connected = params.get('connected') as Provider | null
  const linkError = SSO_ERRORS[params.get('error') ?? ''] ?? null
  const [busy, setBusy] = useState<Provider | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const disconnect = async (p: Provider) => {
    setBusy(p)
    setActionError(null)
    try {
      await api.disconnect(p)
      reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not disconnect.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <TopBar />
      <PageHead label="YOUR ACCOUNT" title="How you sign in">
        Connect your work Google or Microsoft account and you won’t need a password. If you leave, your
        organisation turns off that account and access ends with it.
      </PageHead>
      {loading && !data ? (
        <Spinner label="Loading your account" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <section className="card form-card stack-18" aria-labelledby="signin-title">
          <h2 id="signin-title" className="card-serif">Sign-in methods</h2>
          <p className="body-sm">Signed in as <span className="text-slate">{data.email}</span></p>
          {connected && <p className="meta" role="status">{NAME[connected] ?? 'Account'} connected.</p>}
          {(linkError || actionError) && <p className="form-error" role="alert">{actionError ?? linkError}</p>}
          <ul className="method-list">
            {(['google', 'microsoft'] as Provider[])
              .filter((p) => data.available[p] && data.allowed[p])
              .map((p) => {
                const id = data.identities.find((i) => i.provider === p)
                return (
                  <li key={p} className="method-row">
                    <img src={LOGO[p]} alt="" width={20} height={20} />
                    <div className="method-row__text">
                      <p className="row-title">{NAME[p]}</p>
                      <p className="body-xs">{id ? `${id.email || 'Connected'} · connected ${relativeDate(id.connectedAt)}` : 'Not connected'}</p>
                    </div>
                    {id ? (
                      <button type="button" className="btn btn--ghost btn--small" disabled={busy === p} onClick={() => disconnect(p)}>
                        {busy === p ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <a className="btn btn--dark btn--small" href={startUrl(p, { link: '1' })}>Connect</a>
                    )}
                  </li>
                )
              })}
            <PasswordRow allowed={data.allowed.password} hasPassword={data.hasPassword} onSaved={reload} />
          </ul>
          {!data.available.google && !data.available.microsoft && (
            <p className="body-xs">Google and Microsoft sign-in aren’t switched on for this app yet.</p>
          )}
        </section>
      ) : null}
    </>
  )
}

const MIN = 10

/** The password row: shows whether one is set, and opens a small form to change (or first set) it. */
function PasswordRow({ allowed, hasPassword, onSaved }: { allowed: boolean; hasPassword: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const id = useId()

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`)
    if (next !== confirm) return setError('The two new passwords don’t match.')
    setBusy(true)
    try {
      await api.changePassword({ current: hasPassword ? current : undefined, next })
      reset()
      setOpen(false)
      setDone(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="method-row method-row--wrap">
      <span className="method-row__icon" aria-hidden="true">••</span>
      <div className="method-row__text">
        <p className="row-title">Password</p>
        <p className="body-xs">
          {!allowed ? 'Your organisation has turned passwords off.' : hasPassword ? 'Set' : 'Not set: you sign in with a connected account.'}
        </p>
        {done && <p className="meta" role="status">Password updated. Your other devices have been signed out.</p>}
      </div>
      {allowed && !open && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => { setOpen(true); setDone(false) }}>
          {hasPassword ? 'Change' : 'Set a password'}
        </button>
      )}
      {allowed && open && (
        <form className="pw-form stack-18" onSubmit={submit} aria-label={hasPassword ? 'Change password' : 'Set a password'}>
          {hasPassword && (
            <div className="field">
              <label htmlFor={`${id}-cur`} className="link-slate">Current password</label>
              <input id={`${id}-cur`} className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-new`} className="link-slate">New password</label>
            <input id={`${id}-new`} className="input" type="password" autoComplete="new-password" required minLength={MIN} value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="body-xs">At least {MIN} characters. A short phrase is easiest to remember.</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-conf`} className="link-slate">Type it again</label>
            <input id={`${id}-conf`} className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="pw-form__btns">
            <button type="submit" className="btn btn--dark btn--small" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            <button type="button" className="btn-ghost-text text-btn" onClick={() => { reset(); setOpen(false) }}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  )
}
