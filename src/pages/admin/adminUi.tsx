// Small form pieces shared by the admin editors.
import { useId, useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '../../components/Icons'

export function TextField({ label, value, onChange, type = 'text', required, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; hint?: string
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="link-slate">{label}{required ? '' : <span className="body-xs"> (optional)</span>}</label>
      <input id={id} className="input" type={type} value={value} required={required} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="body-xs">{hint}</p>}
    </div>
  )
}

export function AreaField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="link-slate">{label}</label>
      <textarea id={id} className="input textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      await fn()
      if (okMsg) setOk(okMsg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, ok, run }
}

export function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <p className={error ? 'form-error' : 'meta save-status'} role="status" aria-live="polite">
      {error ?? ok ?? ''}
    </p>
  )
}

export function EditorActions({ busy, onCancel, onDelete, saveLabel }: { busy: boolean; onCancel: () => void; onDelete?: () => void; saveLabel: string }) {
  return (
    <div className="editor-actions">
      <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      {onDelete && (
        <button type="button" className="btn btn--danger" onClick={onDelete} disabled={busy}>
          <TrashIcon /> Delete
        </button>
      )}
    </div>
  )
}

export function ListEditor({ label, items, onChange, placeholder, addLabel }: {
  label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string; addLabel: string
}) {
  const base = useId()
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
  }
  return (
    <fieldset className="list-editor">
      <legend className="link-slate">{label}</legend>
      {items.length === 0 && <p className="body-xs">None yet.</p>}
      <ol>
        {items.map((it, i) => (
          <li key={i} className="list-editor__row">
            <label className="sr-only" htmlFor={`${base}-${i}`}>{label} {i + 1}</label>
            <input id={`${base}-${i}`} className="input" value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${label.toLowerCase()} ${i + 1} up`}><ArrowUpIcon /></button>
            <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${label.toLowerCase()} ${i + 1} down`}><ArrowDownIcon /></button>
            <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}><TrashIcon /></button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-ghost-text text-btn" onClick={() => onChange([...items, ''])}>
        <PlusIcon /> {addLabel}
      </button>
    </fieldset>
  )
}

/** A labelled field for the editor sidebars. */
export function SideField({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="link-slate">{label}</label>
      {children(id)}
      {hint && <p className="body-xs">{hint}</p>}
    </div>
  )
}

export function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <div className="eb-switch">
      <span className="eb-switch__text">
        <label htmlFor={id} className="row-title-sm">{label}</label>
        <span className="body-xs" id={`${id}-h`}>{hint}</span>
      </span>
      <label className="switch">
        <input id={id} type="checkbox" role="switch" checked={on} aria-describedby={`${id}-h`} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch__track" aria-hidden="true"><span /></span>
      </label>
    </div>
  )
}
