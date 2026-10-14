// Paperwork: agreements to sign (typed-name e-signature) and forms to hand in (upload a completed copy).
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type MyForm } from '../api'
import { TopBar } from '../components/Shell'
import { EmptyState, ErrorState, PageHead, Spinner } from '../components/ui'
import { CheckIcon } from '../components/Icons'
import { useApi } from '../lib/useApi'
import { useAuth } from '../auth'

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

const STATUS: Record<MyForm['status'], string> = { todo: 'To do', resign: 'Updated: sign again', done: 'Done' }

export function PaperworkPage() {
  const forms = useApi(() => api.myForms())
  const list = forms.data ?? []
  const open = list.filter((f) => f.status !== 'done')
  const done = list.filter((f) => f.status === 'done')

  return (
    <>
      <TopBar />
      <PageHead label="PAPERWORK" title="Sign and hand in">
        {list.length ? `${open.length ? `${open.length} still to do` : 'All done'}. ` : ''}
        Agreements are signed by typing your name. Forms you upload are stored encrypted, and only your organisation’s admins can open them.
      </PageHead>
      {forms.loading && !forms.data ? (
        <Spinner label="Loading paperwork" />
      ) : forms.error ? (
        <ErrorState message={forms.error} onRetry={forms.reload} />
      ) : !list.length ? (
        <EmptyState title="Nothing to sign">Your organisation hasn’t added any paperwork.</EmptyState>
      ) : (
        <div className="stack-18">
          {open.map((f) => <FormCard key={f.id} form={f} onDone={forms.reload} startOpen={f.id === open[0]?.id} />)}
          {done.length > 0 && <h2 className="label-muted pw-done-label">DONE</h2>}
          {done.map((f) => <FormCard key={f.id} form={f} onDone={forms.reload} startOpen={false} />)}
        </div>
      )}
    </>
  )
}

export function FormCard({ form, onDone, startOpen }: { form: MyForm; onDone: () => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const titleId = useId()
  const isDone = form.status === 'done'
  return (
    <section className={`card pw-card ${isDone ? 'is-done' : ''}`} aria-labelledby={titleId}>
      <button type="button" className="pw-card__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`pw-status pw-status--${form.status}`}>{isDone ? <CheckIcon size={12} /> : null}{STATUS[form.status]}</span>
        <span className="pw-card__titles">
          <span id={titleId} className="row-title">{form.title}</span>
          <span className="body-xs">
            {form.kind === 'sign' ? 'Agreement to sign' : 'Form to fill in and hand in'}
            {!form.required && '  ·  Optional'}
            {form.submission && isDone && `  ·  ${form.kind === 'sign' ? 'Signed' : 'Handed in'} ${dateOnly(form.submission.submittedAt)}`}
          </span>
        </span>
        <span className="pw-card__chev" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      {open && (form.kind === 'sign' ? <SignForm form={form} onDone={onDone} /> : <UploadForm form={form} onDone={onDone} />)}
    </section>
  )
}

function SignForm({ form, onDone }: { form: MyForm; onDone: () => void }) {
  const { me } = useAuth()
  const [consent, setConsent] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const signed = form.status === 'done' && form.submission

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.signForm(form.id, { typedName: name.trim(), consent, version: form.version })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign.')
      setBusy(false)
    }
  }

  return (
    <div className="pw-card__body stack-18">
      {form.status === 'resign' && <p className="hint body-sm-dark">This agreement changed since you signed it. Read the new version and sign again.</p>}
      <div className="pw-doc" tabIndex={0} aria-label={`${form.title} text`}>
        <p className="body-sm-dark prewrap">{form.body}</p>
      </div>
      {signed ? (
        <p className="body-sm">
          Signed by <span className="text-slate">{form.submission!.typedName}</span> on {dateTime(form.submission!.submittedAt)}.{' '}
          <Link className="inline-link" to={`/paperwork/record/${form.submission!.id}`}>View signed copy</Link>
        </p>
      ) : (
        <form className="stack-18 pw-sign" onSubmit={submit}>
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span className="body-sm-dark">I’ve read this agreement. I agree to sign it electronically, and the name I type below is my signature.</span>
          </label>
          <div className="field">
            <label htmlFor={`${id}-name`} className="link-slate">Type your full legal name</label>
            <input id={`${id}-name`} className="input pw-sign__name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={me?.name ?? 'First and last name'} autoComplete="name" />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div>
            <button type="submit" className="btn btn--dark" disabled={busy || !consent || name.trim().split(/\s+/).length < 2}>
              {busy ? 'Signing…' : 'Sign agreement'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function UploadForm({ form, onDone }: { form: MyForm; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replace, setReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const done = form.status === 'done' && form.submission

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > 25 * 1024 * 1024) return setError('That file is over 25 MB. Scan it at a lower resolution, or save it as a PDF.')
    setBusy(true)
    try {
      await api.uploadForm(form.id, file)
      setReplace(false)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="pw-card__body stack-18">
      {form.body && <p className="body-sm-dark prewrap">{form.body}</p>}
      {form.templateUrl && (
        <p className="body-sm">
          1. <a className="inline-link" href={form.templateUrl} target="_blank" rel="noreferrer">Download the blank form ↗</a> and fill it in.
          <br />2. Save or scan it as a PDF (a clear photo works too), then upload it below.
        </p>
      )}
      {done && !replace ? (
        <p className="body-sm">
          Handed in on {dateTime(form.submission!.submittedAt)}.{' '}
          <button type="button" className="btn-ghost-text text-btn" onClick={() => setReplace(true)}>Upload a new copy</button>
        </p>
      ) : (
        <div className="field">
          <label htmlFor={`${id}-file`} className="link-slate">Completed form (PDF, PNG or JPG, up to 25 MB)</label>
          <input ref={fileRef} id={`${id}-file`} className="input input--file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          {busy && <p className="meta" role="status">Uploading securely…</p>}
          {done && <p className="body-xs">Your new copy replaces the old one.</p>}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}

/** A signed agreement as a printable record (the signer, or an admin). */
export function SignedRecordPage() {
  const { id = '' } = useParams()
  const rec = useApi(() => api.submission(Number(id)), [id])
  if (rec.loading && !rec.data) return <><TopBar /><Spinner label="Loading record" /></>
  if (rec.error || !rec.data) return <><TopBar /><ErrorState message={rec.error ?? 'Not found.'} onRetry={rec.reload} /></>
  const r = rec.data
  return (
    <>
      <TopBar />
      <article className="card record">
        <div className="record__head">
          <p className="label-muted">SIGNED AGREEMENT</p>
          <button type="button" className="btn btn--ghost btn--small no-print" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
        <h1 className="display-sm">{r.title}</h1>
        <div className="record__body"><p className="body-sm-dark prewrap">{r.body}</p></div>
        <dl className="record__meta">
          <div><dt className="label-muted">SIGNED BY</dt><dd className="record__sig">{r.typedName}</dd></div>
          <div><dt className="label-muted">ACCOUNT</dt><dd className="body-sm-dark">{r.signer.name} · {r.signer.email}</dd></div>
          <div><dt className="label-muted">DATE AND TIME</dt><dd className="body-sm-dark">{dateTime(r.submittedAt)}</dd></div>
          <div><dt className="label-muted">VERSION</dt><dd className="body-sm-dark">{r.version}</dd></div>
          <div><dt className="label-muted">DOCUMENT FINGERPRINT</dt><dd className="body-xs record__hash">SHA-256 {r.bodyHash}</dd></div>
          {r.ip !== undefined && <div><dt className="label-muted">SIGNED FROM</dt><dd className="body-xs">{r.ip || 'unknown'} · {r.userAgent || ''}</dd></div>}
        </dl>
        <p className="body-xs">Signed electronically: the signer confirmed they had read the agreement, consented to sign electronically, and typed their name as their signature.</p>
      </article>
    </>
  )
}
