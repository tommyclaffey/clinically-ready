// The quiz at the end of a section. One question at a time; pass it to open the next section.
// Every try draws a new set of questions from the section's pool, with the answers in a new order.
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type NextSection, type QuizAttempt, type SectionQuizPage } from '../api'
import { CheckIcon, CloseIcon, LockIcon, QuizIcon } from '../components/Icons'
import { TopBar } from '../components/Shell'
import { ErrorState, Label, ProgressBar, Spinner } from '../components/ui'
import { useApi } from '../lib/useApi'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function SectionQuizPage() {
  const { weekId = '' } = useParams()
  const page = useApi(() => api.sectionQuiz(weekId), [weekId])
  const crumbs = (title?: string) => (
    <TopBar
      bell={false}
      left={
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            <li><Link className="body-sm crumb-link" to="/onboarding">My onboarding</Link></li>
            <li aria-hidden="true" className="body-sm">/</li>
            <li><span className="link-slate" aria-current="page">{title ? `${title} quiz` : 'Section quiz'}</span></li>
          </ol>
        </nav>
      }
    />
  )
  if (page.loading && !page.data) return <>{crumbs()}<Spinner label="Loading the quiz" /></>
  if (page.error || !page.data) return <>{crumbs()}<ErrorState message={page.error ?? 'Quiz not found.'} onRetry={page.reload} /></>
  const d = page.data
  const name = d.section.subtitle || d.section.title
  return (
    <>
      {crumbs(name)}
      <div className="sq">
        <QuizFlow key={d.attempt?.id ?? 'intro'} d={d} name={name} />
      </div>
    </>
  )
}

function QuizFlow({ d, name }: { d: SectionQuizPage; name: string }) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(d.attempt)
  const [result, setResult] = useState<{ attempt: QuizAttempt; next: NextSection | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.startQuiz(d.section.id)
      setResult(null)
      setAttempt(r.attempt)
      top.current?.scrollIntoView({ block: 'start' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the quiz.')
    } finally {
      setBusy(false)
    }
  }

  if (result) return <div ref={top}><Result r={result} name={name} onRetry={() => void start()} busy={busy} error={error} /></div>
  if (attempt) return <div ref={top}><Taking attempt={attempt} name={name} onDone={(r) => { setAttempt(null); setResult(r) }} /></div>

  const q = d.quiz
  return (
    <div ref={top} className="stack-18">
      <section className="card sq-intro" aria-labelledby="sq-title">
        <span className="sq-intro__icon" aria-hidden="true">{d.locked ? <LockIcon size={26} /> : q.passed ? <CheckIcon size={28} /> : <QuizIcon size={30} />}</span>
        <Label>SECTION QUIZ</Label>
        <h1 id="sq-title" className="display-md">{name} quiz</h1>
        {d.locked ? (
          <p className="body-md">This quiz opens after you pass the <strong>{d.lockedBy?.title}</strong> quiz.</p>
        ) : !q.ready && !q.passed ? (
          <p className="body-md">Finish every step in {name} first. The quiz opens when the last one is done.</p>
        ) : q.passed ? (
          <p className="body-md">You passed{q.bestPercent != null ? ` with ${q.bestPercent}%` : ''}. {d.next ? `${d.next.title} is open.` : 'That was the last section.'}</p>
        ) : (
          <p className="body-md">Pass this to open {d.next ? <strong>{d.next.title}</strong> : 'the rest of your onboarding'}. Take your time: it isn’t timed.</p>
        )}
        <ul className="sq-facts">
          <li><span className="stat-sm">{q.drawCount}</span><span className="body-xs">{q.drawCount === 1 ? 'question' : 'questions'}</span></li>
          <li><span className="stat-sm">{q.passPercent}%</span><span className="body-xs">to pass</span></li>
          <li><span className="stat-sm">{q.poolSize}</span><span className="body-xs">in the question pool</span></li>
        </ul>
        <p className="body-sm">Every try picks a new set of questions from the pool, so retaking it means learning it, not memorising it.</p>
        <div className="sq-actions">
          {q.passed ? (
            <>
              {d.next?.firstLessonId && <Link className="btn btn--dark" to={`/lesson/${d.next.firstLessonId}`}>Continue to {d.next.title}&nbsp;&nbsp;→</Link>}
              <button type="button" className="btn btn--ghost" onClick={() => void start()} disabled={busy}>Practise again</button>
            </>
          ) : d.locked || !q.ready ? (
            <Link className="btn btn--ghost" to="/onboarding">Back to My onboarding</Link>
          ) : (
            <button type="button" className="btn btn--dark" onClick={() => void start()} disabled={busy}>
              {busy ? 'Starting…' : q.attempts ? 'Try again with new questions' : 'Start the quiz'}&nbsp;&nbsp;→
            </button>
          )}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      {d.history.length > 0 && (
        <section className="card side-card sq-history" aria-labelledby="sq-h">
          <h2 id="sq-h" className="card-serif">Your tries</h2>
          <ul>
            {d.history.map((h) => (
              <li key={h.id}>
                <span className={`sq-pill ${h.passed ? 'is-pass' : 'is-fail'}`}>{h.passed ? 'Passed' : 'Not yet'}</span>
                <span className="row-title-sm">{h.percent}%</span>
                <span className="body-xs">{when(h.submittedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Taking({ attempt, name, onDone }: { attempt: QuizAttempt; name: string; onDone: (r: { attempt: QuizAttempt; next: NextSection | null }) => void }) {
  const key = `coa-quiz-${attempt.id}`
  const [answers, setAnswers] = useState<(number | null)[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as (number | null)[] | null
      if (Array.isArray(saved) && saved.length === attempt.total) return saved
    } catch { /* ignore */ }
    return attempt.questions.map(() => null)
  })
  const [i, setI] = useState(() => Math.max(0, answers.findIndex((a) => a === null)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const base = useId()
  const q = attempt.questions[i]!
  const answered = answers.filter((a) => a !== null).length
  const last = i === attempt.total - 1

  useEffect(() => sessionStorage.setItem(key, JSON.stringify(answers)), [answers, key])
  useEffect(() => heading.current?.focus(), [i])

  const pick = (k: number) => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))
  const submit = async () => {
    const missing = answers.findIndex((a) => a === null)
    if (missing >= 0) {
      setI(missing)
      setError(`Answer question ${missing + 1} first.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await api.submitQuiz(attempt.id, answers as number[])
      sessionStorage.removeItem(key)
      onDone(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not hand it in.')
      setBusy(false)
    }
  }

  return (
    <section className="card sq-take" aria-labelledby={`${base}-q`}>
      <div className="sq-take__top">
        <Label>{name.toUpperCase()} QUIZ</Label>
        <p className="meta">Question {i + 1} of {attempt.total}  ·  {attempt.toPass} right to pass</p>
      </div>
      <ProgressBar percent={Math.round((answered / attempt.total) * 100)} label={`${answered} of ${attempt.total} answered`} />
      <fieldset className="sq-q">
        <legend className="sr-only">Question {i + 1}</legend>
        <h2 id={`${base}-q`} className="display-sm sq-q__prompt" tabIndex={-1} ref={heading}>{q.prompt}</h2>
        <div className="sq-opts" role="radiogroup" aria-labelledby={`${base}-q`}>
          {q.options.map((o, k) => (
            <label key={k} className={`sq-opt ${answers[i] === k ? 'is-picked' : ''}`}>
              <input type="radio" className="sr-only-input" name={`${base}-o`} checked={answers[i] === k} onChange={() => pick(k)} />
              <span className="sq-opt__mark" aria-hidden="true">{String.fromCharCode(65 + k)}</span>
              <span className="body-md">{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="sq-nav">
        <button type="button" className="btn btn--ghost" onClick={() => setI(i - 1)} disabled={i === 0}>←&nbsp;&nbsp;Back</button>
        <div className="sq-dots" aria-hidden="true">
          {answers.map((a, j) => <span key={j} className={`sq-dot ${a !== null ? 'is-done' : ''} ${j === i ? 'is-here' : ''}`} />)}
        </div>
        {last ? (
          <button type="button" className="btn btn--dark" onClick={() => void submit()} disabled={busy || answers[i] === null}>{busy ? 'Checking…' : 'Hand it in'}</button>
        ) : (
          <button type="button" className="btn btn--dark" onClick={() => setI(i + 1)} disabled={answers[i] === null}>Next&nbsp;&nbsp;→</button>
        )}
      </div>
    </section>
  )
}

function Result({ r, name, onRetry, busy, error }: {
  r: { attempt: QuizAttempt; next: NextSection | null }; name: string; onRetry: () => void; busy: boolean; error: string | null
}) {
  const a = r.attempt
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="stack-18">
      <section className={`card sq-result ${a.passed ? 'is-pass' : 'is-fail'}`} aria-labelledby="sq-r">
        <span className="sq-result__badge" aria-hidden="true">{a.passed ? <CheckIcon size={30} /> : <QuizIcon size={30} />}</span>
        <Label>{name.toUpperCase()} QUIZ</Label>
        <h1 id="sq-r" className="display-md" tabIndex={-1} ref={heading}>{a.passed ? 'You passed.' : 'Not quite yet.'}</h1>
        <p className="sq-result__score"><span className="stat">{a.correct} of {a.total}</span><span className="body-md">{a.percent}% · pass mark {a.passPercent}%</span></p>
        <p className="body-md">
          {a.passed
            ? r.next ? `${r.next.title} is open now.` : 'That was the last section quiz.'
            : `You need ${a.toPass} of ${a.total}. Look over the ones you missed below, then try again. You’ll get a new set of questions.`}
        </p>
        <div className="sq-actions">
          {a.passed ? (
            r.next?.firstLessonId ? (
              <Link className="btn btn--dark" to={`/lesson/${r.next.firstLessonId}`}>Continue to {r.next.title}&nbsp;&nbsp;→</Link>
            ) : (
              <Link className="btn btn--dark" to="/">Back to home&nbsp;&nbsp;→</Link>
            )
          ) : (
            <button type="button" className="btn btn--dark" onClick={onRetry} disabled={busy}>{busy ? 'Starting…' : 'Try again with new questions'}&nbsp;&nbsp;→</button>
          )}
          {!a.passed && <Link className="btn btn--ghost" to="/onboarding">Not now</Link>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="card sq-review" aria-labelledby="sq-rv">
        <h2 id="sq-rv" className="card-serif">Your answers</h2>
        <ol>
          {a.questions.map((x) => (
            <li key={x.n} className={`sq-rv ${x.correct ? 'is-right' : 'is-wrong'}`}>
              <span className="sq-rv__mark" aria-hidden="true">{x.correct ? <CheckIcon size={14} /> : <CloseIcon size={14} />}</span>
              <div className="sq-rv__body">
                <p className="row-title-sm">{x.prompt}</p>
                <p className="body-sm"><span className="sr-only">{x.correct ? 'Right. ' : 'Wrong. '}</span>You said: <strong>{x.choice != null ? x.options[x.choice] : '(no answer)'}</strong></p>
                {a.passed && !x.correct && x.correctIndex != null && <p className="body-sm">Right answer: <strong>{x.options[x.correctIndex]}</strong></p>}
                {x.explanation && <p className="body-sm-dark sq-rv__why">{x.explanation}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
