import { Link } from 'react-router-dom'
import { api, type ChecklistEntry, type Dashboard as DashboardData, type Person, type PathWeek } from '../api'
import { ChatIcon, CheckIcon, DownloadIcon, LockIcon, PlayDisc, QuizIcon } from '../components/Icons'
import { TopBar } from '../components/Shell'
import { Avatar, Disclosure, EmptyState, ErrorState, Label, LessonRow, ProgressBar, QuizRow, ResourceCard, Spinner, stepKind } from '../components/ui'
import { posterFor } from '../lib/brand'
import { useAuth } from '../auth'
import { clock, firstName, lessonNumbers, plural, timeLeft } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useState } from 'react'
import { useTerms } from '../lib/terms'
import { SourceLinks } from '../components/SourceLinks'

export function DashboardPage() {
  const { data, error, loading, reload, setData } = useApi(() => api.dashboard())

  if (loading && !data) return <><TopBar /><Spinner label="Loading your onboarding" /></>
  if (error || !data) return <><TopBar /><ErrorState message={error ?? 'No data.'} onRetry={reload} /></>

  const setChecklist = (items: ChecklistEntry[]) => setData((d) => (d ? { ...d, checklist: items } : d))

  return (
    <>
      <TopBar />
      <Greeting data={data} />
      {data.quizDue ? <QuizDueCard quiz={data.quizDue} /> : data.continue && <ContinueCard data={data} />}
      <div className="path-and-side">
        <PathCard path={data.path} />
        <div className="side">
          <PaperworkCard />
          <ChecklistCard positionName={data.position?.name ?? null} items={data.checklist} onChange={setChecklist} />
          <PeopleCard people={data.people} />
        </div>
      </div>
      {data.resources.length > 0 && (
      <section className="resources" aria-labelledby="res-title">
        <div className="section-head">
          <h2 id="res-title" className="display-sm">Resource library</h2>
          <Link className="link-slate" to="/resources">View all resources&nbsp;&nbsp;→</Link>
        </div>
        {data.resources.length ? (
          <ul className="file-grid">
            {data.resources.slice(0, 6).map((r) => (
              <li key={r.id}><ResourceCard resource={r} /></li>
            ))}
          </ul>
        ) : null}
      </section>
      )}
    </>
  )
}

/** The section quiz is the next thing to do: it stands in for "Continue" until it's passed. */
export function QuizDueCard({ quiz }: { quiz: NonNullable<DashboardData['quizDue']> }) {
  return (
    <section className="card quiz-due" aria-labelledby="qd-title">
      <span className="quiz-due__icon" aria-hidden="true"><QuizIcon size={30} /></span>
      <div className="quiz-due__copy">
        <Label>{quiz.attempts ? 'TRY THE SECTION QUIZ AGAIN' : 'YOU FINISHED THE SECTION'}</Label>
        <h2 id="qd-title" className="display-sm">{quiz.title} quiz</h2>
        <p className="meta">
          {quiz.drawCount} {quiz.drawCount === 1 ? 'question' : 'questions'}  ·  pass mark {quiz.passPercent}%  ·  pass it to open the next section
          {quiz.attempts ? `  ·  best so far ${quiz.bestPercent ?? 0}%` : ''}
        </p>
      </div>
      <Link className="btn btn--dark quiz-due__btn" to={`/quiz/${quiz.weekId}`}>{quiz.attempts ? 'Try again' : 'Take the quiz'}&nbsp;&nbsp;→</Link>
    </section>
  )
}

function currentWeekNumber(path: PathWeek[]): number {
  // A section isn't finished until its quiz is passed.
  const i = path.findIndex((w) => w.lessons.some((l) => l.status !== 'complete') || (w.quiz && !w.quiz.passed))
  return i === -1 ? path.length : i + 1
}

function Greeting({ data }: { data: DashboardData }) {
  const terms = useTerms()
  const { progress, practice, me, path } = data
  const wk = currentWeekNumber(path)
  return (
    <section className="greeting" aria-labelledby="greet-title">
      <div className="greeting__l">
        <Label>{path.length ? `SECTION ${wk} OF ${path.length}  ·  ${(path[wk - 1]?.title ?? '').toUpperCase()}` : 'ONBOARDING'}</Label>
        <h1 id="greet-title" className="greeting__head">
          <span className="display-lg">Welcome to {practice.name},</span>
          <span className="display-lg display-accent">{firstName(me.name)}.</span>
        </h1>
        <p className="body-md greeting__body">
          {path.length
            ? `${plural(path.length, 'section')}, one video lesson at a time. Watch, take the quick check, and tick things off as you go.`
            : `Your onboarding lessons will appear here once your ${terms.org} adds them.`}
        </p>
      </div>
      <div className="card progress-card">
        <p className="label-muted">YOUR PROGRESS</p>
        <p className="progress-card__num">
          <span className="stat">{progress.done} of {progress.total}</span>
          <span className="body-sm">lessons</span>
        </p>
        <ProgressBar percent={progress.percent} label="Onboarding progress" />
        <p className="body-xs">{progress.total ? timeLeft(progress.minutesLeft) : 'No lessons yet'}</p>
      </div>
    </section>
  )
}

function ContinueCard({ data }: { data: DashboardData }) {
  const { practice } = useAuth()
  const c = data.continue!
  const l = c.lesson
  const href = `/lesson/${l.id}`
  const n = l.resourceCount ?? 0
  const meta = [c.presenter, l.durationMin ? `${l.durationMin} min` : '', n ? `${n} ${n === 1 ? 'download' : 'downloads'}` : '']
    .filter(Boolean)
    .join('  ·  ')
  const totalSec = (l.durationMin || 0) * 60
  const pos = Math.min(c.positionSec ?? 0, totalSec)
  const started = l.status === 'started' && pos > 0 && totalSec > 0
  const chip = !l.hasVideo ? stepKind(l) : started ? `${clock(totalSec - pos)} left` : l.durationMin ? `${l.durationMin} min` : ''
  return (
    <section className="card continue" aria-labelledby="cw-title">
      <Link to={href} className="continue__video" aria-label={`${l.hasVideo ? 'Play' : 'Open'} ${l.title}`}>
        <img src={l.posterUrl || posterFor(practice?.slug)} alt="" />
        {l.hasVideo && <span className="continue__play"><PlayDisc /></span>}
        {chip && <span className="chip">{chip}</span>}
        {started && (
          <span className="continue__track" aria-hidden="true">
            <span style={{ width: `${Math.round((pos / totalSec) * 100)}%` }} />
          </span>
        )}
      </Link>
      <div className="continue__copy">
        <Label>{l.status === 'started' ? 'CONTINUE WHERE YOU LEFT OFF' : 'UP NEXT'}</Label>
        <p className="meta">Lesson {c.position.index} of {c.position.total}{c.weekTitle ? `  ·  ${c.weekTitle}` : ''}</p>
        <h2 id="cw-title" className="display-md">{l.title}</h2>
        {c.overview && <p className="body-md clamp-3">{c.overview}</p>}
        {meta && (
          <p className="continue__meta meta">
            <Avatar initials={initialsOf(c.presenter)} size={32} />
            {meta}
          </p>
        )}
        <div className="continue__btns">
          <Link className="btn btn--dark" to={href}>{l.status === 'started' ? 'Resume lesson' : 'Start lesson'}</Link>
          {(l.resourceCount ?? 0) > 0 && (
            <Link className="btn btn--ghost" to={`${href}#resources`}>
              Lesson resources <DownloadIcon />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

const initialsOf = (name: string) =>
  name
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')

export function PathCard({ path, title = 'Your onboarding path', headingLevel = 2 }: { path: PathWeek[]; title?: string | null; headingLevel?: 1 | 2 }) {
  const terms = useTerms()
  const nums = lessonNumbers(path)
  const total = nums.size
  const current = path.flatMap((w) => w.lessons).find((l) => l.status !== 'complete')?.id
  const quizWeek = path.find((w) => !w.locked && w.quiz && !w.quiz.passed && w.quiz.ready)?.weekId
  const currentWeek = quizWeek ?? path.find((w) => w.lessons.some((l) => l.id === current))?.weekId ?? path[0]?.weekId
  // Only the section you're in starts open; the rest show their progress on one line.
  const [open, setOpen] = useState<Set<number>>(() => new Set(currentWeek ? [currentWeek] : []))
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section className="card path-card" aria-labelledby={title ? 'path-title' : undefined} aria-label={title ? undefined : 'Onboarding sections'}>
      {title && (
        <div className="path-card__head">
          <H id="path-title" className="display-sm">{title}</H>
          <p className="meta">{plural(path.length, 'section')}  ·  {plural(total, 'lesson')}</p>
        </div>
      )}
      {path.length === 0 && <EmptyState title="No lessons yet">Your {terms.org} hasn’t published any lessons.</EmptyState>}
      {path.map((w) => {
        const done = w.lessons.filter((l) => l.status === 'complete').length
        const isHere = w.weekId === currentWeek
        return (
          <Disclosure
            key={w.weekId}
            className={`path-week${isHere ? ' is-here' : ''}`}
            title={
              <span className="pw-title">
                {w.subtitle?.trim() ? <span className="pw-kicker">{w.title}</span> : null}
                <span className="pw-name">{w.subtitle?.trim() || w.title}</span>
              </span>
            }
            meta={
              w.locked ? (
                <span className="pw-meta pw-meta--locked"><LockIcon size={13} /> After the {w.lockedBy?.title} quiz</span>
              ) : w.lessons.length ? (
                <span className="pw-meta">
                  <span className="pw-bar" aria-hidden="true"><span style={{ width: `${Math.round((done / w.lessons.length) * 100)}%` }} /></span>
                  {done === w.lessons.length ? `All ${w.lessons.length} done` : `${done} of ${w.lessons.length}`}
                </span>
              ) : 'No lessons yet'
            }
            open={open.has(w.weekId)}
            onToggle={(o) => setOpen((prev) => { const next = new Set(prev); if (o) next.add(w.weekId); else next.delete(w.weekId); return next })}
          >
            <SourceLinks links={w.links} className="source-links--inline" />
            {w.lessons.length ? (
              <ul className="lesson-list">
                {w.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} n={nums.get(l.id) ?? 0} current={l.id === current && !w.locked} locked={w.locked} />
                ))}
                {w.quiz && <QuizRow weekId={w.weekId} quiz={w.quiz} locked={w.locked} />}
              </ul>
            ) : (
              <p className="body-xs path-week__empty">No lessons in this section yet.</p>
            )}
          </Disclosure>
        )
      })}
    </section>
  )
}

function ChecklistCard({ items, onChange, positionName }: { items: ChecklistEntry[]; onChange: (items: ChecklistEntry[]) => void; positionName?: string | null }) {
  const terms = useTerms()
  const [error, setError] = useState<string | null>(null)
  const done = items.filter((i) => i.done).length
  // Group by section (keeping first-seen order). Only the first group with something left to do starts open.
  const groups: { section: string; items: ChecklistEntry[] }[] = []
  for (const it of items) {
    const key = it.section || ''
    const g = groups.find((x) => x.section === key) ?? (groups.push({ section: key, items: [] }), groups[groups.length - 1]!)
    g.items.push(it)
  }
  const firstOpen = groups.findIndex((g) => g.items.some((i) => !i.done))
  const [open, setOpen] = useState<Set<number>>(() => new Set(firstOpen >= 0 ? [firstOpen] : []))
  const grouped = groups.length > 1 || Boolean(groups[0]?.section)

  const toggle = async (item: ChecklistEntry) => {
    const next = !item.done
    const before = items
    onChange(items.map((i) => (i.id === item.id ? { ...i, done: next } : i)))
    setError(null)
    try {
      await api.setChecklist(item.id, next)
    } catch (e) {
      onChange(before)
      setError(e instanceof Error ? e.message : 'Could not save that change.')
    }
  }

  const row = (i: ChecklistEntry) => (
    <li key={i.id}>
      <label className={`ck ${i.done ? 'is-done' : ''}`}>
        <input type="checkbox" className="sr-only-input" checked={i.done} onChange={() => void toggle(i)} />
        <span className="ck__box" aria-hidden="true">{i.done && <CheckIcon size={12} />}</span>
        <span className={i.done ? 'body-sm' : 'body-sm-dark'}>{i.title}</span>
      </label>
    </li>
  )

  return (
    <section className="card side-card checklist" aria-labelledby="ck-title">
      <h2 id="ck-title" className="card-serif">{terms.checklist}</h2>
      <p className="body-xs" aria-live="polite">{positionName ? `${positionName} · ` : ''}{done} of {items.length} done</p>
      {items.length === 0 ? (
        <p className="body-sm">Nothing to tick off yet.</p>
      ) : grouped ? (
        <div className="ck-groups">
          {groups.map((g, gi) => {
            const gd = g.items.filter((i) => i.done).length
            return (
              <Disclosure
                key={g.section || gi}
                className={`ck-group${gd === g.items.length ? ' is-complete' : ''}`}
                title={g.section || 'General'}
                meta={gd === g.items.length ? '✓' : `${gd}/${g.items.length}`}
                open={open.has(gi)}
                onToggle={(o) => setOpen((prev) => { const next = new Set(prev); if (o) next.add(gi); else next.delete(gi); return next })}
              >
                <ul className="ck-list">{g.items.map(row)}</ul>
              </Disclosure>
            )
          })}
        </div>
      ) : (
        <ul className="ck-list">{items.map(row)}</ul>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

function PeopleCard({ people }: { people: Person[] }) {
  return (
    <section className="card side-card people" aria-labelledby="people-title">
      <h2 id="people-title" className="card-serif">Your people</h2>
      {people.length === 0 ? (
        <p className="body-sm">Your team will show here.</p>
      ) : (
        <ul className="people-list">
          {people.map((p) => (
            <li key={p.id} className="person">
              <Avatar initials={p.initials} size={48} tone="media" />
              <span className="person__text">
                <span className="row-title">{p.name}</span>
                <span className="body-xs">{p.title}</span>
              </span>
              <Link className="round-btn round-btn--sm" to="/support" aria-label={`Send a question to ${p.name}`}>
                <ChatIcon />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Outstanding agreements and forms. Hidden when there's nothing left to do. */
function PaperworkCard() {
  const forms = useApi(() => api.myForms())
  const open = (forms.data ?? []).filter((f) => f.required && f.status !== 'done')
  if (!open.length) return null
  return (
    <section className="card side-card pw-dash" aria-labelledby="pwd-title">
      <h2 id="pwd-title" className="card-serif">Paperwork to finish</h2>
      <ul className="pw-dash__list">
        {open.slice(0, 4).map((f) => (
          <li key={f.id} className="body-sm-dark">
            {f.title}
            <span className="body-xs">  ·  {f.status === 'resign' ? 'updated, sign again' : f.kind === 'sign' ? 'to sign' : 'to hand in'}</span>
          </li>
        ))}
      </ul>
      <Link className="btn btn--dark btn--small pw-dash__btn" to="/paperwork">Open paperwork&nbsp;&nbsp;→</Link>
    </section>
  )
}
