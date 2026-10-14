import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type LessonDetail, type SectionLock, type Week } from '../api'
import { LockIcon, QuizIcon } from '../components/Icons'
import { TopBar } from '../components/Shell'
import { ErrorState, Label, Spinner, StatusMark, stepKind } from '../components/ui'
import { monthYear, weekLabel } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useTerms } from '../lib/terms'
import { useAuth } from '../auth'
import { ClientMessagingLink } from '../components/ClientMessagingLink'
import { SourceLinks } from '../components/SourceLinks'
import { PageBlocks, VideoBlock } from '../components/PageBlocks'

function noteOf(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'body' in raw) return String((raw as { body: unknown }).body ?? '')
  return ''
}

export function LessonPage() {
  const { id = '' } = useParams()
  // A step in a section that's still locked behind a quiz comes back as 403 + which quiz opens it.
  const lesson = useApi(() => api.lesson(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 403 && e.data.locked) return { lockedBy: e.data.locked as SectionLock }
    throw e
  }), [id])
  const weeks = useApi(() => api.weeks(), [id])

  const crumbsFallback = <TopBar bell={false} left={<span />} />
  if (lesson.loading && !lesson.data) return <>{crumbsFallback}<Spinner label="Loading lesson" /></>
  if (lesson.data && 'lockedBy' in lesson.data) {
    const by = lesson.data.lockedBy
    return (
      <>
        {crumbsFallback}
        <section className="card sq-intro sq-locked" aria-labelledby="locked-title">
          <span className="sq-intro__icon" aria-hidden="true"><LockIcon size={26} /></span>
          <h1 id="locked-title" className="display-sm">This section isn’t open yet</h1>
          <p className="body-md">It opens once you pass the <strong>{by.title}</strong> quiz.</p>
          <div className="sq-actions">
            <Link className="btn btn--dark" to={`/quiz/${by.weekId}`}>Go to the {by.title} quiz&nbsp;&nbsp;→</Link>
            <Link className="btn btn--ghost" to="/onboarding">My onboarding</Link>
          </div>
        </section>
      </>
    )
  }
  if (lesson.error || !lesson.data) {
    return <>{crumbsFallback}<ErrorState message={lesson.error ?? 'Lesson not found.'} onRetry={lesson.reload} /></>
  }
  return <LessonView key={lesson.data.lesson.id} d={lesson.data} weeks={weeks.data} reload={lesson.reload} />
}

function LessonView({ d, weeks, reload }: { d: LessonDetail; weeks: Week[] | null; reload: () => void }) {
  const terms = useTerms()
  const { lesson, week, position } = d
  const navigate = useNavigate()
  const location = useLocation()
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const isDone = d.progress?.status === 'complete'
  const { me } = useAuth()
  const canEdit = me?.role === 'owner' || me?.role === 'admin'

  useEffect(() => {
    if (location.hash === '#resources') document.getElementById('resources')?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const complete = async () => {
    setCompleting(true)
    setCompleteError(null)
    try {
      const r = await api.complete(lesson.id)
      // Last step of a section with a quiz to pass: the quiz is next.
      if (r.quizWeekId) return navigate(`/quiz/${r.quizWeekId}`)
      const next = r.nextId ?? d.nextId
      navigate(next ? `/lesson/${next}` : '/')
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : 'Could not mark this lesson complete.')
      setCompleting(false)
    }
  }

  const label = [`STEP ${position.index}`, lesson.label?.toUpperCase()].filter(Boolean).join('  ·  ')
  const meta = [lesson.presenter, lesson.durationMin ? `${lesson.durationMin} min` : '', lesson.updatedAt ? `Updated ${monthYear(lesson.updatedAt)}` : '']
    .filter(Boolean)
    .join('  ·  ')

  const fullWeek = weeks?.find((w) => w.id === week.id)
  const nextWeek = weeks && fullWeek ? weeks[weeks.indexOf(fullWeek) + 1] : undefined

  // The page is built from blocks. A video at the very top leads the page, above the title.
  const blocks = lesson.blocks ?? []
  const lead = blocks[0]?.type === 'video' ? blocks[0] : null
  const rest = lead ? blocks.slice(1) : blocks
  const firstVideo = blocks.findIndex((b) => b.type === 'video')

  return (
    <>
      <TopBar
        bell={false}
        left={
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link className="body-sm crumb-link" to="/onboarding">My onboarding</Link></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="body-sm">{weekLabel(week)}</span></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="link-slate" aria-current="page">Step {position.index} of {position.total}</span></li>
            </ol>
          </nav>
        }
      />
      <div className="lesson-cols">
        <div className="lesson-col">
          {lead && (
            <VideoBlock lessonId={lesson.id} title={lesson.title} url={lead.url} transcript={lead.transcript} posterUrl={lesson.posterUrl} startAt={d.progress?.positionSec ?? 0} main />
          )}
          <header className="lesson-title">
            <Label>{label}</Label>
            <h1 className="display-md">{lesson.title}</h1>
            {meta && <p className="meta">{meta}</p>}
            {canEdit && <Link className="btn-ghost-text text-btn lesson-edit" to={`/admin/content/step/${lesson.id}`}>Edit this step&nbsp;&nbsp;→</Link>}
          </header>
          {rest.length ? (
            <PageBlocks blocks={rest} d={d} onChanged={reload} mainVideoIndex={lead ? -1 : firstVideo} />
          ) : !lead ? (
            <p className="body-md">Nothing on this step yet.</p>
          ) : null}
          <div className="lesson-nav">
            {d.prevId ? (
              <Link className="btn btn--ghost" to={`/lesson/${d.prevId}`}>←&nbsp;&nbsp;Previous step</Link>
            ) : (
              <span />
            )}
            <div className="lesson-nav__next">
              <button type="button" className="btn btn--dark" onClick={complete} disabled={completing}>
                {completing ? 'Saving…' : d.quizNext ? (isDone ? 'Take the section quiz  →' : 'Mark complete, then the quiz  →') : isDone ? (d.nextId ? 'Continue  →' : 'Back to home  →') : 'Mark complete and continue  →'}
              </button>
              {completeError && <p className="form-error" role="alert">{completeError}</p>}
            </div>
          </div>
        </div>
        <aside className="lesson-side" aria-label="Step details">
          {fullWeek && (
            <section className="card week-card" aria-labelledby="wk-title">
              <div className="week-card__head">
                <h2 id="wk-title" className="card-serif">{fullWeek.title || weekLabel(week)}</h2>
                <p className="meta">
                  {fullWeek.lessons.filter((l) => l.status === 'complete').length} of {fullWeek.lessons.length} done
                </p>
              </div>
              <ul className="week-list">
                {fullWeek.lessons.map((l, i) => (
                  <li key={l.id}>
                    <Link
                      to={`/lesson/${l.id}`}
                      className={`week-item ${l.id === lesson.id ? 'is-current' : ''}`}
                      aria-current={l.id === lesson.id ? 'page' : undefined}
                    >
                      <StatusMark status={l.status} n={i + 1} size={24} />
                      <span className="week-item__text">
                        <span className="row-title-sm">{l.title}</span>
                        <span className="body-xs">{stepKind(l)}{l.durationMin ? `  ·  ${l.durationMin} min` : ''}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {d.sectionQuiz && (
                <Link to={`/quiz/${week.id}`} className={`week-item week-quiz ${d.sectionQuiz.passed ? 'is-passed' : ''}`}>
                  <span className={`status ${d.sectionQuiz.passed ? 'status--done' : 'status--todo'}`} style={{ width: 24, height: 24 }}><QuizIcon size={13} /></span>
                  <span className="week-item__text">
                    <span className="row-title-sm">Section quiz</span>
                    <span className="body-xs">{d.sectionQuiz.passed ? `Passed${d.sectionQuiz.bestPercent != null ? ` · ${d.sectionQuiz.bestPercent}%` : ''}` : `Pass it to open the next section`}</span>
                  </span>
                </Link>
              )}
              {nextWeek && <p className="meta week-card__next">Up next: {weekLabel(nextWeek).replace('  ·  ', ', ')}{nextWeek.locked ? ' (opens after the quiz)' : ''}</p>}
            </section>
          )}
          <Notes lessonId={lesson.id} initial={noteOf(d.note)} />
          {d.week.links?.length ? (
            <section className="card side-card" aria-labelledby="mat-title">
              <h2 id="mat-title" className="card-serif">Section materials</h2>
              <SourceLinks links={d.week.links} />
            </section>
          ) : null}
          <section className="card ask-card" aria-labelledby="ask-title">
            <h2 id="ask-title" className="card-serif">Questions about this step?</h2>
            <p className="body-sm-dark">Send them to your {terms.lead}. The answer shows up in Support, and the bell lets you know.</p>
            <ClientMessagingLink compact />
            <Link className="btn-ghost-text ask-link" to={`/support?lesson=${lesson.id}`}>Ask your {terms.lead}&nbsp;&nbsp;→</Link>
          </section>
        </aside>
      </div>
    </>
  )
}

function Notes({ lessonId, initial }: { lessonId: number; initial: string }) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const id = useId()

  const flush = async (body: string) => {
    pending.current = null
    setStatus('saving')
    try {
      await api.saveNote(lessonId, body)
      setStatus('saved')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not save.')
      setStatus('error')
    }
  }

  // Flush a pending save if the user leaves the lesson within the debounce window.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (pending.current !== null) api.saveNote(lessonId, pending.current).catch(() => {})
    },
    [lessonId],
  )

  const onChange = (v: string) => {
    setValue(v)
    setStatus('idle')
    pending.current = v
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(v), 800)
  }

  return (
    <div className="notes card">
      <label htmlFor={id} className="card-serif">My notes</label>
      <p className="body-xs">Private to you. Saved as you type.</p>
      <textarea id={id} className="input textarea" rows={5} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className={`save-status ${status === 'error' ? 'form-error' : 'meta'}`} aria-live="polite" role="status">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? errMsg : ''}
      </p>
    </div>
  )
}
