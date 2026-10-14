import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { TopBar } from '../components/Shell'
import { CheckIcon } from '../components/Icons'
import { PageHead } from '../components/ui'
import { weekLabel } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useTerms } from '../lib/terms'
import { useAuth } from '../auth'
import { relativeDate } from '../lib/format'
import { ReplyForm, Replies } from '../components/Thread'
import { useScrollToHash } from '../lib/useScrollToHash'
import { ClientMessagingLink } from '../components/ClientMessagingLink'

export function SupportPage() {
  const terms = useTerms()
  const [params] = useSearchParams()
  const weeks = useApi(() => api.weeks())
  const mine = useApi(() => api.myQuestions())
  useScrollToHash(Boolean(mine.data))
  const [body, setBody] = useState('')
  const [lessonId, setLessonId] = useState(params.get('lesson') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const bodyId = useId()
  const lessonSel = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) {
      setError('Write your question first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.ask(body.trim(), lessonId ? Number(lessonId) : null)
      setSent(true)
      setBody('')
      mine.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your question.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar />
      <PageHead label="SUPPORT" title="Ask a question">
        Questions go to your {terms.lead} and the {terms.org} admins. Answers show up below, and the bell lets you know.
      </PageHead>
      <div className="support-grid">
        <section className="card form-card" aria-labelledby="ask-title">
          {sent ? (
            <div className="confirm" role="status">
              <span className="confirm__icon" aria-hidden="true"><CheckIcon /></span>
              <h2 id="ask-title" className="card-serif">Question sent.</h2>
              <p className="body-sm">Your {terms.lead} has been notified. Their answer will appear under “Your questions”, and the bell will let you know.</p>
              <button type="button" className="btn btn--ghost" onClick={() => setSent(false)}>
                Ask another question
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="stack-18">
              <h2 id="ask-title" className="card-serif">Your question</h2>
              <div className="field">
                <label htmlFor={lessonSel} className="link-slate">About a lesson (optional)</label>
                <select id={lessonSel} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                  <option value="">General question</option>
                  {(weeks.data ?? []).map((w) => (
                    <optgroup key={w.id} label={weekLabel(w)}>
                      {w.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={bodyId} className="link-slate">Question</label>
                <textarea id={bodyId} className="input textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
              </div>
              <p className="form-error" role="alert">{error}</p>
              <div>
                <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Sending…' : 'Send question'}</button>
              </div>
            </form>
          )}
        </section>
        <aside className="stack-18" aria-label="About support">
        <ClientMessagingLink />
        <div className="card ask-card">
          <h2 className="card-serif">Urgent or clinical risk?</h2>
          <p className="body-sm-dark">
            Don’t wait on a reply here. Follow your {terms.org}’s urgent-situations policy in Resources and call your {terms.lead} directly.
          </p>
        </div>
        </aside>
      </div>
      <MyQuestions list={mine.data ?? []} loading={mine.loading && !mine.data} reload={mine.reload} />
    </>
  )
}

function MyQuestions({ list, loading, reload }: { list: import('../api').MyQuestion[]; loading: boolean; reload: () => void }) {
  const { me } = useAuth()
  if (loading || !list.length) return null
  return (
    <section className="card table-card" aria-labelledby="mine-title">
      <div className="table-card__head">
        <h2 id="mine-title" className="card-serif">Your questions</h2>
        <p className="meta">{list.length}</p>
      </div>
      <ul className="q-list">
        {list.map((q) => (
          <li key={q.id} id={`q-${q.id}`} className="q-item q-anchor">
            <div className="q-item__body">
              <p className="meta">
                {relativeDate(q.createdAt)}
                {q.lessonTitle ? `  ·  ${q.lessonTitle}` : ''}
                {q.resolvedAt ? '  ·  Resolved' : q.replies?.length ? '  ·  Answered' : '  ·  Waiting for an answer'}
              </p>
              <p className="body-sm-dark prewrap">{q.body}</p>
              <Replies replies={q.replies} />
              {me && <ReplyForm questionId={q.id} label="Follow up" onSent={reload} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
