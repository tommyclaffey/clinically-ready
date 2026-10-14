// Admin › Content › one step. The editor IS the step page: same layout staff see, but you type straight into
// it. Hover between blocks and press + to add one; switch Video, Quick check and Downloads on or off in the
// sidebar. Nothing changes for staff until you press Save.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api, type AdminForm, type AdminLesson, type AdminWeek, type MyForm, type PageBlock, type PageBlockType, type QuizDraft, type Resource, type ToolApp,
} from '../../api'
import { AppCard } from '../../components/AppCard'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CloseIcon, DuplicateIcon, ExternalIcon, GripIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { Player } from '../../components/Player'
import { TopBar } from '../../components/Shell'
import { LinksEditor } from '../../components/SourceLinks'
import { VideoField } from '../../components/VideoField'
import { ErrorState, Spinner } from '../../components/ui'
import { weekLabel } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { FormCard } from '../Paperwork'
import { SideField, Switch } from './adminUi'
import { AutoText, blankQuestion, cleanBlocks, cleanQuestion, FilesBlockEditor, Picker, QuizEditor } from './blockKit'

// ---------- Route ----------

export function AdminStepPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const content = useApi(() => api.adminContent(), [id])
  if (content.loading && !content.data) return <><TopBar /><Spinner label="Loading step" /></>
  if (content.error || !content.data) return <><TopBar /><ErrorState message={content.error ?? 'No data.'} onRetry={content.reload} /></>
  const weeks = content.data.weeks
  const lesson = id ? weeks.flatMap((w) => w.lessons).find((l) => l.id === Number(id)) ?? null : null
  if (id && !lesson) return <><TopBar /><ErrorState message="That step was not found." /></>
  const defaultWeekId = lesson?.weekId ?? (Number(params.get('section')) || weeks[0]?.id || 0)
  if (!weeks.length) return <><TopBar /><ErrorState message="Add a section first, then add steps to it." /></>
  return <StepEditor key={lesson?.id ?? 'new'} lesson={lesson} weeks={weeks} resources={content.data.resources} defaultWeekId={defaultWeekId} />
}

// ---------- Block kinds ----------

type TextType = 'p' | 'h' | 'callout' | 'quote'
type ListType = 'list' | 'steps' | 'checklist' | 'takeaways' | 'dodont'
const TEXT_TYPES: TextType[] = ['p', 'h', 'callout', 'quote']
const LIST_TYPES: ListType[] = ['list', 'steps', 'checklist', 'takeaways', 'dodont']
const TEXT_LABEL: Record<TextType, string> = { p: 'Text', h: 'Heading', callout: 'Callout', quote: 'Quote' }
const LIST_LABEL: Record<ListType, string> = { list: 'Bullets', steps: 'Numbered', checklist: 'Checklist', takeaways: 'Key takeaways', dodont: 'Do and don’t' }
const isTextType = (t: string): t is TextType => (TEXT_TYPES as string[]).includes(t)
const isListType = (t: string): t is ListType => (LIST_TYPES as string[]).includes(t)
// Learner view puts runs of these in one reading card; the editor does the same.
const IN_READING = new Set(['p', 'h', 'callout', 'quote', 'list', 'steps', 'checklist', 'dodont'])

const MENU: { type: PageBlockType; label: string; hint: string }[] = [
  { type: 'p', label: 'Text', hint: 'A paragraph' },
  { type: 'h', label: 'Heading', hint: 'Starts a new part' },
  { type: 'list', label: 'List', hint: 'Bullets, numbers, checklist' },
  { type: 'video', label: 'Video', hint: 'YouTube, Vimeo, Loom, upload' },
  { type: 'links', label: 'Links', hint: 'Docs and websites' },
  { type: 'files', label: 'Downloads', hint: 'Files to download' },
  { type: 'quiz', label: 'Quick check', hint: 'Questions with answers' },
  { type: 'form', label: 'Paperwork', hint: 'Sign or hand in a form' },
  { type: 'app', label: 'Tool', hint: 'Open, download, bookmark' },
  { type: 'divider', label: 'Divider', hint: 'A line between parts' },
]
const ONCE = new Set<PageBlockType>(['quiz', 'files'])

function newBlock(type: PageBlockType, forms: AdminForm[], apps: ToolApp[]): PageBlock {
  switch (type) {
    case 'video': return { type, url: '', transcript: '' }
    case 'h': case 'p': case 'quote': case 'callout': return { type, text: '' }
    case 'list': case 'steps': case 'checklist': case 'takeaways': return { type, items: [''] }
    case 'dodont': return { type, do: [''], dont: [''] }
    case 'links': return { type, items: [{ label: '', url: '' }] }
    case 'form': return { type, formId: forms[0]?.id ?? 0 }
    case 'app': return { type, appId: apps[0]?.id ?? 0 }
    default: return { type } as PageBlock
  }
}

const itemsOf = (b: PageBlock): string[] => (b.type === 'dodont' ? [...b.do, ...b.dont] : 'items' in b && Array.isArray(b.items) && typeof b.items[0] !== 'object' ? (b.items as string[]) : [])
function asList(b: PageBlock, t: ListType): PageBlock {
  const items = itemsOf(b)
  return t === 'dodont' ? { type: 'dodont', do: items.length ? items : [''], dont: [''] } : { type: t, items: items.length ? items : [''] }
}

// ---------- The editor ----------

type Settings = { weekId: string; title: string; label: string; presenter: string; duration: string; summary: string }

function StepEditor({ lesson, weeks, resources, defaultWeekId }: {
  lesson: AdminLesson | null; weeks: AdminWeek[]; resources: Resource[]; defaultWeekId: number
}) {
  const navigate = useNavigate()
  const initial = () => ({
    settings: {
      weekId: String(lesson?.weekId ?? defaultWeekId), title: lesson?.title ?? '', label: lesson?.label ?? '',
      presenter: lesson?.presenter ?? '', duration: lesson?.durationMin ? String(lesson.durationMin) : '', summary: lesson?.overview ?? '',
    } as Settings,
    blocks: (lesson?.blocks ?? [{ type: 'video', url: '', transcript: '' }, { type: 'p', text: '' }]) as PageBlock[],
    quiz: (lesson?.quiz ?? []).map((q) => ({ prompt: q.prompt, options: [...q.options], correctIndex: q.correctIndex ?? 0, explanation: q.explanation ?? '' })) as QuizDraft[],
  })
  const [saved, setSaved] = useState(() => JSON.stringify(initial()))
  const [s, setS] = useState<Settings>(() => initial().settings)
  const [blocks, setBlocks] = useState<PageBlock[]>(() => initial().blocks)
  const [quiz, setQuiz] = useState<QuizDraft[]>(() => initial().quiz)
  const [editing, setEditing] = useState<number | null>(null)
  const [focusBlock, setFocusBlock] = useState<number | null>(null)
  const [menuAt, setMenuAt] = useState<number | null>(null)
  const [forms, setForms] = useState<AdminForm[]>([])
  const [apps, setApps] = useState<ToolApp[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [undo, setUndo] = useState<{ block: PageBlock; index: number; quiz: QuizDraft[] | null } | null>(null)
  const [slashAt, setSlashAt] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number | null; after: boolean } | null>(null)
  const saveRef = useRef<() => void>(() => {})

  const current = JSON.stringify({ settings: s, blocks, quiz })
  const dirty = current !== saved
  const quizDirty = JSON.stringify(quiz) !== JSON.stringify(JSON.parse(saved).quiz)

  useEffect(() => {
    api.adminForms().then((r) => setForms(r.forms.filter((f) => f.active))).catch(() => {})
    api.apps().then(setApps).catch(() => {})
  }, [])
  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (k: keyof Settings) => (v: string) => setS((x) => ({ ...x, [k]: v }))
  const leave = (to: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    navigate(to)
  }

  // Order of everything, for "Step 5 of 31" and previous / next.
  const all = weeks.flatMap((w) => w.lessons)
  const idx = lesson ? all.findIndex((l) => l.id === lesson.id) : -1
  const week = weeks.find((w) => String(w.id) === s.weekId)
  const myFiles = lesson ? resources.filter((r) => r.lessonId === lesson.id) : []

  // ----- block operations -----
  const patch = (i: number, b: PageBlock) => setBlocks((all) => all.map((x, k) => (k === i ? b : x)))
  const move = (i: number, d: number) => {
    setEditing(null)
    setBlocks((all) => {
      const j = i + d
      if (j < 0 || j >= all.length) return all
      const next = [...all]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }
  const remove = (i: number) => {
    const b = blocks[i]!
    if (b.type === 'files' && myFiles.length) {
      window.alert(`This step has ${myFiles.length} download${myFiles.length === 1 ? '' : 's'}. Delete the files first, then remove Downloads.`)
      return false
    }
    // No "are you sure?": removing shows an Undo instead.
    setUndo({ block: b, index: i, quiz: b.type === 'quiz' ? quiz : null })
    if (b.type === 'quiz') setQuiz([])
    setEditing(null)
    setBlocks((all) => all.filter((_, k) => k !== i))
    return true
  }
  const undoRemove = () => {
    if (!undo) return
    setBlocks((all) => [...all.slice(0, undo.index), undo.block, ...all.slice(undo.index)])
    if (undo.quiz) setQuiz(undo.quiz)
    setUndo(null)
  }
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo])
  const duplicate = (i: number) => {
    setBlocks((all) => [...all.slice(0, i + 1), JSON.parse(JSON.stringify(all[i])) as PageBlock, ...all.slice(i + 1)])
    setEditing(null)
  }
  /** "/" in an empty line: swap that line for the block picked. */
  const replace = (i: number, type: PageBlockType) => {
    setBlocks((all) => all.map((x, k) => (k === i ? newBlock(type, forms, apps) : x)))
    setSlashAt(null)
    if (type === 'quiz' && !quiz.length) setQuiz([blankQuestion()])
    setEditing(type === 'video' || type === 'form' || type === 'app' ? i : null)
    setFocusBlock(null)
    setTimeout(() => setFocusBlock(i), 0)
  }
  const moveTo = (from: number, to: number) => {
    if (to === from || to === from + 1) return
    setEditing(null)
    setBlocks((all) => {
      const next = [...all]
      const [b] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, b!)
      return next
    })
  }
  const insert = (at: number, type: PageBlockType) => {
    setBlocks((all) => [...all.slice(0, at), newBlock(type, forms, apps), ...all.slice(at)])
    setMenuAt(null)
    if (type === 'quiz' && !quiz.length) setQuiz([blankQuestion()])
    if (type === 'video' || type === 'form' || type === 'app') setEditing(at)
    else setEditing(null)
    setFocusBlock(at)
  }
  const has = (t: PageBlockType) => blocks.some((b) => b.type === t)

  // ----- sidebar switches -----
  const toggle = (t: 'video' | 'quiz' | 'files', on: boolean) => {
    if (on) {
      if (t === 'video') insert(0, 'video')
      else if (t === 'files') {
        const q = blocks.findIndex((b) => b.type === 'quiz')
        insert(q >= 0 ? q : blocks.length, 'files')
      } else insert(blocks.length, 'quiz')
      return
    }
    // Off: remove every block of that kind (with the same safety checks as the bin button).
    for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]!.type === t && !remove(i)) return
  }

  // ----- save -----
  const save = async () => {
    setError(null)
    if (!s.title.trim()) {
      setError('Give the step a title first.')
      document.getElementById('step-title')?.focus()
      return
    }
    const checked = quiz.map(cleanQuestion)
    const badQ = checked.findIndex((c) => c.error)
    if (has('quiz') && badQ >= 0) {
      setError(`Quick check question ${badQ + 1}: ${checked[badQ]!.error}`)
      return
    }
    setBusy(true)
    const body = {
      weekId: Number(s.weekId), title: s.title.trim(), label: s.label.trim(), presenter: s.presenter.trim(),
      durationMin: Number(s.duration) || 0, overview: s.summary.trim(), blocks: cleanBlocks(blocks),
    }
    const cleanQuiz = checked.map((c) => c.q)
    try {
      if (lesson) {
        await api.updateLesson(lesson.id, body)
        if (quizDirty) await api.saveQuiz(lesson.id, cleanQuiz)
        setSaved(current)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2500)
      } else {
        const r = (await api.createLesson(body)) as { id?: number }
        if (r.id && cleanQuiz.length) await api.saveQuiz(r.id, cleanQuiz)
        setSaved(current) // so leaving doesn't warn
        if (r.id) navigate(`/admin/content/step/${r.id}`, { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  saveRef.current = () => { if (!busy) void save() }
  const discard = () => {
    if (!window.confirm('Undo all changes since the last save?')) return
    const x = JSON.parse(saved) as ReturnType<typeof initial>
    setS(x.settings)
    setBlocks(x.blocks)
    setQuiz(x.quiz)
    setEditing(null)
    setError(null)
  }
  const deleteStep = async () => {
    if (!lesson || !window.confirm(`Delete “${lesson.title}”? Progress, notes and its quick check go with it.`)) return
    await api.deleteLesson(lesson.id)
    setSaved(current)
    navigate('/admin/content')
  }

  // ----- render -----
  const lead = blocks[0]?.type === 'video'
  const start = lead ? 1 : 0
  const blockProps = (i: number): BlockProps => ({
    i, n: blocks.length, b: blocks[i]!, onPatch: (b: PageBlock) => patch(i, b), onMove: (d: number) => move(i, d), onRemove: () => void remove(i),
    editing: editing === i, onEdit: (on: boolean) => setEditing(on ? i : null), autoFocus: focusBlock === i,
    forms, apps, quiz, onQuiz: setQuiz, lessonId: lesson?.id ?? null, files: myFiles, title: s.title, posterUrl: lesson?.posterUrl ?? '',
    onDuplicate: () => duplicate(i), canDuplicate: !ONCE.has(blocks[i]!.type),
    slash: slashAt === i, onSlash: (on: boolean) => setSlashAt(on ? i : null), onReplace: (t: PageBlockType) => replace(i, t), has,
    dropMark: drag && drag.over === i && drag.from !== i ? (drag.after ? 'after' as const : 'before' as const) : null,
    onDragStart: () => setDrag({ from: i, over: null, after: false }),
    onDragOver: (after: boolean) => setDrag((d) => (d ? { ...d, over: i, after } : d)),
    onDrop: () => { if (drag) moveTo(drag.from, drag.after ? i + 1 : i); setDrag(null) },
    onDragEnd: () => setDrag(null),
  })
  const insertLine = (at: number) => (
    <InsertLine key={`ins-${at}`} open={menuAt === at} onOpen={() => setMenuAt(menuAt === at ? null : at)} onPick={(t) => insert(at, t)} onClose={() => setMenuAt(null)} has={has} />
  )

  // Runs of reading blocks share one card, like the staff view.
  const body: ReactNode[] = [insertLine(start)]
  for (let i = start; i < blocks.length; ) {
    if (IN_READING.has(blocks[i]!.type)) {
      const run: ReactNode[] = []
      let j = i
      while (j < blocks.length && IN_READING.has(blocks[j]!.type)) {
        if (j > i) run.push(insertLine(j))
        run.push(<EditableBlock key={`b-${j}`} {...blockProps(j)} />)
        j++
      }
      body.push(<section key={`g-${i}`} className="card reading-card eb-group">{run}</section>)
      i = j
    } else {
      body.push(<EditableBlock key={`b-${i}`} {...blockProps(i)} />)
      i++
    }
    body.push(insertLine(i))
  }

  return (
    <>
      <TopBar
        bell={false}
        left={
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><button type="button" className="body-sm crumb-link" onClick={() => leave('/admin/content')}>Content</button></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="body-sm">{week ? weekLabel(week) : 'Section'}</span></li>
              <li aria-hidden="true" className="body-sm">/</li>
              <li><span className="link-slate" aria-current="page">{lesson ? `Step ${idx + 1} of ${all.length}` : 'New step'}</span></li>
            </ol>
          </nav>
        }
      />
      <div className="lesson-cols step-editor">
        <div className="lesson-col">
          {lead && <EditableBlock {...blockProps(0)} />}
          <header className="lesson-title eb-title">
            <label className="sr-only" htmlFor="step-label">Label</label>
            <input id="step-label" className="label eb-label" value={s.label} maxLength={80} placeholder="ADD A LABEL (OPTIONAL)" onChange={(e) => set('label')(e.target.value)} />
            <label className="sr-only" htmlFor="step-title">Step title</label>
            <AutoText id="step-title" className="display-md eb-h1" value={s.title} onChange={set('title')} placeholder="Untitled step" single maxLength={200} />
            <p className="meta">{[s.presenter, s.duration ? `${s.duration} min` : ''].filter(Boolean).join('  ·  ') || 'Presenter and time are in Step settings →'}</p>
          </header>
          {!lead && !has('video') && (
            <button type="button" className="eb-add-video" onClick={() => toggle('video', true)}>
              <PlusIcon /> Add a video at the top
            </button>
          )}
          <div className="page-blocks eb-page">{body}</div>

          <div className={`save-bar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label="Save">
            {undo && (
              <p className="save-bar__undo">
                {blockName(undo.block)} removed. <button type="button" onClick={undoRemove}>Undo</button>
              </p>
            )}
            <p className="save-bar__status" role="status" aria-live="polite">
              {error ? <span className="save-bar__error">{error}</span> : busy ? 'Saving…' : dirty ? 'Unsaved changes' : justSaved ? 'Saved. Staff see it now.' : lesson ? 'All changes saved' : 'New step: not saved yet'}
            </p>
            <div className="save-bar__actions">
              {dirty && lesson && <button type="button" className="save-bar__discard" onClick={discard}>Discard</button>}
              <button type="button" className="save-bar__save" onClick={() => void save()} disabled={busy || (!dirty && !!lesson)}>
                {lesson ? 'Save step' : 'Create step'}
              </button>
            </div>
          </div>
        </div>

        <aside className="lesson-side" aria-label="Step options">
          <section className="card side-card eb-side" aria-labelledby="on-title">
            <h2 id="on-title" className="card-serif">On this step</h2>
            <Switch label="Video" hint={has('video') ? (blocks.some((b) => b.type === 'video' && b.url) ? 'Added' : 'Shows “coming soon” until you add one') : 'Off: this step is reading and tasks'} on={has('video')} onChange={(on) => toggle('video', on)} />
            <Switch label="Quick check" hint={has('quiz') ? `${quiz.length} question${quiz.length === 1 ? '' : 's'}` : 'Questions at the end'} on={has('quiz')} onChange={(on) => toggle('quiz', on)} />
            <Switch label="Downloads" hint={has('files') ? `${myFiles.length} file${myFiles.length === 1 ? '' : 's'}` : 'Files to download'} on={has('files')} onChange={(on) => toggle('files', on)} />
            <p className="body-xs eb-side__tip">Anything else (text, lists, links, paperwork, tools): hover between blocks on the page and press <span className="eb-plus" aria-hidden="true">+</span>.</p>
          </section>

          <section className="card side-card eb-side" aria-labelledby="set-title">
            <h2 id="set-title" className="card-serif">Step settings</h2>
            <SideField label="Section">
              {(id) => (
                <select id={id} className="input" value={s.weekId} onChange={(e) => set('weekId')(e.target.value)}>
                  {weeks.map((w) => <option key={w.id} value={w.id}>{weekLabel(w)}</option>)}
                </select>
              )}
            </SideField>
            <SideField label="Presenter">{(id) => <input id={id} className="input" value={s.presenter} maxLength={120} placeholder="Dr. Angela Claffey" onChange={(e) => set('presenter')(e.target.value)} />}</SideField>
            <SideField label="Time it takes (minutes)">{(id) => <input id={id} className="input" type="number" min={0} value={s.duration} onChange={(e) => set('duration')(e.target.value)} />}</SideField>
            <SideField label="Summary" hint="Shown on this step’s card in My onboarding.">
              {(id) => <textarea id={id} className="input textarea" rows={3} value={s.summary} maxLength={5000} onChange={(e) => set('summary')(e.target.value)} />}
            </SideField>
          </section>

          {lesson && <section className="card side-card eb-side" aria-label="More">
            {(
              <Link className="btn btn--ghost eb-preview-link" to={`/lesson/${lesson.id}`} target="_blank" rel="noopener noreferrer">
                See it as staff do <ExternalIcon /><span className="sr-only"> (opens in a new tab)</span>
              </Link>
            )}
            <div className="eb-side__nav">
              {idx > 0 && <button type="button" className="btn-ghost-text text-btn" onClick={() => leave(`/admin/content/step/${all[idx - 1]!.id}`)}>← Previous step</button>}
              {idx >= 0 && idx < all.length - 1 && <button type="button" className="btn-ghost-text text-btn" onClick={() => leave(`/admin/content/step/${all[idx + 1]!.id}`)}>Next step →</button>}
            </div>
            <button type="button" className="btn btn--danger btn--small-ghost" onClick={() => void deleteStep()}><TrashIcon /> Delete this step</button>
          </section>}
        </aside>
      </div>
    </>
  )
}

// ---------- Pieces ----------

/** Items you type into like a list: Enter adds the next one, Backspace on an empty one removes it. */
function ItemList({ items, onChange, marker, className, placeholder, autoFocus, label }: {
  items: string[]; onChange: (items: string[]) => void; marker: (i: number) => ReactNode; className: string; placeholder: string; autoFocus?: boolean; label: string
}) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([])
  const [focusAt, setFocusAt] = useState<number | null>(autoFocus ? 0 : null)
  useEffect(() => {
    if (focusAt === null) return
    const el = refs.current[focusAt]
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    setFocusAt(null)
  }, [focusAt, items.length])
  const onKey = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)])
      setFocusAt(i + 1)
    } else if (e.key === 'Backspace' && !items[i] && items.length > 1) {
      e.preventDefault()
      onChange(items.filter((_, k) => k !== i))
      setFocusAt(Math.max(0, i - 1))
    }
  }
  return (
    <ul className={`eb-items ${className}`} aria-label={label}>
      {items.map((x, i) => (
        <li key={i}>
          {marker(i)}
          <AutoText value={x} onChange={(v) => onChange(items.map((y, k) => (k === i ? v : y)))} single placeholder={i === 0 ? placeholder : 'Next item'} label={`${label} ${i + 1}`} maxLength={600} onKeyDown={onKey(i)} inputRef={(el) => { refs.current[i] = el }} />
        </li>
      ))}
    </ul>
  )
}

function InsertLine({ open, onOpen, onPick, onClose, has }: {
  open: boolean; onOpen: () => void; onPick: (t: PageBlockType) => void; onClose: () => void; has: (t: PageBlockType) => boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    ref.current?.querySelector<HTMLButtonElement>('.eb-menu button:not(:disabled)')?.focus()
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open, onClose])
  return (
    <div className={`eb-insert ${open ? 'is-open' : ''}`} ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <button type="button" className="eb-insert__btn" onClick={onOpen} aria-expanded={open} aria-label="Add a block here">
        <PlusIcon size={14} />
      </button>
      {open && <BlockMenu has={has} onPick={onPick} />}
    </div>
  )
}

function BlockMenu({ has, onPick, label = 'Add a block' }: { has: (t: PageBlockType) => boolean; onPick: (t: PageBlockType) => void; label?: string }) {
  return (
    <div className="eb-menu" role="group" aria-label={label}>
      {MENU.map((m) => {
        const off = ONCE.has(m.type) && has(m.type)
        return (
          <button key={m.type} type="button" disabled={off} onClick={() => onPick(m.type)} className="eb-menu__item">
            <span className="row-title-sm">{m.label}</span>
            <span className="body-xs">{off ? 'Already on this step' : m.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The "/" menu, opened from an empty line. Closes on Escape or a click elsewhere. */
function SlashMenu({ has, onPick, onClose }: { has: (t: PageBlockType) => boolean; onPick: (t: PageBlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  return (
    <div className="eb-slash" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <BlockMenu has={has} onPick={onPick} label="Turn this line into" />
    </div>
  )
}

type BlockProps = {
  onDuplicate: () => void; canDuplicate: boolean
  slash: boolean; onSlash: (on: boolean) => void; onReplace: (t: PageBlockType) => void; has: (t: PageBlockType) => boolean
  dropMark: 'before' | 'after' | null
  onDragStart: () => void; onDragOver: (after: boolean) => void; onDrop: () => void; onDragEnd: () => void
  i: number; n: number; b: PageBlock
  onPatch: (b: PageBlock) => void; onMove: (d: number) => void; onRemove: () => void
  editing: boolean; onEdit: (on: boolean) => void; autoFocus: boolean
  forms: AdminForm[]; apps: ToolApp[]; quiz: QuizDraft[]; onQuiz: (q: QuizDraft[]) => void
  lessonId: number | null; files: Resource[]; title: string; posterUrl: string
}

const blockName = (b: PageBlock) =>
  isTextType(b.type) ? TEXT_LABEL[b.type] : isListType(b.type) ? LIST_LABEL[b.type] : MENU.find((m) => m.type === b.type)?.label ?? 'Block'

/** One block: shown the way staff see it, with a small toolbar (style, move, remove) on hover or focus. */
function EditableBlock(p: BlockProps) {
  const { b, i, n } = p
  const selId = useId()
  const style = isTextType(b.type) ? (
    <>
      <label className="sr-only" htmlFor={selId}>Style</label>
      <select id={selId} className="eb-style" value={b.type} onChange={(e) => p.onPatch({ type: e.target.value as TextType, text: 'text' in b ? b.text : '' })}>
        {TEXT_TYPES.map((t) => <option key={t} value={t}>{TEXT_LABEL[t]}</option>)}
      </select>
    </>
  ) : isListType(b.type) ? (
    <>
      <label className="sr-only" htmlFor={selId}>List style</label>
      <select id={selId} className="eb-style" value={b.type} onChange={(e) => p.onPatch(asList(b, e.target.value as ListType))}>
        {LIST_TYPES.map((t) => <option key={t} value={t}>{LIST_LABEL[t]}</option>)}
      </select>
    </>
  ) : (
    <span className="eb-tools__name">{blockName(b)}</span>
  )
  return (
    <div
      className={`eb eb--${b.type}${p.dropMark ? ` is-drop-${p.dropMark}` : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        p.onDragOver(e.clientY > r.top + r.height / 2)
      }}
      onDrop={(e) => { e.preventDefault(); p.onDrop() }}
    >
      <div className="eb-tools" role="toolbar" aria-label={`${blockName(b)} block`}>
        <span
          className="eb-tool eb-grip"
          draggable
          title="Drag to move"
          aria-hidden="true"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(i))
            const el = e.currentTarget.closest('.eb')
            if (el) e.dataTransfer.setDragImage(el, 24, 16)
            p.onDragStart()
          }}
          onDragEnd={p.onDragEnd}
        >
          <GripIcon size={14} />
        </span>
        {style}
        <button type="button" className="eb-tool" onClick={() => p.onMove(-1)} disabled={i === 0} aria-label="Move up"><ArrowUpIcon size={14} /></button>
        <button type="button" className="eb-tool" onClick={() => p.onMove(1)} disabled={i === n - 1} aria-label="Move down"><ArrowDownIcon size={14} /></button>
        {p.canDuplicate && <button type="button" className="eb-tool" onClick={p.onDuplicate} aria-label={`Duplicate ${blockName(b).toLowerCase()}`}><DuplicateIcon size={14} /></button>}
        <button type="button" className="eb-tool" onClick={p.onRemove} aria-label={`Remove ${blockName(b).toLowerCase()}`}><TrashIcon size={14} /></button>
      </div>
      <BlockBody {...p} />
      {p.slash && <SlashMenu has={p.has} onPick={p.onReplace} onClose={() => p.onSlash(false)} />}
    </div>
  )
}

function BlockBody(p: BlockProps) {
  const { b } = p
  switch (b.type) {
    case 'p':
      return (
        <AutoText
          className="body-md" value={b.text} onChange={(text) => p.onPatch({ ...b, text })} placeholder="Type something, or press / for blocks" label="Text" autoFocus={p.autoFocus}
          onKeyDown={(e) => { if (e.key === '/' && !b.text) { e.preventDefault(); p.onSlash(true) } }}
        />
      )
    case 'h':
      return <AutoText className="reading__h" value={b.text} onChange={(text) => p.onPatch({ ...b, text })} placeholder="HEADING" label="Heading" single maxLength={160} autoFocus={p.autoFocus} />
    case 'quote':
      return <blockquote className="reading__quote"><AutoText className="eb-quote" value={b.text} onChange={(text) => p.onPatch({ ...b, text })} placeholder="A quote…" label="Quote" autoFocus={p.autoFocus} /></blockquote>
    case 'callout':
      return <div className="reading__callout"><AutoText className="body-sm-dark" value={b.text} onChange={(text) => p.onPatch({ ...b, text })} placeholder="Something to call out…" label="Callout" autoFocus={p.autoFocus} /></div>
    case 'list':
      return <ItemList className="eb-items--bullets" label="List item" items={b.items} onChange={(items) => p.onPatch({ ...b, items })} marker={() => <span className="eb-dot" aria-hidden="true" />} placeholder="First item" autoFocus={p.autoFocus} />
    case 'steps':
      return <ItemList className="eb-items--steps" label="Step" items={b.items} onChange={(items) => p.onPatch({ ...b, items })} marker={(k) => <span className="reading__n" aria-hidden="true">{k + 1}</span>} placeholder="First step" autoFocus={p.autoFocus} />
    case 'checklist':
      return <ItemList className="eb-items--check" label="Checklist item" items={b.items} onChange={(items) => p.onPatch({ ...b, items })} marker={() => <span className="reading__box" aria-hidden="true" />} placeholder="Something to have or do" autoFocus={p.autoFocus} />
    case 'dodont':
      return (
        <div className="reading__dodont">
          <div>
            <p className="label-muted">DO</p>
            <ItemList className="eb-items--do" label="Do" items={b.do} onChange={(xs) => p.onPatch({ ...b, do: xs })} marker={() => <CheckIcon size={14} className="icon-deep" />} placeholder="Do this" autoFocus={p.autoFocus} />
          </div>
          <div>
            <p className="label-muted">DO NOT</p>
            <ItemList className="eb-items--do" label="Don’t" items={b.dont} onChange={(xs) => p.onPatch({ ...b, dont: xs })} marker={() => <CloseIcon size={14} />} placeholder="Not this" />
          </div>
        </div>
      )
    case 'takeaways':
      return (
        <section className="card takeaways">
          <h2 className="card-serif">Key takeaways</h2>
          <ItemList className="eb-items--kt" label="Takeaway" items={b.items} onChange={(items) => p.onPatch({ ...b, items })} marker={() => <span className="kt__dot" aria-hidden="true"><CheckIcon size={12} /></span>} placeholder="A point to remember" autoFocus={p.autoFocus} />
        </section>
      )
    case 'video':
      return (
        <Preview
          label="video" cta={b.url ? 'Change video' : 'Add the video'} editing={p.editing} onEdit={p.onEdit}
          view={<Player lessonId={p.lessonId ?? 0} title={p.title} videoUrl={b.url} posterUrl={p.posterUrl} trackProgress={false} />}
          panel={
            <div className="stack-12">
              <p className="row-title-sm">{b.url ? 'Change the video' : 'Add the video'}</p>
              <VideoField value={b.url} onChange={(url) => p.onPatch({ ...b, url })} />
              <p className="body-xs">No video yet? Leave it empty and staff see “Video coming soon” here.</p>
              <details className="pb-more">
                <summary className="link-slate">Transcript {b.transcript.trim() ? '(added)' : '(optional)'}</summary>
                <textarea className="input textarea" rows={6} aria-label="Transcript" value={b.transcript} onChange={(e) => p.onPatch({ ...b, transcript: e.target.value })} />
              </details>
            </div>
          }
        />
      )
    case 'links':
      return (
        <section className="card side-card links-card">
          <h2 className="card-serif">Links and sources</h2>
          <LinksEditor label="Name each link so staff know what it opens" links={b.items} onChange={(items) => p.onPatch({ ...b, items })} />
        </section>
      )
    case 'files':
      return (
        <section className="card res-card">
          <h2 className="card-serif">Downloads</h2>
          <FilesBlockEditor lessonId={p.lessonId} files={p.files} />
        </section>
      )
    case 'quiz':
      return (
        <section className="card quick-check">
          <div className="qc-head">
            <h2 className="card-serif">Quick check</h2>
            <p className="meta">Staff answer these before moving on</p>
          </div>
          <QuizEditor value={p.quiz} onChange={p.onQuiz} />
        </section>
      )
    case 'form': {
      const f = p.forms.find((x) => x.id === b.formId)
      const asMine: MyForm | null = f ? { ...f, status: 'todo', submission: null } : null
      return (
        <Preview
          label="paperwork" editing={p.editing || !asMine} onEdit={p.onEdit} hideDone={!asMine}
          view={asMine ? <FormCard form={asMine} onDone={() => {}} startOpen={false} /> : null}
          panel={
            <Picker
              label="Which paperwork?" value={b.formId}
              options={p.forms.map((x) => ({ id: x.id, label: `${x.title}${x.kind === 'sign' ? ' (agreement)' : ' (form to hand in)'}` }))}
              onChange={(formId) => p.onPatch({ ...b, formId })}
              empty={<>No paperwork yet. <Link to="/admin/paperwork">Add an agreement or form in Paperwork</Link>, then come back.</>}
              manage={<Link to="/admin/paperwork">Manage paperwork</Link>}
            />
          }
        />
      )
    }
    case 'app': {
      const a = p.apps.find((x) => x.id === b.appId)
      return (
        <Preview
          label="tool" editing={p.editing || !a} onEdit={p.onEdit} hideDone={!a}
          view={a ? <AppCard app={a} compact /> : null}
          panel={
            <Picker
              label="Which tool?" value={b.appId}
              options={p.apps.map((x) => ({ id: x.id, label: x.name }))}
              onChange={(appId) => p.onPatch({ ...b, appId })}
              empty={<>No tools yet. <Link to="/admin/tools">Add SimplePractice, Slack and the rest in Tools</Link>, then come back.</>}
              manage={<Link to="/admin/tools">Manage tools</Link>}
            />
          }
        />
      )
    }
    case 'divider':
      return <hr className="page-divider" />
    default:
      return null
  }
}

/** A block you can't type into directly: shows exactly what staff see; click it to change it. */
function Preview({ label, view, panel, editing, onEdit, hideDone, cta }: {
  label: string; view: ReactNode; panel: ReactNode; editing: boolean; onEdit: (on: boolean) => void; hideDone?: boolean; cta?: string
}) {
  return (
    <div className="eb-preview">
      {view && (
        <div className="eb-preview__frame">
          <div className="eb-preview__view" inert>{view}</div>
          {!editing && (
            <button type="button" className="eb-preview__hit" onClick={() => onEdit(true)}>
              <span className="eb-preview__cta">{cta ?? `Change ${label}`}</span>
            </button>
          )}
        </div>
      )}
      {editing && (
        <div className="eb-panel">
          {panel}
          {!hideDone && <button type="button" className="btn btn--dark btn--small" onClick={() => onEdit(false)}>Done</button>}
          <p className="sr-only">Editing the {label}</p>
        </div>
      )}
    </div>
  )
}

