import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, type InviteInfo, type PublicOrg } from '../api'
import { applyBrand, useAuth } from '../auth'
import { LockIcon } from '../components/Icons'
import { BrandMark, Label, Spinner } from '../components/ui'
import { PRODUCT_MARK_ON_DARK, PRODUCT_NAME, PRODUCT_TAGLINE, rememberedOrg } from '../lib/brand'
import { termsOf } from '../lib/terms'
import { ProviderButtons, SSO_ERRORS } from '../components/ProviderButtons'

/**
 * Split screen. With an organisation that has a photo: photo + dark overlay + its welcome quote
 * (white text). Otherwise a plain slate panel with the product name.
 */
export function AuthLayout({ children, org }: { children: ReactNode; org?: PublicOrg | null }) {
  const photo = org?.welcome.photoUrl
  const name = org?.name ?? PRODUCT_NAME
  return (
    <div className="signin">
      <div className={`signin__photo${photo ? '' : ' signin__photo--plain'}`}>
        {photo && <img className="signin__img" src={photo} alt="" />}
        {photo && <div className="signin__shade" aria-hidden="true" />}
        <div className="signin__content">
          <div className="signin__brand">
            <BrandMark className="signin__logo" logoUrl={org ? org.logoUrl : PRODUCT_MARK_ON_DARK} name={name} size={48} />
            <span className="sb-brand__text">
              <span className="brand brand--light">{name}</span>
              <span className="brand-sub brand-sub--light">{org ? termsOf(org.terms).portal : 'Clinical onboarding for therapy practices'}</span>
            </span>
          </div>
          {org?.welcome.quote ? (
            <figure className="signin__verse">
              <blockquote className="scripture-sm">{org.welcome.quote}</blockquote>
              {org.welcome.ref && <figcaption className="label-on-dark">{org.welcome.ref}</figcaption>}
            </figure>
          ) : (
            <div className="signin__generic">
              <p className="scripture-sm signin__tagline">{PRODUCT_TAGLINE}</p>
              <Link className="signin__demo" to="/demo">Try the live demo&nbsp;&nbsp;→</Link>
            </div>
          )}
        </div>
      </div>
      <main className="signin__side" id="main">
        <div className="signin__form">{children}</div>
      </main>
    </div>
  )
}

/** Loads the organisation named in ?org=, or the last one signed into on this device. */
function useOrg(): PublicOrg | null {
  const [params] = useSearchParams()
  const slug = params.get('org') ?? rememberedOrg()
  const [org, setOrg] = useState<PublicOrg | null>(null)
  useEffect(() => {
    if (!slug) return
    let live = true
    api.org(slug).then((o) => { if (live) setOrg(o) }).catch(() => { /* unknown org: plain panel */ })
    return () => { live = false }
  }, [slug])
  useEffect(() => { if (org) applyBrand(org) }, [org])
  return org
}

function Field({
  label, type = 'text', value, onChange, autoComplete, placeholder, right, minLength, required = true,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  placeholder?: string
  right?: ReactNode
  minLength?: number
  required?: boolean
}) {
  const id = useId()
  return (
    <div className="field">
      <div className="field__head">
        <label htmlFor={id} className="link-slate">
          {label}
        </label>
        {right}
      </div>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
      />
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  return (
    <p className="form-error" role="alert" aria-live="assertive">
      {message}
    </p>
  )
}

export function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const org = useOrg()
  const terms = termsOf(org?.terms)
  const [params] = useSearchParams()
  const ssoError = SSO_ERRORS[params.get('error') ?? ''] ?? null
  const passwordAllowed = org ? org.signIn.password : true

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout org={org}>
      <form onSubmit={submit} className="signin__stack" noValidate={false}>
        <Label>{terms.portal.toUpperCase()}</Label>
        <h1 className="display-md">Welcome back.</h1>
        <p className="body-md">Sign in to your onboarding, lessons and {terms.org} resources.</p>
        {ssoError && <p className="form-error" role="alert">{ssoError}</p>}
        <ProviderButtons
          allowed={org?.signIn}
          params={{ org: org?.slug, next: from !== '/' ? from : undefined }}
          divider={passwordAllowed ? 'or use your email' : undefined}
        />
        {passwordAllowed && (<>
        <div className="signin__fields">
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@work.com" />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="••••••••••"
            right={
              <button type="button" className="btn-ghost-text text-btn" onClick={() => setForgot((f) => !f)} aria-expanded={forgot}>
                Forgot password?
              </button>
            }
          />
          {forgot && (
            <p className="body-xs hint" role="status">
              Ask your {terms.org}’s admin to send you a fresh invite link. It lets you set a new password.
            </p>
          )}
        </div>
        <FormError message={error} />
        <button type="submit" className="btn btn--dark btn--block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        </>)}
        <hr className="rule" />
        <div className="note-box">
          <LockIcon className="icon-deep" />
          <p className="body-xs">
            New here? Use the invite link {org ? `from ${org.name}` : 'you were sent'} to set up your account.
          </p>
        </div>
        <p className="body-xs">
          Onboarding a team of your own? <Link className="inline-link" to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const { adopt } = useAuth()
  const navigate = useNavigate()
  const [practiceName, setPracticeName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 10) {
      setError('Use at least 10 characters for your password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      adopt(await api.signup({ practiceName: practiceName.trim(), name: name.trim(), email: email.trim(), password }))
      navigate('/admin/content', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} className="signin__stack">
        <Label>GET STARTED</Label>
        <h1 className="display-md">Set up your team’s onboarding.</h1>
        <p className="body-md">Create your organisation, add lessons, then invite your new hires.</p>
        <div className="signin__fields">
          <Field label="Organisation name" value={practiceName} onChange={setPracticeName} autoComplete="organization" />
          <Field label="Your name" value={name} onChange={setName} autoComplete="name" />
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} />
          <p className="body-xs">At least 10 characters.</p>
        </div>
        <FormError message={error} />
        <button type="submit" className="btn btn--dark btn--block" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="body-xs">
          Already have an account? <Link className="inline-link" to="/signin">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function InvitePage() {
  const { token = '' } = useParams()
  const { adopt } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api
      .invite(token)
      .then((i) => {
        if (!live) return
        setInfo(i)
        setName(i.name ?? '')
        if (i.org) applyBrand(i.org)
      })
      .catch((e: unknown) => {
        if (!live) return
        setLoadError(
          e instanceof ApiError && e.status === 404
            ? 'This invite link has expired or was already used. Ask whoever invited you for a new one.'
            : e instanceof Error
              ? e.message
              : 'Could not open this invite.',
        )
      })
    return () => {
      live = false
    }
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 10) {
      setError('Use at least 10 characters for your password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      adopt(await api.acceptInvite(token, { name: name.trim(), password }))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invite.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout org={info?.org ?? null}>
      {loadError ? (
        <div className="signin__stack">
          <Label>INVITE</Label>
          <h1 className="display-md">This link no longer works.</h1>
          <p className="body-md" role="alert">
            {loadError}
          </p>
          <Link className="btn btn--ghost" to="/signin">
            Go to sign in
          </Link>
        </div>
      ) : !info ? (
        <Spinner label="Opening your invite" />
      ) : (
        <form onSubmit={submit} className="signin__stack">
          <Label>YOU’RE INVITED</Label>
          <h1 className="display-md">Welcome to {info.practiceName}.</h1>
          <p className="body-md">
            Your account is <strong className="text-slate">{info.email}</strong>. Continue with that work account, or set a password.
          </p>
          <ProviderButtons
            allowed={info.org?.signIn}
            params={{ invite: token }}
            divider={info.org?.signIn.password === false ? undefined : 'or set a password'}
          />
          {info.org?.signIn.password !== false && (<>
          <div className="signin__fields">
            <Field label="Your name" value={name} onChange={setName} autoComplete="name" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} />
            <p className="body-xs">At least 10 characters.</p>
          </div>
          <FormError message={error} />
          <button type="submit" className="btn btn--dark btn--block" disabled={busy}>
            {busy ? 'Setting up…' : 'Create my account'}
          </button>
          </>)}
        </form>
      )}
    </AuthLayout>
  )
}
