import { Link, useSearchParams } from 'react-router-dom'
import { api, type PathWeek, type Resource } from '../api'
import { TopBar } from '../components/Shell'
import { EmptyState, ErrorState, Label, LessonRow, ProgressBar, ResourceCard, Spinner, stepKind } from '../components/ui'
import { PlayDisc } from '../components/Icons'
import { posterFor } from '../lib/brand'
import { useAuth } from '../auth'
import { lessonNumbers, plural } from '../lib/format'
import { useApi } from '../lib/useApi'
import { PathCard, QuizDueCard } from './Dashboard'

export function OnboardingPage() {
  const { practice } = useAuth()
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const weeks = useApi(() => api.weeks())
  const resources = useApi<Resource[]>(() => (q ? api.resources() : Promise.resolve([])), [q])

  if (weeks.loading && !weeks.data) return <><TopBar /><Spinner label="Loading lessons" /></>
  if (weeks.error || !weeks.data) return <><TopBar /><ErrorState message={weeks.error ?? 'No data.'} onRetry={weeks.reload} /></>

  const path: PathWeek[] = weeks.data.map((w) => ({ weekId: w.id, title: w.title, subtitle: w.subtitle, links: w.links, lessons: w.lessons, locked: w.locked, lockedBy: w.lockedBy, quiz: w.quiz }))
  const all = path.flatMap((w) => w.lessons)
  const done = all.filter((l) => l.status === 'complete').length
  const percent = all.length ? Math.round((done / all.length) * 100) : 0

  if (q) {
    const needle = q.toLowerCase()
    const nums = lessonNumbers(path)
    const lessons = all.filter((l) => `${l.title} ${l.label}`.toLowerCase().includes(needle))
    const files = (resources.data ?? []).filter((r) => r.title.toLowerCase().includes(needle))
    return (
      <>
        <TopBar />
        <header className="page-head">
          <p className="label-muted">SEARCH</p>
          <h1 className="display-md">Results for “{q}”</h1>
          <p className="body-sm" aria-live="polite">
            {plural(lessons.length, 'lesson')} and {plural(files.length, 'resource')}
          </p>
        </header>
        <section className="card path-card" aria-label="Matching lessons">
          <h2 className="card-serif">Lessons</h2>
          {lessons.length ? (
            <ul className="lesson-list">
              {lessons.map((l) => <LessonRow key={l.id} lesson={l} n={nums.get(l.id) ?? 0} current={false} />)}
            </ul>
          ) : (
            <p className="body-sm">No lessons match.</p>
          )}
        </section>
        <section aria-label="Matching resources" className="resources">
          <h2 className="display-sm">Resources</h2>
          {resources.loading ? (
            <Spinner label="Searching resources" />
          ) : resources.error ? (
            <ErrorState message={resources.error} onRetry={resources.reload} />
          ) : files.length ? (
            <ul className="file-grid">{files.map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}</ul>
          ) : (
            <EmptyState title="No resources match" />
          )}
        </section>
      </>
    )
  }

  // Up next: the lesson you're in the middle of, else the first one not done.
  // A section quiz that's ready and not passed comes first: the next section waits on it.
  const dueWeek = path.find((w) => !w.locked && w.quiz && !w.quiz.passed && w.quiz.ready)
  const quizDue = dueWeek?.quiz ? { ...dueWeek.quiz, weekId: dueWeek.weekId, title: dueWeek.subtitle?.trim() || dueWeek.title } : null
  const open = path.filter((w) => !w.locked).flatMap((w) => w.lessons)
  const next = quizDue ? undefined : open.find((l) => l.status === 'started') ?? open.find((l) => l.status !== 'complete')
  const nextWeek = next ? path.find((w) => w.lessons.some((l) => l.id === next.id)) : undefined
  const nextN = next ? all.indexOf(next) + 1 : 0
  const minsLeft = all.filter((l) => l.status !== 'complete').reduce((m, l) => m + (l.durationMin || 0), 0)

  return (
    <>
      <TopBar />
      <header className="ob-head">
        <div className="ob-head__l">
          <Label>MY ONBOARDING</Label>
          <h1 className="display-lg">Your onboarding path</h1>
          <p className="body-md ob-head__intro">
            {plural(path.length, 'section')}, {plural(all.length, 'video lesson')}. Watch each one, take the quick check, and pick up wherever you left off.
          </p>
        </div>
        <div className="card ob-progress" aria-label="Your progress">
          <div className="ob-progress__row">
            <p className="stat">{done}<span className="ob-progress__of"> / {all.length}</span></p>
            <p className="meta">{percent}% complete{minsLeft ? <><br />About {minsLeft >= 90 ? `${Math.round(minsLeft / 60)} hours` : `${minsLeft} min`} left</> : null}</p>
          </div>
          <ProgressBar percent={percent} label="Onboarding progress" />
        </div>
      </header>

      {quizDue && <QuizDueCard quiz={quizDue} />}
      {next && (
        <section className="card ob-next" aria-labelledby="ob-next-title">
          <Link to={`/lesson/${next.id}`} className={`ob-next__video ${next.hasVideo ? '' : 'is-soon'}`} tabIndex={-1} aria-hidden="true">
            <img src={next.posterUrl || posterFor(practice?.slug)} alt="" />
            {next.hasVideo ? <span className="ob-next__play"><PlayDisc size={48} /></span> : <span className="chip">{stepKind(next)}</span>}
          </Link>
          <div className="ob-next__copy">
            <Label>{next.status === 'started' ? 'CONTINUE WHERE YOU LEFT OFF' : 'UP NEXT'}</Label>
            <h2 id="ob-next-title" className="display-sm">{next.title}</h2>
            <p className="meta">Lesson {nextN} of {all.length}{nextWeek ? `  ·  ${nextWeek.subtitle?.trim() || nextWeek.title}` : ''}{next.durationMin ? `  ·  ${next.durationMin} min` : ''}</p>
          </div>
          <Link className="btn btn--dark ob-next__btn" to={`/lesson/${next.id}`}>
            {next.status === 'started' ? 'Resume lesson' : 'Start lesson'}&nbsp;&nbsp;→
          </Link>
        </section>
      )}

      <PathCard path={path} title={null} />
    </>
  )
}
