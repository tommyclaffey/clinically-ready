// The public demo's banner and walkthrough. The banner says what you're looking at and lets you switch between
// the practice owner and a new clinician. The walkthrough shows a few tips the first time you open each key page.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

type Tip = { target: string; title: string; body: string }
type Tour = { key: string; role: 'owner' | 'clinician'; match: RegExp; tips: Tip[] }

const TOURS: Tour[] = [
  {
    key: 'home', role: 'clinician', match: /^\/$/,
    tips: [
      { target: '.progress-card', title: 'Your progress', body: 'Every step you finish moves this bar. The sample course has 3 sections and 8 steps.' },
      { target: '.continue, .quiz-due', title: 'Pick up where you left off', body: 'Every step starts with a short video, then the reading and a quick check.' },
      { target: '.path-card', title: 'Section by section', body: 'Later sections stay locked until you pass the quiz at the end of the one before.' },
      { target: '.quiz-row', title: 'The section quiz', body: 'It opens when every step above is done, and asks new questions each try.' },
    ],
  },
  {
    key: 'lesson', role: 'clinician', match: /^\/lesson\/\d+$/,
    tips: [
      { target: '.lesson-col > .video-block, .lesson-col .player', title: 'Video first', body: 'Each step leads with a video the practice records in Loom or uploads. This one is a short sample.' },
      { target: '.page-blocks', title: 'Built like a page', body: 'Under the video: the reading, takeaways, links and tools, in the order the practice built them.' },
      { target: '.quick-check', title: 'A quick check', body: 'Instant feedback on 1 question, so the main point sticks.' },
      { target: '.lesson-nav__next', title: 'Move on', body: 'Mark it complete to go to the next step. Finish the section to open its quiz.' },
    ],
  },
  {
    key: 'quiz', role: 'clinician', match: /^\/quiz\/\d+$/,
    tips: [
      { target: '.sq-facts', title: 'How the quiz works', body: 'Each try draws a few questions from a bigger pool, with the answers shuffled.' },
      { target: '.sq-actions', title: 'Pass to move on', body: 'Pass it and the next section opens. Fail it and you get a new set of questions.' },
    ],
  },
  {
    key: 'team', role: 'owner', match: /^\/admin$/,
    tips: [
      { target: '.table-card', title: 'Your team at a glance', body: 'Where every new clinician is: steps done, checklist, paperwork, last seen.' },
      { target: '.person-link', title: 'Every answer, every signature', body: 'Open a person to see each quiz try, each agreement they signed, and what’s left.' },
    ],
  },
  {
    key: 'content', role: 'owner', match: /^\/admin\/content$/,
    tips: [
      { target: '.co-bar', title: 'The whole onboarding', body: 'Sections, steps, which quizzes are on and which videos are still to record.' },
      { target: '.co-section', title: 'Sections fold up', body: 'Each section is one line. Open one to see its steps and reorder them.' },
      { target: '.co-quiz', title: 'Quizzes between sections', body: 'Every section can end with a quiz that locks the next one until it’s passed.' },
      { target: '.co-step__main', title: 'Edit on the page', body: 'Open a step to edit it exactly as your clinicians see it.' },
    ],
  },
  {
    key: 'step', role: 'owner', match: /^\/admin\/content\/step\/\d+$/,
    tips: [
      { target: '.eb-title', title: 'Type right on the page', body: 'This is the step as clinicians see it. Click any text and type.' },
      { target: '.eb-page > .eb-insert:last-child', title: 'Add anything', body: 'Hover between blocks and press +: text, lists, video, links, paperwork, a tool or a quiz.' },
      { target: '.eb-side', title: 'Switches', body: 'Turn the video, quick check and downloads on or off for this step.' },
      { target: '.save-bar', title: 'Save when ready', body: 'Nothing changes for clinicians until you save. ⌘S works too.' },
    ],
  },
  {
    key: 'pool', role: 'owner', match: /^\/admin\/content\/quiz\/\d+$/,
    tips: [
      { target: '.pool', title: 'The question pool', body: 'Write more questions than each try asks, so a retake gets a fresh set.' },
      { target: '.eb-side', title: 'Quiz settings', body: 'Questions per try, the pass mark, and whether it locks the next section.' },
    ],
  },
]

const seenKey = (practiceId: number, key: string) => `cr-tour:${practiceId}:${key}`
const RESTART = 'cr-tour-restart'

/** The first visible element for a selector list, or null. */
function find(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
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
      <span className="demo-bar__tag">Demo</span>
      <p className="demo-bar__text">
        You’re in <strong>Cedar Grove Counseling</strong>, a sample practice, as the <strong>{owner ? 'practice owner' : 'new clinician'}</strong>.
      </p>
      <div className="demo-bar__actions">
        <button type="button" className="demo-bar__btn demo-bar__btn--main" onClick={() => void switchRole()} disabled={busy}>
          {owner ? 'See it as a new clinician' : 'See it as the owner'}
        </button>
        <button type="button" className="demo-bar__btn" onClick={() => window.dispatchEvent(new Event(RESTART))}>Show me around</button>
        <button type="button" className="demo-bar__btn" onClick={() => void leave()}>Leave demo</button>
      </div>
    </div>
  )
}

export function DemoTour() {
  const { me, practice } = useAuth()
  const location = useLocation()
  const role = me?.role === 'owner' ? 'owner' : 'clinician'
  const tour = TOURS.find((t) => t.role === role && t.match.test(location.pathname)) ?? null
  const [tips, setTips] = useState<Tip[]>([])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  const open = useCallback((t: Tour) => {
    const found = t.tips.filter((tip) => find(tip.target))
    if (!found.length) return
    setTips(found)
    setI(0)
  }, [])
  const close = useCallback(() => {
    if (tour && practice) localStorage.setItem(seenKey(practice.id, tour.key), '1')
    setTips([])
    setRect(null)
  }, [tour, practice])

  // First visit to a page with a tour: wait for it to render, then start.
  useEffect(() => {
    setTips([])
    setRect(null)
    if (!tour || !practice || localStorage.getItem(seenKey(practice.id, tour.key))) return
    const timer = setTimeout(() => open(tour), 900)
    return () => clearTimeout(timer)
  }, [tour, practice, open])

  // "Show me around" restarts this page's tour (or says there isn't one).
  useEffect(() => {
    const restart = () => {
      if (tour) open(tour)
    }
    window.addEventListener(RESTART, restart)
    return () => window.removeEventListener(RESTART, restart)
  }, [tour, open])

  const tip = tips[i]
  // Keep the highlight on the target as the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!tip) return
    const el = find(tip.target)
    if (!el) return
    const r0 = el.getBoundingClientRect()
    el.scrollIntoView({ block: r0.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    }
    measure()
    const settle = setInterval(measure, 120)
    const stop = setTimeout(() => clearInterval(settle), 900)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(settle)
      clearTimeout(stop)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [tip])

  useEffect(() => {
    if (tip) nextRef.current?.focus({ preventScroll: true })
  }, [tip])

  if (!tip || !rect) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  const hl = {
    top: Math.max(rect.top - pad, 4),
    left: Math.max(rect.left - pad, 4),
    width: Math.min(rect.width + pad * 2, vw - 8),
    height: Math.min(rect.bottom + pad, vh - 4) - Math.max(rect.top - pad, 4),
  }
  const narrow = vw < 640
  const cardW = 340
  const below = vh - (hl.top + hl.height) > 210
  const style: React.CSSProperties = narrow
    ? {}
    : {
        top: below ? hl.top + hl.height + 12 : Math.max(12, hl.top - 12),
        left: Math.min(Math.max(12, hl.left), vw - cardW - 12),
        transform: below ? undefined : 'translateY(-100%)',
        width: cardW,
      }

  return (
    <div className="tour" onKeyDown={(e) => { if (e.key === 'Escape') close() }}>
      <div className="tour__hl" style={hl} aria-hidden="true" />
      <div className={`tour__card ${narrow ? 'tour__card--sheet' : ''}`} style={style} role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <p className="tour__count">{i + 1} of {tips.length}</p>
        <h2 id={titleId} className="tour__title">{tip.title}</h2>
        <p className="tour__body">{tip.body}</p>
        <div className="tour__actions">
          <button type="button" className="tour__skip" onClick={close}>Skip tour</button>
          <span className="tour__nav">
            {i > 0 && <button type="button" className="tour__btn tour__btn--ghost" onClick={() => setI(i - 1)}>Back</button>}
            <button type="button" ref={nextRef} className="tour__btn" onClick={() => (i < tips.length - 1 ? setI(i + 1) : close())}>
              {i < tips.length - 1 ? 'Next' : 'Got it'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
