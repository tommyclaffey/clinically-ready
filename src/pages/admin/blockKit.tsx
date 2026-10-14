// Building blocks shared by the step editor: cleaning a page before save, and the editors for the
// blocks that need more than typing (downloads, quick check, paperwork/tool pickers).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { api, type PageBlock, type QuizDraft, type Resource } from '../../api'
import { CheckIcon, PlusIcon, TrashIcon, UploadIcon } from '../../components/Icons'
import { FileTile } from '../../components/ui'
import { fileMeta } from '../../lib/format'
import { Feedback, useAction } from './adminUi'

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** What gets saved: trimmed, with empty blocks and empty rows dropped. */
export function cleanBlocks(blocks: PageBlock[]): PageBlock[] {
  const items = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
  return blocks.flatMap((b): PageBlock[] => {
    switch (b.type) {
      case 'video': return [{ type: 'video', url: b.url.trim(), transcript: b.transcript }]
      case 'h': case 'p': case 'quote': case 'callout': return b.text.trim() ? [{ type: b.type, text: b.text.trim() }] : []
      case 'list': case 'steps': case 'checklist': case 'takeaways': {
        const xs = items(b.items)
        return xs.length ? [{ type: b.type, items: xs }] : []
      }
      case 'dodont': {
        const d = { type: 'dodont' as const, do: items(b.do), dont: items(b.dont) }
        return d.do.length || d.dont.length ? [d] : []
      }
      case 'links': {
        const xs = b.items.map((l) => ({ label: l.label.trim() || hostLabel(l.url.trim()), url: l.url.trim() })).filter((l) => l.url)
        return xs.length ? [{ type: 'links', items: xs }] : []
      }
      case 'form': return b.formId ? [b] : []
      case 'app': return b.appId ? [b] : []
      default: return [b]
    }
  })
}

export function Picker({ label, value, options, onChange, empty, manage }: {
  label: string; value: number; options: { id: number; label: string }[]; onChange: (id: number) => void; empty: ReactNode; manage: ReactNode
}) {
  const id = useId()
  if (!options.length) return <p className="body-sm">{empty}</p>
  return (
    <div className="field">
      <label htmlFor={id} className="link-slate">{label}</label>
      <select id={id} className="input" value={value || ''} onChange={(e) => onChange(Number(e.target.value))}>
        {!value && <option value="">Choose…</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <p className="body-xs">{manage}</p>
    </div>
  )
}

export function FilesBlockEditor({ lessonId, files }: { lessonId: number | null; files: Resource[] }) {
  const [list, setList] = useState(files)
  const a = useAction()
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => setList(files), [files])
  if (!lessonId) return <p className="body-sm">Save the step first, then upload its files here.</p>

  const upload = (file: File | undefined) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      void a.run(async () => { throw new Error('That file is over the 25 MB limit.') })
      return
    }
    void a.run(async () => {
      const r = (await api.uploadResource(file, { title: file.name.replace(/\.[^.]+$/, ''), category: 'Resource', lessonId })) as { resource?: Resource }
      if (r.resource) setList((l) => [...l, r.resource!])
      if (ref.current) ref.current.value = ''
    }, 'Uploaded. It also shows in Resources.')
  }
  const remove = (r: Resource) => {
    if (!window.confirm(`Delete “${r.title}”? The file is removed for everyone.`)) return
    void a.run(async () => {
      await api.deleteResource(r.id)
      setList((l) => l.filter((x) => x.id !== r.id))
    }, 'Deleted')
  }

  return (
    <div className="stack-12">
      {list.length ? (
        <ul className="admin-files">
          {list.map((r) => (
            <li key={r.id} className="admin-file">
              <FileTile resource={r} small />
              <span className="file-card__text">
                <span className="row-title-sm">{r.title}</span>
                <span className="body-xs">{fileMeta(r)}</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}><TrashIcon /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="body-sm">No files on this step yet.</p>
      )}
      <div>
        <input
          id={id} ref={ref} type="file" className="sr-only" disabled={a.busy}
          accept=".pdf,.docx,.doc,.xlsx,.pptx,.zip,.png,.jpg,.jpeg,.txt,.mp4"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <label htmlFor={id} className="btn btn--ghost btn--small-ghost file-pick">
          <UploadIcon /> {a.busy ? 'Uploading…' : 'Upload a file'}
        </label>
        <p className="body-xs">PDF, Word, Excel, PowerPoint, ZIP, PNG, JPG, TXT or MP4. Up to 25 MB.</p>
      </div>
      <Feedback error={a.error} ok={a.ok} />
    </div>
  )
}

export /** A textarea that grows with its text and looks like the text it edits. `single`: Enter doesn't add a line. */
function AutoText({ value, onChange, className = '', placeholder, single, id, label, autoFocus, maxLength = 4000, onKeyDown, inputRef }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string; single?: boolean; id?: string; label?: string
  autoFocus?: boolean; maxLength?: number; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; inputRef?: (el: HTMLTextAreaElement | null) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(fit, [value])
  useEffect(() => {
    window.addEventListener('resize', fit)
    document.fonts?.ready.then(fit).catch(() => {})
    return () => window.removeEventListener('resize', fit)
  }, [])
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <textarea
      ref={(el) => { ref.current = el; inputRef?.(el) }}
      id={id}
      aria-label={label}
      rows={1}
      className={`eb-text ${className}`}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(single ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onKeyDown={(e) => {
        if (single && e.key === 'Enter') e.preventDefault()
        onKeyDown?.(e)
      }}
    />
  )
}

// ---------- Questions (a step's quick check, and a section quiz's pool) ----------

export const blankQuestion = (): QuizDraft => ({ prompt: '', options: ['', ''], correctIndex: 0, explanation: '' })

/** One question, edited in place: type the question, type the answers, tap the letter to mark the right one. */
export function QuestionForm({ value: q, onChange, n, onRemove, autoFocus }: {
  value: QuizDraft; onChange: (q: QuizDraft) => void; n?: number; onRemove?: () => void; autoFocus?: boolean
}) {
  const base = useId()
  const [showWhy, setShowWhy] = useState(Boolean(q.explanation))
  const refs = useRef<(HTMLTextAreaElement | null)[]>([])
  const [focusAt, setFocusAt] = useState<number | null>(null)
  useEffect(() => {
    if (focusAt !== null) refs.current[focusAt]?.focus()
    setFocusAt(null)
  }, [focusAt, q.options.length])
  const setOpt = (k: number, v: string) => onChange({ ...q, options: q.options.map((x, m) => (m === k ? v : x)) })
  const removeOpt = (k: number) => {
    const options = q.options.filter((_, m) => m !== k)
    const correctIndex = q.correctIndex === k ? 0 : q.correctIndex > k ? q.correctIndex - 1 : q.correctIndex
    onChange({ ...q, options, correctIndex })
  }
  const onKey = (k: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (k === q.options.length - 1 && q.options.length < 6) {
        onChange({ ...q, options: [...q.options, ''] })
        setFocusAt(k + 1)
      } else setFocusAt(Math.min(k + 1, q.options.length - 1))
    }
  }
  return (
    <div className="qf">
      <div className="qf__head">
        {n != null && <span className="qf__n" aria-hidden="true">{n}</span>}
        <AutoText className="qf__prompt" value={q.prompt} onChange={(prompt) => onChange({ ...q, prompt })} placeholder="Type the question" label={n != null ? `Question ${n}` : 'Question'} maxLength={1000} autoFocus={autoFocus} />
        {onRemove && <button type="button" className="eb-tool" onClick={onRemove} aria-label={`Remove question${n != null ? ` ${n}` : ''}`}><TrashIcon size={14} /></button>}
      </div>
      <ul className="qf__answers" aria-label="Answers. Mark the right one.">
        {q.options.map((o, k) => {
          const right = q.correctIndex === k
          return (
            <li key={k} className={`qf__answer ${right ? 'is-right' : ''}`}>
              <button type="button" className="qf__mark" aria-pressed={right} onClick={() => onChange({ ...q, correctIndex: k })} aria-label={`Answer ${String.fromCharCode(65 + k)}${right ? ' is the right answer' : ': mark as the right answer'}`}>
                {right ? <CheckIcon size={13} /> : String.fromCharCode(65 + k)}
              </button>
              <AutoText id={`${base}-o${k}`} label={`Answer ${String.fromCharCode(65 + k)}`} inputRef={(el) => { refs.current[k] = el }} className="qf__input" value={o} maxLength={300} placeholder={k === 0 ? 'An answer' : 'Another answer'} onChange={(v) => setOpt(k, v)} onKeyDown={onKey(k)} single />
              {right && <span className="qf__right">Right answer</span>}
              <button type="button" className="eb-tool" disabled={q.options.length <= 2} onClick={() => removeOpt(k)} aria-label={`Remove answer ${String.fromCharCode(65 + k)}`}><TrashIcon size={13} /></button>
            </li>
          )
        })}
      </ul>
      <div className="qf__foot">
        {q.options.length < 6 && (
          <button type="button" className="btn-ghost-text text-btn" onClick={() => { onChange({ ...q, options: [...q.options, ''] }); setFocusAt(q.options.length) }}>
            <PlusIcon /> Add answer
          </button>
        )}
        {!showWhy && (
          <button type="button" className="btn-ghost-text text-btn" onClick={() => setShowWhy(true)}>
            <PlusIcon /> Explain the answer
          </button>
        )}
      </div>
      {showWhy && (
        <div className="qf__why">
          <label className="link-slate" htmlFor={`${base}-why`}>Why <span className="body-xs">(shown after they answer)</span></label>
          <textarea id={`${base}-why`} className="input textarea" rows={2} maxLength={2000} value={q.explanation} onChange={(e) => onChange({ ...q, explanation: e.target.value })} />
        </div>
      )}
    </div>
  )
}

/** A step's quick check: its questions, edited in place. Saved with the step. */
export function QuizEditor({ value: qs, onChange }: { value: QuizDraft[]; onChange: (q: QuizDraft[]) => void }) {
  const [focusNew, setFocusNew] = useState<number | null>(null)
  return (
    <div className="qf-list">
      {qs.length === 0 && <p className="body-sm">No questions yet.</p>}
      {qs.map((q, i) => (
        <QuestionForm key={i} n={i + 1} value={q} autoFocus={focusNew === i} onChange={(nq) => onChange(qs.map((x, k) => (k === i ? nq : x)))} onRemove={() => onChange(qs.filter((_, k) => k !== i))} />
      ))}
      {qs.length < 20 && (
        <button type="button" className="pb-add qf-add" onClick={() => { onChange([...qs, blankQuestion()]); setFocusNew(qs.length) }}>
          <PlusIcon /> Add a question
        </button>
      )}
    </div>
  )
}

/** Trim a question before saving; returns an error sentence, or null when it's ready. */
export function cleanQuestion(q: QuizDraft): { q: QuizDraft; error: string | null } {
  const kept = q.options.map((o, k) => ({ o: o.trim(), k })).filter((x) => x.o)
  const correctIndex = kept.findIndex((x) => x.k === q.correctIndex)
  const clean = { prompt: q.prompt.trim(), options: kept.map((x) => x.o), correctIndex: Math.max(0, correctIndex), explanation: q.explanation.trim() }
  if (!clean.prompt) return { q: clean, error: 'Type the question.' }
  if (clean.options.length < 2) return { q: clean, error: 'Add at least two answers.' }
  if (correctIndex < 0) return { q: clean, error: 'The answer marked right is empty. Type it, or mark another one.' }
  return { q: clean, error: null }
}
