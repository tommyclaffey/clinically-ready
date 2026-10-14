import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, normalizeQuestions, RESULTS_CSV_URL, type AdminQuestion } from '../../api'
import { DownloadIcon } from '../../components/Icons'
import { roleName, TopBar } from '../../components/Shell'
import { Avatar, EmptyState, ErrorState, PageHead, ProgressBar, Spinner } from '../../components/ui'
import { relativeDate } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { Replies, ReplyForm } from '../../components/Thread'
import { useScrollToHash } from '../../lib/useScrollToHash'
import { useTerms } from '../../lib/terms'

export function AdminHomePage() {
  const terms = useTerms()
  const team = useApi(() => api.adminTeam())
  const content = useApi(() => api.adminContent())
  const questions = useApi(async () => normalizeQuestions(await api.adminQuestions()))
  useScrollToHash(Boolean(questions.data))

  const totalLessons = content.data?.weeks.reduce((n, w) => n + w.lessons.length, 0) ?? null
  const totalChecklist = content.data?.checklist.length ?? null
  const users = (team.data?.users ?? []).filter((u) => u.active !== false && u.active !== 0)

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Team progress">
        Who’s where in onboarding, and the questions waiting on a reply. Click a name for their full results.
      </PageHead>

      <section className="card table-card" aria-labelledby="tp-title">
        <div className="table-card__head">
          <h2 id="tp-title" className="card-serif">Onboarding progress</h2>
          <span className="table-card__actions">
            <a className="btn btn--ghost btn--small" href={RESULTS_CSV_URL}><DownloadIcon /> Export results (CSV)</a>
            <Link className="link-slate" to="/admin/team">Invite someone&nbsp;&nbsp;→</Link>
          </span>
        </div>
        {team.loading && !team.data ? (
          <Spinner label="Loading team" />
        ) : team.error ? (
          <ErrorState message={team.error} onRetry={team.reload} />
        ) : users.length === 0 ? (
          <EmptyState title="No one on the team yet">Invite your first {terms.member} from Invites and roles.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="col-progress">Progress</th>
                  <th scope="col">Lessons done</th>
                  <th scope="col">Checklist</th>
                  <th scope="col">Paperwork</th>
                  <th scope="col">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">
                      <span className="cell-person">
                        <Avatar initials={u.initials} size={36} />
                        <span>
                          <Link className="row-title-sm person-link" to={`/admin/people/${u.id}`}>{u.name}</Link>
                          <span className="body-xs">{u.title}</span>
                        </span>
                      </span>
                    </th>
                    <td className="body-sm">{roleName(u.role, terms.member)}</td>
                    <td>
                      <span className="cell-progress">
                        <ProgressBar percent={u.progressPercent} label={`${u.name} progress`} />
                        <span className="meta">{Math.round(u.progressPercent)}%</span>
                      </span>
                    </td>
                    <td className="body-sm">{u.lessonsDone} / {u.lessonsTotal ?? totalLessons ?? '—'}</td>
                    <td className="body-sm">{u.checklistDone} / {u.checklistTotal ?? totalChecklist ?? '—'}</td>
                    <td className="body-sm">{u.paperworkTotal ? `${u.paperworkDone} / ${u.paperworkTotal}` : '—'}</td>
                    <td className="body-sm">{relativeDate(u.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <QuestionsCard
        loading={questions.loading && !questions.data}
        error={questions.error}
        reload={questions.reload}
        list={questions.data ?? []}
        onResolved={(id) =>
          questions.setData((qs) => (qs ?? []).map((q) => (q.id === id ? { ...q, resolvedAt: new Date().toISOString() } : q)))
        }
      />
    </>
  )
}

function QuestionsCard({
  loading, error, reload, list, onResolved,
}: { loading: boolean; error: string | null; reload: () => void; list: AdminQuestion[]; onResolved: (id: number) => void }) {
  const terms = useTerms()
  const [busy, setBusy] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const open = list.filter((q) => !q.resolvedAt)
  const resolved = list.filter((q) => q.resolvedAt)

  const resolve = async (id: number) => {
    setBusy(id)
    setActionError(null)
    try {
      await api.resolveQuestion(id)
      onResolved(id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not resolve that question.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card table-card" aria-labelledby="q-title">
      <div className="table-card__head">
        <h2 id="q-title" className="card-serif">Open questions</h2>
        <p className="meta">{open.length} open</p>
      </div>
      {loading ? (
        <Spinner label="Loading questions" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          {open.length === 0 ? (
            <EmptyState title="No open questions">When a {terms.member} asks something, it lands here.</EmptyState>
          ) : (
            <ul className="q-list">
              {open.map((q) => (
                <li key={q.id} id={`q-${q.id}`} className="q-item q-anchor">
                  <div className="q-item__body">
                    <p className="meta">
                      {q.askerName}  ·  {relativeDate(q.createdAt)}
                      {q.lessonTitle ? `  ·  ${q.lessonTitle}` : ''}
                    </p>
                    <p className="body-sm-dark prewrap">{q.body}</p>
                    <Replies replies={q.replies} />
                    <ReplyForm questionId={q.id} label={`Reply to ${q.askerName.split(' ')[0]}`} onSent={reload} />
                  </div>
                  <button type="button" className="btn btn--ghost btn--small-ghost" disabled={busy === q.id} onClick={() => void resolve(q.id)}>
                    {busy === q.id ? 'Saving…' : 'Mark resolved'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
          {resolved.length > 0 && (
            <div className="resolved">
              <button type="button" className="btn-ghost-text text-btn" aria-expanded={showResolved} onClick={() => setShowResolved((s) => !s)}>
                {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
              </button>
              {showResolved && (
                <ul className="q-list q-list--resolved">
                  {resolved.map((q) => (
                    <li key={q.id} id={`q-${q.id}`} className="q-item q-anchor">
                      <div className="q-item__body">
                        <p className="meta">
                          {q.askerName}  ·  resolved {relativeDate(q.resolvedAt)}
                          {q.lessonTitle ? `  ·  ${q.lessonTitle}` : ''}
                        </p>
                        <p className="body-sm prewrap">{q.body}</p>
                        <Replies replies={q.replies} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
