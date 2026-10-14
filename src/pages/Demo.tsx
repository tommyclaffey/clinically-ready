// The public demo page: pick a role, get your own copy of a sample practice, and look around. No sign-up.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { applyBrand, useAuth } from '../auth'
import { CheckIcon } from '../components/Icons'
import { PRODUCT_NAME } from '../lib/brand'

const ROLES = [
  {
    as: 'clinician' as const,
    title: 'Try it as a new clinician',
    kicker: 'THE CLINICIAN’S VIEW',
    points: ['Watch a short video step', 'Answer a quick check', 'Reach the quiz that unlocks the next section'],
    cta: 'Start as a clinician',
  },
  {
    as: 'owner' as const,
    title: 'Try it as the practice owner',
    kicker: 'THE OWNER’S VIEW',
    points: ['See where your team is and every quiz try', 'Edit a step right on the page', 'Build a quiz pool and set the pass mark'],
    cta: 'Start as the owner',
  },
]

export function DemoPage() {
  const { status, practice, adopt } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inDemo = status === 'authed' && practice?.isDemo

  useEffect(() => {
    if (!inDemo) applyBrand(null)
    document.title = `Live demo · ${PRODUCT_NAME}`
  }, [inDemo])

  const start = async (as: 'clinician' | 'owner') => {
    setBusy(as)
    setError(null)
    try {
      const s = await api.demoStart(as)
      adopt(s)
      navigate(as === 'owner' ? '/admin/content' : '/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the demo.')
      setBusy(null)
    }
  }

  return (
    <div className="demo-page">
      <header className="demo-top">
        <span className="demo-wordmark">{PRODUCT_NAME}</span>
        <Link className="link-slate" to="/signin">Sign in</Link>
      </header>

      <main className="demo-main" id="main">
        <section className="demo-hero" aria-labelledby="demo-title">
          <p className="label"><span className="label__dot" aria-hidden="true" />LIVE DEMO</p>
          <h1 id="demo-title" className="display-lg">Clinical onboarding that gets new clinicians ready for their first client.</h1>
          <p className="body-md demo-hero__body">
            Short video steps, the reading, quick checks, and a quiz at the end of each section that unlocks the next one. Built for therapy practices, edited right on the page.
          </p>
        </section>

        {inDemo && (
          <section className="card demo-continue" aria-label="Your demo">
            <p className="body-md">You already have a demo open.</p>
            <Link className="btn btn--dark" to="/">Continue your demo&nbsp;&nbsp;→</Link>
          </section>
        )}

        <div className="demo-roles">
          {ROLES.map((r) => (
            <section key={r.as} className="card demo-role" aria-labelledby={`role-${r.as}`}>
              <p className="label-muted">{r.kicker}</p>
              <h2 id={`role-${r.as}`} className="display-sm">{r.title}</h2>
              <ul className="demo-role__points">
                {r.points.map((p) => (
                  <li key={p}><span className="demo-role__tick" aria-hidden="true"><CheckIcon size={12} /></span><span className="body-sm-dark">{p}</span></li>
                ))}
              </ul>
              <button type="button" className="btn btn--dark demo-role__btn" onClick={() => void start(r.as)} disabled={busy !== null}>
                {busy === r.as ? 'Setting up your copy…' : r.cta}&nbsp;&nbsp;→
              </button>
            </section>
          ))}
        </div>
        {error && <p className="form-error demo-error" role="alert">{error}</p>}

        <p className="body-sm demo-note">
          Cedar Grove Counseling is a made-up practice. Your copy is just for you, and it’s deleted after 24 hours. A short walkthrough shows you around, and you can switch between the 2 views at any time. Uploads, invites and settings are turned off.
        </p>
      </main>
    </div>
  )
}
