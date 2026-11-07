// The public demo's banner, welcome card and tour (Nov 7, Tommy: "the best tour style I've seen is this one", Growth's).
//   • The welcome card says what this is and who you are, with four things to try. It opens when the demo opens; the DEMO pill brings it back.
//   • The tour is one walk through the real pages, a step at a time. It replaces the tips that fired page by page.
//   • Nothing here is saved, on purpose: a refresh starts the demo over. lib/demoRestart.ts swaps the data for a fresh copy.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

type Stop = { path: string | (() => string | null); match?: RegExp; target: string; title: string; body: string }

// Stops that open "the first step" or "the first quiz" read the address off the pages before, and keep it so Back still gets there.
const LINKS = { lesson: 'a[href^="/lesson/"]', step: 'a[href^="/admin/content/step/"]', pool: 'a[href^="/admin/content/quiz/"]' }
const remembered: Record<string, string> = {}
const rememberLinks = () => {
  for (const [k, sel] of Object.entries(LINKS)) {
    const href = document.querySelector(sel)?.getAttribute('href')
    if (href) remembered[k] = href
  }
}
const linkOf = (k: string) => () => { rememberLinks(); return remembered[k] ?? null }
const LESSON = { path: linkOf('lesson'), match: /^\/lesson\/\d+$/ }
const STEP = { path: linkOf('step'), match: /^\/admin\/content\/step\/\d+$/ }
const POOL = { path: linkOf('pool'), match: /^\/admin\/content\/quiz\/\d+$/ }
const PILL = '.demo-pill'

const CLINICIAN: Stop[] = [
  { path: '/', target: '.progress-card', title: 'Your progress', body: 'Every step you finish moves this bar. The sample course has 3 sections and 8 steps.' },
  { path: '/', target: '.path-card', title: 'Section by section', body: 'Later sections stay locked until you pass the quiz at the end of the one before.' },
  { path: '/', target: '.quiz-row', title: 'The section quiz', body: 'It opens when every step above is done, and asks new questions each try.' },
  { ...LESSON, target: '.lesson-col > .video-block, .lesson-col .player', title: 'Video first', body: 'Each step leads with a video the practice records in Loom or uploads.' },
  { ...LESSON, target: '.page-blocks', title: 'Built like a page', body: 'Under the video: the reading, takeaways, links and tools, in the order the practice built them.' },
  { ...LESSON, target: '.quick-check', title: 'A quick check', body: 'Instant feedback on 1 question, so the main point sticks.' },
  { path: '/paperwork', target: '.main h1', title: 'Paperwork', body: 'Agreements to read and sign, kept with the rest of the onboarding.' },
  { path: '/paperwork', target: PILL, title: 'That’s the tour', body: 'Click DEMO anytime for the welcome card or to take the tour again. Refresh and the demo starts over.' },
]
const OWNER: Stop[] = [
  { path: '/admin/content', target: '.co-bar', title: 'The whole onboarding', body: 'Sections, steps, which quizzes are on and which videos are still to record.' },
  { path: '/admin/content', target: '.co-section', title: 'Sections fold up', body: 'Each section is one line. Open one to see its steps and reorder them.' },
  { path: '/admin/content', target: '.co-quiz', title: 'Quizzes between sections', body: 'Every section can end with a quiz that locks the next one until it’s passed.' },
  { ...STEP, target: '.eb-title', title: 'Type right on the page', body: 'This is the step as clinicians see it. Click any text and type.' },
  { ...STEP, target: '.eb-side', title: 'Switches', body: 'Turn the video, quick check and downloads on or off for this step.' },
  { ...POOL, target: '.pool', title: 'The question pool', body: 'Write more questions than each try asks, so a retake gets a fresh set.' },
  { path: '/admin', target: '.table-card', title: 'Your team at a glance', body: 'Where every new clinician is: steps done, checklist, paperwork, last seen.' },
  { path: '/admin', target: '.person-link', title: 'Every answer, every signature', body: 'Open a person to see each quiz try, each agreement they signed, and what’s left.' },
  { path: '/admin', target: PILL, title: 'That’s the tour', body: 'Click DEMO anytime for the welcome card or to take the tour again. Refresh and the demo starts over.' },
]

// Held outside React: every page mounts its own Shell, and the walk has to carry on across them.
let welcomeOpen = false, welcomed = false, step: number | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const openWelcome = () => { welcomed = true; welcomeOpen = true; step = null; emit() }
const closeWelcome = () => { welcomeOpen = false; emit() }
const setStep = (i: number | null) => { step = i; welcomeOpen = false; emit() }

/** The first visible element for a selector list, or null. */
function find(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** While the card is up the keyboard belongs to it: Tab cycles its buttons, Escape closes. */
function trapKeys(card: () => HTMLElement | null, close: () => void, more?: (e: KeyboardEvent) => void) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return }
    more?.(e)
    if (e.key !== 'Tab') return
    const f = [...(card()?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])]
    if (!f.length) return
    e.preventDefault()
    const at = f.indexOf(document.activeElement as HTMLElement)
    f[at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus({ preventScroll: true })
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

export function DemoBar() {
  const { me, adopt, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const owner = me?.role === 'owner'
  const switchRole = async () => {
    setBusy(true)
    try {
      const s = await api.demoSwitch()
      adopt(s)
      navigate(s.me.role === 'owner' ? '/admin/content' : '/')
      openWelcome()
    } catch {
      navigate('/demo')
    } finally {
      setBusy(false)
    }
  }
  const leave = async () => {
    await signOut().catch(() => {})
    navigate('/demo', { replace: true })
  }
  return (
    <div className="demo-bar" role="region" aria-label="Demo">
      <p className="demo-bar__text">
        You’re in <strong>Cedar Grove Counseling</strong>, a sample practice, as the <strong>{owner ? 'practice owner' : 'new clinician'}</strong>.
      </p>
      <div className="demo-bar__actions">
        <button type="button" className="demo-bar__btn demo-bar__btn--main" onClick={() => void switchRole()} disabled={busy}>
          {owner ? 'See it as a new clinician' : 'See it as the owner'}
        </button>
        <button type="button" className="demo-bar__btn" onClick={() => setStep(0)}>Show me around</button>
        <button type="button" className="demo-bar__btn" onClick={() => void leave()}>Leave demo</button>
      </div>
    </div>
  )
}

const TRY_CLINICIAN = [
  { title: 'Start your first step', body: 'A short video, the reading and a quick check', to: '/onboarding' },
  { title: 'Sign the paperwork', body: 'Agreements to read and sign, with a record kept', to: '/paperwork' },
  { title: 'Find a resource', body: 'Forms, guides and links the practice keeps in one place', to: '/resources' },
  { title: 'Meet the team', body: 'Who’s who at the practice', to: '/team' },
]
const TRY_OWNER = [
  { title: 'Edit the onboarding', body: 'Sections, steps and quizzes, edited right on the page', to: '/admin/content' },
  { title: 'See your team', body: 'Where every new clinician is, and every quiz try', to: '/admin' },
  { title: 'Check the videos', body: 'What’s recorded and what’s still to record', to: '/admin/videos' },
  { title: 'Review the paperwork', body: 'Every agreement, and who has signed it', to: '/admin/paperwork' },
]

function WelcomeCard({ owner }: { owner: boolean }) {
  const navigate = useNavigate()
  const open = useSyncExternalStore(subscribe, () => welcomeOpen)
  const card = useRef<HTMLDivElement>(null)
  const start = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    start.current?.focus({ preventScroll: true })
    return trapKeys(() => card.current, closeWelcome)
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="dw-scrim" onClick={closeWelcome}>
      <div ref={card} className="dw" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <span className="dw-pill">Live demo</span>
        <h2 id={titleId}>Welcome to Clinically Ready</h2>
        <p className="dw-lede">Onboarding for therapy practices. New clinicians work through videos, reading, quick checks and quizzes, and the owner sees where everyone is.</p>
        <p className="dw-persona">{owner ? 'You’re the owner of Cedar Grove Counseling' : 'You’re a new clinician at Cedar Grove Counseling'}, a sample practice. Everyone here is made up, and nothing touches a real practice. Refresh anytime to start over.</p>
        <p className="dw-label">Try these</p>
        <ol className="dw-steps">
          {(owner ? TRY_OWNER : TRY_CLINICIAN).map((s, i) => (
            <li key={s.title}>
              <button type="button" className="dw-step" onClick={() => { closeWelcome(); navigate(s.to) }}>
                <span className="dw-num" aria-hidden="true">{i + 1}</span>
                <span className="dw-text"><strong>{s.title}</strong><span>{s.body}</span></span>
                <svg className="dw-chev" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true"><path d="M1.5 1.5 6 6l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </li>
          ))}
        </ol>
        <div className="dw-foot">
          <span className="dw-credit">Designed and engineered by <a href="https://www.tommyclaffey.com" target="_blank" rel="noopener noreferrer">Tommy Claffey</a></span>
          <div className="dw-actions">
            <button type="button" className="tour__btn tour__btn--ghost" onClick={closeWelcome}>Explore on my own</button>
            <button type="button" ref={start} className="tour__btn" onClick={() => setStep(0)}>Take the tour</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Tour({ owner }: { owner: boolean }) {
  const i = useSyncExternalStore(subscribe, () => step)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const stops = owner ? OWNER : CLINICIAN
  const stop = i === null ? null : stops[i] ?? null
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const dir = useRef(1)
  const nextRef = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const end = useCallback(() => setStep(null), [])
  const move = useCallback((by: number) => {
    dir.current = by
    const to = (i ?? 0) + by
    if (to >= stops.length) setStep(null); else if (to >= 0) setStep(to)
  }, [i, stops.length])

  // Get to the stop's page, then wait for its element. Anything that never shows is skipped in the direction you were going.
  useLayoutEffect(() => {
    setEl(null); setRect(null)
    if (!stop) return
    const onPage = stop.match ? stop.match.test(pathname) : pathname === stop.path
    if (!onPage) {
      const to = typeof stop.path === 'function' ? stop.path() : stop.path
      if (to) navigate(to); else move(dir.current)
      return
    }
    const first = find(stop.target)
    if (first) { setEl(first); return }
    let tries = 0
    const timer = setInterval(() => {
      const found = find(stop.target)
      if (found) { clearInterval(timer); setEl(found) }
      else if (++tries > 60) { clearInterval(timer); move(dir.current) } // 3 seconds
    }, 50)
    return () => clearInterval(timer)
  }, [stop, pathname, navigate, move])

  // The page, the box and the card land together in one frame. After that it only moves if the page itself does.
  useLayoutEffect(() => {
    if (!el || !stop) return
    el.style.scrollMarginTop = '24px'
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
    el.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior })
    setRect(el.getBoundingClientRect())
    rememberLinks()
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (el.isConnected) setRect(el.getBoundingClientRect()); else setEl(find(stop.target)) })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(document.documentElement); ro.observe(el)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure) }
  }, [el, stop])

  const shown = !!stop && !!rect
  useEffect(() => { if (shown) nextRef.current?.focus({ preventScroll: true }) }, [shown, i])
  useEffect(() => {
    if (!shown) return
    return trapKeys(() => card.current, end, (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
    })
  }, [shown, end, move])

  if (i === null || !stop) return null
  if (!rect) return createPortal(<div className="tour"><div className="tour__block" /><div className="tour__dim" /></div>, document.body)

  const vw = window.innerWidth, vh = window.innerHeight, pad = 8
  const top = Math.max(rect.top - pad, 4)
  const hl = { top, left: Math.max(rect.left - pad, 4), width: Math.min(rect.width + pad * 2, vw - 8), height: Math.max(Math.min(rect.bottom + pad, vh - 4) - top, 0) }
  const narrow = vw < 640, cardW = 340
  const below = vh - (hl.top + hl.height) > 260
  const fills = !below && hl.top < 280 // a target that fills the screen: the card sits on top of it, never off the top
  const style: React.CSSProperties = narrow ? {} : {
    top: below ? hl.top + hl.height + 12 : fills ? vh - 24 : Math.max(12, hl.top - 12),
    left: Math.min(Math.max(12, hl.left), vw - cardW - 12),
    transform: below ? undefined : 'translateY(-100%)',
    width: cardW,
  }
  return createPortal(
    <div className="tour">
      <div className="tour__block" />
      <div className="tour__hl" style={hl} aria-hidden="true" />
      <div ref={card} className={`tour__card ${narrow ? 'tour__card--sheet' : ''}`} style={style} role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <p className="tour__count">Step {i + 1} of {stops.length}</p>
        <h2 id={titleId} className="tour__title">{stop.title}</h2>
        <p className="tour__body">{stop.body}</p>
        <div className="tour__dots" aria-hidden="true">
          {stops.map((_, n) => <span key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />)}
        </div>
        <div className="tour__actions">
          <button type="button" className="tour__skip" onClick={end}>End tour</button>
          <span className="tour__nav">
            {i > 0 && <button type="button" className="tour__btn tour__btn--ghost" onClick={() => move(-1)}>Back</button>}
            <button type="button" ref={nextRef} className="tour__btn" onClick={() => move(1)}>{i < stops.length - 1 ? 'Next' : 'Finish'}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DemoTour() {
  const { me } = useAuth()
  const owner = me?.role === 'owner'
  useEffect(() => { if (!welcomed) openWelcome() }, [])
  return <><WelcomeCard owner={owner} /><Tour owner={owner} /></>
}
