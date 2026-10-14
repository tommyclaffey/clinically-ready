// Admin › one person's onboarding results: lessons, quiz answers, checklist and paperwork.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, submissionFileUrl, type PersonRecord } from '../../api'
import { roleName, TopBar } from '../../components/Shell'
import { Avatar, Disclosure, ErrorState, ProgressBar, Spinner } from '../../components/ui'
import { CheckIcon } from '../../components/Icons'
import { relativeDate } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useTerms } from '../../lib/terms'

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function AdminPersonPage() {
  const { id = '' } = useParams()
  const rec = useApi(() => api.person(id), [id])
  if (rec.loading && !rec.data) return <><TopBar /><Spinner label="Loading results" /></>
  if (rec.error || !rec.data) return <><TopBar /><ErrorState message={rec.error ?? 'Not found.'} onRetry={rec.reload} /></>
  return <PersonView r={rec.data} reload={rec.reload} />
}

function PersonView({ r, reload }: { r: PersonRecord; reload: () => void }) {
  const terms = useTerms()
  const { person: p, summary: s } = r
  const stats = [
    { label: 'Lessons', done: s.lessonsDone, total: s.lessonsTotal },
    { label: 'Quiz answers right', done: s.quizCorrect, total: s.quizTotal },
    ...(s.sectionQuizzesTotal ? [{ label: 'Section quizzes passed', done: s.sectionQuizzesPassed ?? 0, total: s.sectionQuizzesTotal }] : []),
    { label: terms.checklist, done: s.checklistDone, total: s.checklistTotal },
    { label: 'Paperwork', done: s.paperworkDone, total: s.paperworkTotal },
  ]
  return (
    <>
      <TopBar left={<nav aria-label="Breadcrumb"><Link className="body-sm crumb-link" to="/admin">← Team progress</Link></nav>} />
      <header className="person-head">
        <Avatar initials={p.initials} size={64} />
        <div className="person-head__text">
          <h1 className="display-md">{p.name}</h1>
          <p className="body-sm">
            {[p.positionName, p.title, roleName(p.role, terms.member)].filter(Boolean).join('  ·  ')}
            {'  ·  '}{p.email}{'  ·  '}Last seen {relativeDate(p.lastSeenAt)}{!p.active && '  ·  Access turned off'}
          </p>
        </div>
      </header>

      <section className="stat-grid" aria-label="Summary">
        {stats.map((x) => (
          <div key={x.label} className="card stat-tile">
            <p className="label-muted">{x.label.toUpperCase()}</p>
            <p className="stat-tile__num"><span className="stat">{x.done}</span><span className="body-sm"> / {x.total}</span></p>
            <ProgressBar percent={pct(x.done, x.total)} label={`${x.label}: ${x.done} of ${x.total}`} />
          </div>
        ))}
      </section>

      <PaperworkCard r={r} reload={reload} />

      <section className="card table-card" aria-labelledby="ls-title">
        <h2 id="ls-title" className="card-serif">Lessons and quiz answers</h2>
        {r.sections.map((sec, i) => {
          const done = sec.lessons.filter((l) => l.status === 'complete').length
          return (
            <SectionDisclosure key={sec.id} title={[sec.title, sec.subtitle].filter(Boolean).join('  ·  ')} meta={`${done} of ${sec.lessons.length}`} startOpen={i === 0 || (done > 0 && done < sec.lessons.length)}>
              <ul className="result-list">
                {sec.lessons.map((l) => (
                  <li key={l.id} className="result-row">
                    <div className="result-row__head">
                      <span className={`dot-status ${l.status}`} aria-hidden="true" />
                      <span className="row-title-sm">{l.title}</span>
                      <span className="meta">{l.status === 'complete' ? `Done ${day(l.completedAt)}` : l.status === 'started' ? 'Started' : 'Not started'}</span>
                      {l.quizPassed !== null && <span className={`qc-tag ${l.quizPassed ? 'is-pass' : 'is-open'}`}>{l.quizPassed ? 'Quiz passed' : l.quiz.some((q) => q.answered) ? 'Quiz: not yet right' : 'Quiz not taken'}</span>}
                    </div>
                    {l.quiz.some((q) => q.answered) && (
                      <ul className="quiz-results">
                        {l.quiz.map((q) => (
                          <li key={q.id} className="body-xs">
                            <span className="text-slate">{q.prompt}</span>
                            <br />
                            {q.answered ? (
                              <>
                                {q.correct ? '✓' : '✗'} Answered “{q.answer}”
                                {!q.correct && <> (right answer: “{q.rightAnswer}”)</>}
                                {'  ·  '}{q.attempts === 1 ? '1 try' : `${q.attempts} tries`}{q.firstTry ? ', right first time' : ''}
                              </>
                            ) : 'Not answered'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {sec.sectionQuiz && (
                  <li className="result-row">
                    <div className="result-row__head">
                      <span className={`dot-status ${sec.sectionQuiz.passed ? 'complete' : sec.sectionQuiz.tries ? 'started' : 'not_started'}`} aria-hidden="true" />
                      <span className="row-title-sm">Section quiz</span>
                      <span className="meta">
                        {sec.sectionQuiz.tries ? `${sec.sectionQuiz.tries} ${sec.sectionQuiz.tries === 1 ? 'try' : 'tries'}  ·  best ${sec.sectionQuiz.best}%  ·  pass mark ${sec.sectionQuiz.passPercent}%` : 'Not taken'}
                      </span>
                      <span className={`qc-tag ${sec.sectionQuiz.passed ? 'is-pass' : 'is-open'}`}>{sec.sectionQuiz.passed ? 'Passed' : sec.sectionQuiz.tries ? 'Not passed yet' : 'Not taken'}</span>
                    </div>
                    {sec.sectionQuiz.history.length > 0 && (
                      <ul className="quiz-results">
                        {sec.sectionQuiz.history.map((h, k) => (
                          <li key={k} className="body-xs">{h.passed ? '✓' : '✗'} {h.percent}%  ·  {day(h.at)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </SectionDisclosure>
          )
        })}
      </section>

      <section className="card table-card" aria-labelledby="ck-title">
        <h2 id="ck-title" className="card-serif">{terms.checklist}</h2>
        {r.checklist.length === 0 ? <p className="body-sm">No checklist items for this person.</p> : (
          <ul className="result-list">
            {r.checklist.map((c) => (
              <li key={c.id} className="result-row result-row__head">
                <span className={`ck-mark ${c.done ? 'is-done' : ''}`} aria-hidden="true">{c.done && <CheckIcon size={12} />}</span>
                <span className="body-sm-dark">{c.title}{c.section && <span className="body-xs">  ·  {c.section}</span>}</span>
                <span className="meta">{c.done ? day(c.doneAt) : 'Not done'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function SectionDisclosure({ title, meta, startOpen, children }: { title: string; meta: string; startOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  return <Disclosure title={title} meta={meta} open={open} onToggle={setOpen}>{children}</Disclosure>
}

function PaperworkCard({ r, reload }: { r: PersonRecord; reload: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!r.paperwork.length) return null
  const delFile = async (subId: number) => {
    if (!window.confirm('Delete the stored copy? Do this once it’s in your payroll system. The record that it was handed in stays.')) return
    setBusy(subId)
    setError(null)
    try {
      await api.deleteSubmissionFile(subId)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="card table-card" aria-labelledby="pw-title">
      <h2 id="pw-title" className="card-serif">Paperwork</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="result-list">
        {r.paperwork.map((f) => (
          <li key={f.id} className="result-row result-row__head">
            <span className={`ck-mark ${f.status === 'done' ? 'is-done' : ''}`} aria-hidden="true">{f.status === 'done' && <CheckIcon size={12} />}</span>
            <span className="body-sm-dark">
              {f.title}
              <span className="body-xs">  ·  {f.kind === 'sign' ? 'Agreement' : 'Form'}{f.required ? '' : ', optional'}</span>
            </span>
            <span className="meta">
              {f.status === 'todo' && 'Not yet'}
              {f.status === 'resign' && 'Signed an older version'}
              {f.status === 'done' && f.submission && (f.kind === 'sign' ? `Signed ${day(f.submission.submittedAt)} as “${f.submission.typedName}”` : `Handed in ${day(f.submission.submittedAt)}`)}
            </span>
            <span className="cell-actions">
              {f.submission && f.kind === 'sign' && <Link className="btn-ghost-text" to={`/paperwork/record/${f.submission.id}`}>Signed copy</Link>}
              {f.submission && f.kind === 'upload' && (f.submission.hasFile ? (
                <>
                  <a className="btn-ghost-text" href={submissionFileUrl(f.submission.id)}>Download {f.submission.fileType}</a>
                  <button type="button" className="btn-ghost-text text-btn" disabled={busy === f.submission.id} onClick={() => delFile(f.submission!.id)}>Delete copy</button>
                </>
              ) : <span className="body-xs">Copy deleted {day(f.submission.fileDeletedAt)}</span>)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
