// Admin › Content: the whole onboarding as an outline, section by section. Open a step to edit it on the
// page itself. Checklist and library files live on their own tabs so this page stays simple.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  api, type AdminChecklistItem, type AdminContent, type AdminLesson, type AdminWeek, type SourceLink, type JobPosition,
} from '../../api'
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, EditIcon, PlusIcon, QuizIcon, TrashIcon, UploadIcon, VideoIcon } from '../../components/Icons'
import { TopBar } from '../../components/Shell'
import { EmptyState, ErrorState, FileTile, PageHead, Spinner } from '../../components/ui'
import { fileMeta, weekLabel } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useTerms } from '../../lib/terms'
import { cleanLinks, LinksEditor } from '../../components/SourceLinks'
import { EditorActions, Feedback, TextField, useAction } from './adminUi'

type Tab = 'steps' | 'checklist' | 'files'

export function AdminContentPage() {
  const terms = useTerms()
  const content = useApi(() => api.adminContent())
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = (['steps', 'checklist', 'files'].includes(params.get('tab') ?? '') ? params.get('tab') : 'steps') as Tab

  // Old links (?step=12) open the step editor.
  useEffect(() => {
    const step = params.get('step')
    if (step) navigate(`/admin/content/step/${step}`, { replace: true })
  }, [params, navigate])

  if (content.loading && !content.data) return <><TopBar /><Spinner label="Loading content" /></>
  if (content.error || !content.data) return <><TopBar /><ErrorState message={content.error ?? 'No data.'} onRetry={content.reload} /></>
  const data = content.data
  const steps = data.weeks.reduce((n, w) => n + w.lessons.length, 0)
  const TABS: [Tab, string][] = [['steps', `Sections and steps (${steps})`], ['checklist', `${terms.checklist} checklist (${data.checklist.length})`], ['files', `Files (${data.resources.length})`]]

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Content">
        Your onboarding, section by section. Open any step to edit it right on the page, the way your {terms.members} see it.
      </PageHead>
      <div className="filter-tabs content-tabs" role="tablist" aria-label="Content">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`filter-tab${tab === k ? ' is-active' : ''}`} onClick={() => setParams(k === 'steps' ? {} : { tab: k })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'steps' && <Outline weeks={data.weeks} onChange={content.reload} />}
      {tab === 'checklist' && <ChecklistEditor positions={data.positions ?? []} items={data.checklist} onChange={content.reload} />}
      {tab === 'files' && <ResourcesEditor content={data} onChange={content.reload} />}
    </>
  )
}

// ---------------- Outline ----------------

function chipsOf(l: AdminLesson): { text: string; tone: 'ok' | 'todo' | 'plain' }[] {
  const b = l.blocks ?? []
  const out: { text: string; tone: 'ok' | 'todo' | 'plain' }[] = []
  if (b.some((x) => x.type === 'video')) out.push(l.videoUrl ? { text: 'Video', tone: 'ok' } : { text: 'Video to record', tone: 'todo' })
  if (l.quiz?.length) out.push({ text: 'Quick check', tone: 'plain' })
  if (b.some((x) => x.type === 'form')) out.push({ text: 'Paperwork', tone: 'plain' })
  if (b.some((x) => x.type === 'app')) out.push({ text: 'Tool', tone: 'plain' })
  if (b.some((x) => x.type === 'files')) out.push({ text: 'Downloads', tone: 'plain' })
  return out
}

function Outline({ weeks, onChange }: { weeks: AdminWeek[]; onChange: () => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Which sections are open, remembered between visits. First visit: just the first one.
  const [open, setOpen] = useState<Set<number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('coa-outline-open') ?? 'null') as number[] | null
      if (Array.isArray(saved)) return new Set(saved)
    } catch { /* ignore */ }
    return new Set(weeks[0] ? [weeks[0].id] : [])
  })
  useEffect(() => { localStorage.setItem('coa-outline-open', JSON.stringify([...open])) }, [open])

  const send = async (next: { id: number; lessonIds: number[] }[]) => {
    setMoving(true)
    setError(null)
    try {
      await api.saveOutline(next)
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reorder.')
    } finally {
      setMoving(false)
    }
  }
  const order = () => weeks.map((w) => ({ id: w.id, lessonIds: w.lessons.map((l) => l.id) }))
  const moveSection = (i: number, d: number) => {
    const next = order()
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    void send(next)
  }
  const moveStep = (wi: number, li: number, d: number) => {
    const next = order()
    const list = next[wi]!.lessonIds
    const j = li + d
    if (j >= 0 && j < list.length) [list[li], list[j]] = [list[j]!, list[li]!]
    else {
      const target = next[wi + d]
      if (!target) return
      const [id] = list.splice(li, 1)
      if (d < 0) target.lessonIds.push(id!)
      else target.lessonIds.unshift(id!)
    }
    void send(next)
  }

  // Every step's number across the whole course, so numbers stay right while searching.
  const numbers = new Map<number, number>()
  weeks.flatMap((w) => w.lessons).forEach((l, i) => numbers.set(l.id, i + 1))
  const q = query.trim().toLowerCase()
  const matches = (text: string) => !q || text.toLowerCase().includes(q)
  const shown = weeks
    .map((w, wi) => {
      const sectionHit = matches(`${w.title} ${w.subtitle}`)
      const lessons = w.lessons.map((l, li) => ({ l, li })).filter(({ l }) => sectionHit || matches(`${l.title} ${l.label}`))
      return { w, wi, lessons }
    })
    .filter((x) => !q || x.lessons.length)
  const allSteps = weeks.flatMap((w) => w.lessons)
  const toRecord = allSteps.filter((l) => (l.blocks ?? []).some((b) => b.type === 'video') && !l.videoUrl).length
  const quizzesOn = weeks.filter((w) => w.quiz?.active).length
  const isOpen = (id: number) => Boolean(q) || open.has(id)
  const toggle = (id: number) => setOpen((o) => { const next = new Set(o); if (next.has(id)) next.delete(id); else next.add(id); return next })

  return (
    <div className="co">
      <div className="co-bar">
        <p className="co-summary">
          <span><strong>{weeks.length}</strong> sections</span>
          <span><strong>{allSteps.length}</strong> steps</span>
          <span><strong>{quizzesOn}</strong> of {weeks.length} quizzes on</span>
          {toRecord > 0 && <Link className="co-summary__todo" to="/admin/videos"><VideoIcon size={13} /> <strong>{toRecord}</strong> videos to record&nbsp;→</Link>}
        </p>
        <div className="co-bar__tools">
          <label className="sr-only" htmlFor="co-find">Find a step</label>
          <input id="co-find" className="input co-find" type="search" placeholder="Find a step or section" value={query} onChange={(e) => setQuery(e.target.value)} />
          {!q && (
            <button type="button" className="btn-ghost-text text-btn" onClick={() => setOpen(open.size === weeks.length ? new Set() : new Set(weeks.map((w) => w.id)))}>
              {open.size === weeks.length ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{moving ? 'Saving the new order…' : q ? `${shown.reduce((n, x) => n + x.lessons.length, 0)} steps match` : ''}</p>
      {weeks.length === 0 && editing !== 'new' && <EmptyState title="No sections yet">Add your first section, then add steps to it.</EmptyState>}
      {q && !shown.length && <EmptyState title="Nothing matches">Try another word, or clear the search.</EmptyState>}
      {shown.map(({ w, wi, lessons }) => {
        const opened = isOpen(w.id)
        const record = w.lessons.filter((l) => (l.blocks ?? []).some((b) => b.type === 'video') && !l.videoUrl).length
        return (
          <section key={w.id} className={`card co-section ${opened ? 'is-open' : ''}`} aria-labelledby={`sec-${w.id}`}>
            {editing === w.id ? (
              <SectionForm week={w} onDone={(changed) => { setEditing(null); if (changed) onChange() }} />
            ) : (
              <header className="co-section__head">
                <button type="button" className="co-toggle" aria-expanded={opened} aria-controls={`sec-body-${w.id}`} onClick={() => toggle(w.id)} disabled={Boolean(q)}>
                  <ChevronDownIcon className="co-toggle__chev" size={16} />
                  <span className="pw-title">
                    {w.subtitle?.trim() ? <span className="pw-kicker">{w.title}</span> : null}
                    <span id={`sec-${w.id}`} className="pw-name">{w.subtitle?.trim() || w.title}</span>
                  </span>
                </button>
                <span className="co-meta">
                  <span className="meta">{w.lessons.length} {w.lessons.length === 1 ? 'step' : 'steps'}</span>
                  {record > 0 && <span className="co-chip co-chip--todo"><VideoIcon size={12} />{record} to record</span>}
                  <span className={`co-chip ${w.quiz?.active ? 'co-chip--ok' : 'co-chip--plain'}`}><QuizIcon size={12} />{w.quiz?.active ? 'Quiz on' : 'No quiz'}</span>
                </span>
                <span className="co-tools co-tools--section">
                  <button type="button" className="icon-btn" onClick={() => setEditing(w.id)} aria-label={`Rename ${weekLabel(w)}`}><EditIcon /></button>
                  {!q && <button type="button" className="icon-btn" disabled={moving || wi === 0} onClick={() => moveSection(wi, -1)} aria-label={`Move ${weekLabel(w)} up`}><ArrowUpIcon /></button>}
                  {!q && <button type="button" className="icon-btn" disabled={moving || wi === weeks.length - 1} onClick={() => moveSection(wi, 1)} aria-label={`Move ${weekLabel(w)} down`}><ArrowDownIcon /></button>}
                </span>
              </header>
            )}
            {opened && (
              <div id={`sec-body-${w.id}`} className="co-body">
                <ol className="co-steps">
                  {lessons.map(({ l, li }) => (
                    <li key={l.id} className="co-step">
                      <span className="co-step__n" aria-hidden="true">{numbers.get(l.id)}</span>
                      <Link className="co-step__main" to={`/admin/content/step/${l.id}`}>
                        <span className="row-title-sm">{l.title}</span>
                        <span className="co-chips">
                          {chipsOf(l).map((c) => (
                            <span key={c.text} className={`co-chip co-chip--${c.tone}`}>{c.text === 'Video' || c.text === 'Video to record' ? <VideoIcon size={12} /> : null}{c.text}</span>
                          ))}
                          {!chipsOf(l).length && <span className="body-xs">Reading</span>}
                        </span>
                      </Link>
                      {!q && (
                        <span className="co-tools co-tools--step">
                          <button type="button" className="icon-btn" disabled={moving || (wi === 0 && li === 0)} onClick={() => moveStep(wi, li, -1)} aria-label={`Move ${l.title} up`}><ArrowUpIcon /></button>
                          <button type="button" className="icon-btn" disabled={moving || (wi === weeks.length - 1 && li === w.lessons.length - 1)} onClick={() => moveStep(wi, li, 1)} aria-label={`Move ${l.title} down`}><ArrowDownIcon /></button>
                        </span>
                      )}
                      <Link className="link-slate co-step__edit" to={`/admin/content/step/${l.id}`} aria-hidden="true" tabIndex={-1}>Edit&nbsp;→</Link>
                    </li>
                  ))}
                </ol>
                {!q && <Link className="co-add-step" to={`/admin/content/new?section=${w.id}`}><PlusIcon /> Add a step to {w.subtitle?.trim() || w.title}</Link>}
                {!q && (
                  <Link className={`co-quiz ${w.quiz?.active ? 'is-on' : ''}`} to={`/admin/content/quiz/${w.id}`}>
                    <span className="co-quiz__icon" aria-hidden="true"><QuizIcon size={16} /></span>
                    <span className="co-quiz__text">
                      <span className="row-title-sm">Section quiz</span>
                      <span className="body-xs">
                        {w.quiz?.active
                          ? `${w.quiz.drawCount} of ${w.quiz.poolSize} questions each try  ·  pass mark ${w.quiz.passPercent}%${wi < weeks.length - 1 ? '  ·  locks the next section' : '  ·  final check'}`
                          : w.quiz?.poolSize
                            ? `Off  ·  ${w.quiz.poolSize} questions ready`
                            : wi < weeks.length - 1 ? 'None yet. Add one so staff must pass before the next section.' : 'None yet. Add one as a final check.'}
                      </span>
                    </span>
                    <span className="link-slate" aria-hidden="true">{w.quiz?.poolSize ? 'Edit' : 'Set up'}&nbsp;→</span>
                  </Link>
                )}
              </div>
            )}
          </section>
        )
      })}
      {!q && (editing === 'new' ? (
        <section className="card co-section"><SectionForm week={null} onDone={(changed) => { setEditing(null); if (changed) onChange() }} /></section>
      ) : (
        <button type="button" className="pb-add co-add-section" onClick={() => setEditing('new')}><PlusIcon /> Add a section</button>
      ))}
    </div>
  )
}

function SectionForm({ week, onDone }: { week: AdminWeek | null; onDone: (changed: boolean) => void }) {
  const [title, setTitle] = useState(week?.title ?? '')
  const [subtitle, setSubtitle] = useState(week?.subtitle ?? '')
  const [links, setLinks] = useState<SourceLink[]>(week?.links ?? [])
  const a = useAction()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = { title: title.trim(), subtitle: subtitle.trim(), links: cleanLinks(links) }
    void a.run(async () => {
      if (week) await api.updateWeek(week.id, body)
      else await api.createWeek(body)
      onDone(true)
    })
  }
  const remove = () => {
    if (!week) return
    if (!window.confirm(`Delete “${weekLabel(week)}”${week.lessons.length ? ` and its ${week.lessons.length} steps` : ''}? This can’t be undone.`)) return
    void a.run(async () => {
      await api.deleteWeek(week.id)
      onDone(true)
    })
  }
  return (
    <form onSubmit={submit} className="stack-18 co-form">
      <h2 className="card-serif">{week ? 'Rename section' : 'New section'}</h2>
      <div className="form-grid">
        <TextField label="Small label" value={title} onChange={setTitle} required placeholder="Part 05" />
        <TextField label="Name" value={subtitle} onChange={setSubtitle} placeholder="Billing and insurance" />
      </div>
      <LinksEditor label="Section materials (links shown on every step in this section)" links={links} onChange={setLinks} />
      <EditorActions busy={a.busy} onCancel={() => onDone(false)} onDelete={week ? remove : undefined} saveLabel={week ? 'Save section' : 'Add section'} />
      <Feedback error={a.error} ok={a.ok} />
    </form>
  )
}

// ---------------- Resources ----------------

function ResourcesEditor({ content, onChange }: { content: AdminContent; onChange: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Resource')
  const [lessonId, setLessonId] = useState('')
  const a = useAction()
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = { file: useId(), cat: useId(), lesson: useId() }
  const lessons = content.weeks.flatMap((w) => w.lessons.map((l) => ({ ...l, week: weekLabel(w) })))
  const lessonTitle = (id: number | null) => lessons.find((l) => l.id === id)?.title

  const upload = (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      void a.run(async () => { throw new Error('That file is over the 25 MB limit.') })
      return
    }
    void a.run(async () => {
      await api.uploadResource(file, { title: title.trim() || file.name.replace(/\.[^.]+$/, ''), category, lessonId: lessonId ? Number(lessonId) : null })
      setFile(null)
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      onChange()
    }, 'Uploaded')
  }

  const remove = (id: number, t: string) => {
    if (!window.confirm(`Delete “${t}”? The file is removed for everyone.`)) return
    void a.run(async () => {
      await api.deleteResource(id)
      onChange()
    }, 'Deleted')
  }

  return (
    <section className="card table-card" aria-labelledby="res-ed-title">
      <div className="table-card__head">
        <h2 id="res-ed-title" className="card-serif">Resources</h2>
        <p className="meta">{content.resources.length} files</p>
      </div>
      <form className="form-grid" onSubmit={upload}>
        <div className="field form-grid__full">
          <label htmlFor={ids.file} className="link-slate">File</label>
          <input
            id={ids.file}
            ref={fileRef}
            className="input input--file"
            type="file"
            required
            accept=".pdf,.docx,.doc,.xlsx,.pptx,.zip,.png,.jpg,.jpeg,.txt,.mp4"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
            }}
          />
          <p className="body-xs">PDF, Word, Excel, PowerPoint, ZIP, PNG, JPG, TXT or MP4. Up to 25 MB.</p>
        </div>
        <TextField label="Title" value={title} onChange={setTitle} required />
        <div className="field">
          <label htmlFor={ids.cat} className="link-slate">Category</label>
          <select id={ids.cat} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="Resource">Resource</option>
            <option value="Policy">Policy</option>
          </select>
        </div>
        <div className="field form-grid__full">
          <label htmlFor={ids.lesson} className="link-slate">Attach to lesson <span className="body-xs">(optional)</span></label>
          <select id={ids.lesson} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">Library only</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.week}: {l.title}</option>)}
          </select>
        </div>
        <div className="form-grid__full">
          <button type="submit" className="btn btn--dark" disabled={a.busy || !file}>
            <UploadIcon /> {a.busy ? 'Uploading…' : 'Upload file'}
          </button>
        </div>
      </form>
      <Feedback error={a.error} ok={a.ok} />
      {content.resources.length === 0 ? (
        <EmptyState title="No files yet">Upload a handbook, template or policy above.</EmptyState>
      ) : (
        <ul className="admin-files">
          {content.resources.map((r) => (
            <li key={r.id} className="admin-file">
              <FileTile resource={r} small />
              <span className="file-card__text">
                <span className="row-title-sm">{r.title}</span>
                <span className="body-xs">
                  {fileMeta(r)}  ·  {r.category}
                  {r.lessonId ? `  ·  ${lessonTitle(r.lessonId) ?? 'Lesson'}` : ''}
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Delete ${r.title}`} onClick={() => remove(r.id, r.title)}>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------- Checklist ----------------

function ChecklistEditor({ items, positions, onChange }: { items: AdminChecklistItem[]; positions: JobPosition[]; onChange: () => void }) {
  const terms = useTerms()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | 'shared' | number>('all')
  const shown = items.filter((it) => filter === 'all' || (filter === 'shared' ? !it.positionId : it.positionId === filter))
  const nameOf = (id?: number | null) => positions.find((p) => p.id === id)?.name
  // Group by section, keeping the order items first appear in.
  const groups: { section: string; items: AdminChecklistItem[] }[] = []
  for (const it of shown) {
    const key = it.section || ''
    const g = groups.find((x) => x.section === key) ?? (groups.push({ section: key, items: [] }), groups[groups.length - 1])
    g.items.push(it)
  }
  const done = (changed: boolean) => { setEditing(null); if (changed) onChange() }

  return (
    <section className="card table-card" aria-labelledby="ck-ed-title">
      <div className="table-card__head">
        <h2 id="ck-ed-title" className="card-serif">{terms.checklist} (checklist)</h2>
        <button type="button" className="btn btn--ghost btn--small-ghost" onClick={() => setEditing('new')}>
          <PlusIcon /> Item
        </button>
      </div>
      <PositionsManager positions={positions} onChange={onChange} />
      <div className="filter-tabs" role="tablist" aria-label="Show checklist items for">
        {([['all', 'All'], ['shared', 'Everyone'], ...positions.map((p) => [p.id, p.name] as const)] as const).map(([k, label]) => (
          <button key={String(k)} type="button" role="tab" aria-selected={filter === k} className={`filter-tab${filter === k ? ' is-active' : ''}`} onClick={() => setFilter(k as typeof filter)}>
            {label}
          </button>
        ))}
      </div>
      {editing === 'new' && <ChecklistForm item={null} positions={positions} defaultPositionId={typeof filter === 'number' ? filter : null} nextPosition={items.length + 1} onDone={done} />}
      {shown.length === 0 && editing !== 'new' && <EmptyState title="No checklist items here" />}
      {groups.map((g) => (
        <div key={g.section || '_'} className="ck-group">
          {g.section && <p className="label-muted ck-group__head">{g.section.toUpperCase()}</p>}
          <ol className="ck-admin">
            {g.items.map((it) =>
              editing === it.id ? (
                <li key={it.id}>
                  <ChecklistForm item={it} positions={positions} defaultPositionId={null} nextPosition={items.length + 1} onDone={done} />
                </li>
              ) : (
                <li key={it.id} className="ck-admin__row">
                  <span className="meta ck-admin__n">{it.position}</span>
                  <span className="ck-admin__text">
                    <span className="row-title-sm">{it.title}</span>
                    {it.detail && <span className="body-xs">{it.detail}</span>}
                  </span>
                  <span className="signin-tag">{nameOf(it.positionId) ?? 'Everyone'}</span>
                  <button type="button" className="icon-btn" onClick={() => setEditing(it.id)} aria-label={`Edit ${it.title}`}><EditIcon /></button>
                </li>
              ),
            )}
          </ol>
        </div>
      ))}
    </section>
  )
}

/** Add, rename and remove job positions (e.g. Associate, Intern). */
function PositionsManager({ positions, onChange }: { positions: JobPosition[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const a = useAction()
  const id = useId()
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    void a.run(async () => {
      await api.createPosition(name.trim())
      setName('')
      onChange()
    })
  }
  const rename = (p: JobPosition) => {
    const next = window.prompt('Rename position', p.name)?.trim()
    if (!next || next === p.name) return
    void a.run(async () => { await api.renamePosition(p.id, next); onChange() })
  }
  const remove = (p: JobPosition) => {
    if (!window.confirm(`Remove the “${p.name}” position?${p.people ? ` ${p.people} ${p.people === 1 ? 'person' : 'people'} will have no position.` : ''}`)) return
    void a.run(async () => { await api.deletePosition(p.id); onChange() })
  }
  return (
    <div className="positions">
      <p className="body-sm">Positions get their own checklist items on top of the ones for everyone. Pick a person’s position when you invite them.</p>
      <ul className="positions__list">
        {positions.map((p) => (
          <li key={p.id} className="position-chip">
            <span className="row-title-sm">{p.name}</span>
            <span className="meta">{p.items} items · {p.people} {p.people === 1 ? 'person' : 'people'}</span>
            <button type="button" className="icon-btn" aria-label={`Rename ${p.name}`} onClick={() => rename(p)}><EditIcon /></button>
            <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => remove(p)}><TrashIcon /></button>
          </li>
        ))}
      </ul>
      <form className="positions__add" onSubmit={add}>
        <label htmlFor={id} className="sr-only">New position name</label>
        <input id={id} className="input" placeholder="Add a position, e.g. Associate" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn--ghost btn--small-ghost" disabled={a.busy || !name.trim()}><PlusIcon /> Add</button>
      </form>
      <Feedback error={a.error} ok={null} />
    </div>
  )
}

function ChecklistForm({ item, positions, defaultPositionId, nextPosition, onDone }: {
  item: AdminChecklistItem | null; positions: JobPosition[]; defaultPositionId: number | null; nextPosition: number; onDone: (changed: boolean) => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [detail, setDetail] = useState(item?.detail ?? '')
  const [section, setSection] = useState(item?.section ?? '')
  const [positionId, setPositionId] = useState<string>(String(item ? item.positionId ?? '' : defaultPositionId ?? ''))
  const [order, setOrder] = useState(String(item?.position ?? nextPosition))
  const a = useAction()
  const first = useRef<HTMLDivElement>(null)
  const selId = useId()
  useEffect(() => {
    first.current?.querySelector('input')?.focus()
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = {
      title: title.trim(), detail: detail.trim(), section: section.trim(),
      positionId: positionId ? Number(positionId) : null, position: Number(order) || 0,
    }
    void a.run(async () => {
      if (item) await api.updateChecklist(item.id, body)
      else await api.createChecklist(body)
      onDone(true)
    })
  }
  const remove = () => {
    if (!item || !window.confirm(`Delete “${item.title}”?`)) return
    void a.run(async () => {
      await api.deleteChecklist(item.id)
      onDone(true)
    })
  }
  return (
    <form className="ck-form stack-18" onSubmit={submit}>
      <div className="form-grid" ref={first}>
        <TextField label="Title" value={title} onChange={setTitle} required />
        <TextField label="Order" type="number" value={order} onChange={setOrder} required />
        <TextField label="Section" value={section} onChange={setSection} placeholder="Supervision and hours" />
        <div className="field">
          <label htmlFor={selId} className="link-slate">Who it’s for</label>
          <select id={selId} className="input" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            <option value="">Everyone</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
          </select>
        </div>
        <div className="form-grid__full">
          <TextField label="Detail" value={detail} onChange={setDetail} placeholder="What to collect or verify" />
        </div>
      </div>
      <EditorActions busy={a.busy} onCancel={() => onDone(false)} onDelete={item ? remove : undefined} saveLabel={item ? 'Save item' : 'Add item'} />
      <Feedback error={a.error} ok={a.ok} />
    </form>
  )
}
