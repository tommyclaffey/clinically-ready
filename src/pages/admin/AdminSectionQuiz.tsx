// Admin › Content › a section's quiz. Build the question pool, choose how many questions each try draws and the
// pass mark, and switch it on. Staff can't open the next section until they pass.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type AdminSectionQuiz, type PoolQuestion, type QuizDraft } from '../../api'
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { TopBar } from '../../components/Shell'
import { ErrorState, Label, Spinner } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { SideField, Switch } from './adminUi'
import { blankQuestion, cleanQuestion, QuestionForm } from './blockKit'

export function AdminSectionQuizPage() {
  const { weekId = '' } = useParams()
  const quiz = useApi(() => api.adminSectionQuiz(weekId), [weekId])
  if (quiz.loading && !quiz.data) return <><TopBar /><Spinner label="Loading the quiz" /></>
  if (quiz.error || !quiz.data) return <><TopBar /><ErrorState message={quiz.error ?? 'Not found.'} onRetry={quiz.reload} /></>
  return <QuizBuilder data={quiz.data} setData={(d) => quiz.setData(d)} />
}

function QuizBuilder({ data, setData }: { data: AdminSectionQuiz; setData: (d: AdminSectionQuiz) => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(data.questions.length ? null : 'new')
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const s = data.settings
  const name = data.section.subtitle || data.section.title
  const weekId = data.section.id
  const passNeeded = Math.ceil((s.drawCount * s.passPercent) / 100 - 1e-9)

  const run = async (fn: () => Promise<AdminSectionQuiz>, ok: string) => {
    setError(null)
    setStatus('Saving…')
    try {
      const d = await fn()
      setData(d)
      setStatus(d.added !== undefined ? (d.added ? `Added ${d.added} question${d.added === 1 ? '' : 's'}.` : 'Nothing new to add.') : ok)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      setStatus('')
      return false
    }
  }
  const settings = (b: { enabled?: boolean; drawCount?: number; passPercent?: number }) => void run(() => api.setSectionQuiz(weekId, b), 'Saved. Staff see it now.')

  return (
    <>
      <TopBar
        bell={false}
        left={
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link className="body-sm crumb-link" to="/admin/content">Content</Link></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="body-sm">{data.section.title}{data.section.subtitle ? ` · ${data.section.subtitle}` : ''}</span></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="link-slate" aria-current="page">Section quiz</span></li>
            </ol>
          </nav>
        }
      />
      <div className="lesson-cols step-editor">
        <div className="lesson-col">
          <header className="lesson-title">
            <Label>SECTION QUIZ</Label>
            <h1 className="display-md">{name} quiz</h1>
            <p className="body-md">
              {s.active
                ? `On. Each try draws ${s.drawCount} of these ${s.poolSize} questions at random, with the answers shuffled. ${passNeeded} right passes.`
                : s.enabled
                  ? 'On, but there are no questions yet. Add some below.'
                  : 'Off. Build the question pool, then switch it on in the sidebar.'}
            </p>
          </header>

          <section className="card pool" aria-labelledby="pool-title">
            <div className="pool__head">
              <h2 id="pool-title" className="card-serif">Question pool <span className="meta">({data.questions.length})</span></h2>
              <div className="pool__actions">
                {data.importable > 0 && (
                  <button type="button" className="btn btn--ghost btn--small-ghost" onClick={() => void run(() => api.importPoolQuestions(weekId), '')}>
                    <PlusIcon /> Add {data.importable} from this section’s quick checks
                  </button>
                )}
                {editing !== 'new' && (
                  <button type="button" className="btn btn--dark btn--small" onClick={() => setEditing('new')}><PlusIcon /> New question</button>
                )}
              </div>
            </div>
            <p className="body-xs">Write more questions than each try asks, so a retake gets a fresh set. Twice as many is a good start.</p>

            {editing === 'new' && (
              <EditQuestion
                initial={blankQuestion()}
                saveLabel="Add to the pool"
                onCancel={data.questions.length ? () => setEditing(null) : undefined}
                onSave={async (q) => (await run(() => api.addPoolQuestion(weekId, q), 'Added to the pool.')) && setEditing(null)}
              />
            )}

            <ol className="pool__list">
              {data.questions.map((q, i) => (
                <li key={q.id}>
                  {editing === q.id ? (
                    <EditQuestion
                      initial={{ prompt: q.prompt, options: [...q.options], correctIndex: q.correctIndex, explanation: q.explanation }}
                      n={i + 1}
                      saveLabel="Save question"
                      onCancel={() => setEditing(null)}
                      onSave={async (nq) => (await run(() => api.updatePoolQuestion(q.id, nq), 'Saved.')) && setEditing(null)}
                      onDelete={() => {
                        if (!window.confirm('Remove this question from the pool? Past tries keep their copy.')) return
                        void run(() => api.deletePoolQuestion(q.id), 'Removed.').then((ok) => ok && setEditing(null))
                      }}
                    />
                  ) : (
                    <PoolRow q={q} n={i + 1} onEdit={() => setEditing(q.id)} />
                  )}
                </li>
              ))}
            </ol>
            {!data.questions.length && editing !== 'new' && <p className="body-sm">No questions yet.</p>}
          </section>
          <p className="sr-only" role="status" aria-live="polite">{status}</p>
        </div>

        <aside className="lesson-side" aria-label="Quiz settings">
          <section className="card side-card eb-side" aria-labelledby="qs-title">
            <h2 id="qs-title" className="card-serif">Settings</h2>
            <Switch
              label="Required to move on"
              hint={s.active ? 'Staff must pass it to open the next section' : s.enabled ? 'Add questions to start using it' : 'Off: the next section is open'}
              on={s.enabled}
              onChange={(on) => settings({ enabled: on })}
            />
            <SideField label="Questions per try" hint={s.poolSize && s.drawSetting > s.poolSize ? `Only ${s.poolSize} in the pool, so each try asks all ${s.poolSize}.` : `From a pool of ${s.poolSize}.`}>
              {(id) => (
                <div className="stepper">
                  <button type="button" className="icon-btn" aria-label="Fewer questions" disabled={s.drawSetting <= 1} onClick={() => settings({ drawCount: s.drawSetting - 1 })}>−</button>
                  <input id={id} className="input stepper__n" type="number" min={1} max={50} value={s.drawSetting} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 50) settings({ drawCount: n }) }} />
                  <button type="button" className="icon-btn" aria-label="More questions" disabled={s.drawSetting >= 50} onClick={() => settings({ drawCount: s.drawSetting + 1 })}>+</button>
                </div>
              )}
            </SideField>
            <SideField label="Pass mark" hint={`${passNeeded} of ${s.drawCount} right.`}>
              {(id) => (
                <select id={id} className="input" value={s.passPercent} onChange={(e) => settings({ passPercent: Number(e.target.value) })}>
                  {(s.passMarks ?? [60, 70, 75, 80, 85, 90, 100]).concat((s.passMarks ?? []).includes(s.passPercent) ? [] : [s.passPercent]).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m}%</option>)}
                </select>
              )}
            </SideField>
            <p className={error ? 'form-error' : 'meta save-status'} role={error ? 'alert' : undefined}>{error ?? status}</p>
          </section>

          <section className="card side-card eb-side" aria-labelledby="qr-title">
            <h2 id="qr-title" className="card-serif">Results</h2>
            <ul className="pool-stats">
              <li><span className="stat-sm">{data.stats.passed}</span><span className="body-xs">passed</span></li>
              <li><span className="stat-sm">{data.stats.people}</span><span className="body-xs">took it</span></li>
              <li><span className="stat-sm">{data.stats.tries}</span><span className="body-xs">tries</span></li>
            </ul>
            <p className="body-xs">Each person’s tries are on their page in Team progress. A question most people miss may need rewording.</p>
          </section>
        </aside>
      </div>
    </>
  )
}

function PoolRow({ q, n, onEdit }: { q: PoolQuestion; n: number; onEdit: () => void }) {
  const rate = q.asked ? Math.round((q.right / q.asked) * 100) : null
  return (
    <div className="pool-row">
      <span className="qf__n" aria-hidden="true">{n}</span>
      <div className="pool-row__body">
        <p className="row-title-sm">{q.prompt}</p>
        <p className="body-sm pool-row__right"><CheckIcon size={13} /> {q.options[q.correctIndex]}</p>
        <p className="body-xs">{q.options.length} answers  ·  {rate === null ? 'not asked yet' : `asked ${q.asked} ${q.asked === 1 ? 'time' : 'times'}  ·  ${rate}% got it right`}</p>
      </div>
      {rate !== null && rate < 50 && <span className="co-chip co-chip--todo">Often missed</span>}
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Edit question ${n}`}><EditIcon /></button>
    </div>
  )
}

function EditQuestion({ initial, n, saveLabel, onSave, onCancel, onDelete }: {
  initial: QuizDraft; n?: number; saveLabel: string; onSave: (q: QuizDraft) => Promise<unknown>; onCancel?: () => void; onDelete?: () => void
}) {
  const [q, setQ] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const c = cleanQuestion(q)
    if (c.error) return setError(c.error)
    setError(null)
    setBusy(true)
    await onSave(c.q)
    setBusy(false)
  }
  return (
    <div className="pool-edit">
      <QuestionForm value={q} onChange={setQ} n={n} autoFocus />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button type="button" className="btn btn--dark btn--small" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
        {onCancel && <button type="button" className="btn btn--ghost btn--small-ghost" onClick={onCancel}>Cancel</button>}
        {onDelete && <button type="button" className="btn btn--danger btn--small-ghost" onClick={onDelete}><TrashIcon /> Remove</button>}
      </div>
    </div>
  )
}
