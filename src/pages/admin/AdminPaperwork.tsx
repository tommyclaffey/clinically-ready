// Admin › Paperwork: agreements people sign, and (optional, switched on by the owner) tax and employment
// forms people fill in and hand in.
import { useId, useState, type FormEvent } from 'react'
import { api, type AdminForm, type FormInput, type FormKind, type JobPosition } from '../../api'
import { TopBar } from '../../components/Shell'
import { EmptyState, ErrorState, PageHead, Spinner } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../auth'
import { useTerms } from '../../lib/terms'

type Draft = { id: number | null; kind: FormKind; title: string; body: string; templateUrl: string; positionId: number | null; required: boolean }

const blank = (kind: FormKind): Draft => ({ id: null, kind, title: '', body: '', templateUrl: '', positionId: null, required: true })

// Official blank forms. W-9 is what a contractor fills in; the practice then issues them a 1099 at year end.
const PRESETS: { label: string; draft: Partial<Draft> }[] = [
  { label: 'W-4 (employees)', draft: { title: 'Form W-4: Employee’s Withholding Certificate', templateUrl: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf', body: 'For W-2 employees. Fill in the federal W-4 so payroll withholds the right amount of tax.' } },
  { label: 'W-9 (1099 contractors)', draft: { title: 'Form W-9: Request for Taxpayer Identification Number', templateUrl: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf', body: 'For independent contractors paid on a 1099. Fill in the W-9 so we can issue your 1099 at the end of the year.' } },
  { label: 'Direct deposit', draft: { title: 'Direct deposit authorization', templateUrl: '', body: 'Upload a voided cheque or your bank’s direct deposit letter.' } },
]

export function AdminPaperworkPage() {
  const { me } = useAuth()
  const terms = useTerms()
  const data = useApi(() => api.adminForms())
  const positions = useApi(() => api.positions())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const isOwner = me?.role === 'owner'

  const toggle = async (on: boolean) => {
    setToggling(true)
    setToggleError(null)
    try {
      await api.setPaperworkEnabled(on)
      data.reload()
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Could not change that setting.')
    } finally {
      setToggling(false)
    }
  }

  if (data.loading && !data.data) return <><TopBar /><Spinner label="Loading paperwork" /></>
  if (data.error || !data.data) return <><TopBar /><ErrorState message={data.error ?? 'No data.'} onRetry={data.reload} /></>
  const { forms, paperworkEnabled, secureStorage } = data.data
  const agreements = forms.filter((f) => f.kind === 'sign')
  const uploads = forms.filter((f) => f.kind === 'upload')
  const edit = (f: AdminForm) => setDraft({ id: f.id, kind: f.kind, title: f.title, body: f.body, templateUrl: f.templateUrl, positionId: f.positionId, required: f.required })

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Paperwork">
        Agreements your {terms.members} sign during onboarding, and the tax and employment forms they hand in. Who has finished what shows on each person’s results page.
      </PageHead>

      {draft && <FormEditor draft={draft} positions={positions.data ?? []} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); data.reload() }} />}

      <section className="card table-card" aria-labelledby="ag-title">
        <div className="table-card__head">
          <div>
            <h2 id="ag-title" className="card-serif">Agreements to sign</h2>
            <p className="body-xs">Read, consent, type their name. Each signature keeps the exact text signed, the time, and where it was signed from.</p>
          </div>
          <button type="button" className="btn btn--dark btn--small" onClick={() => setDraft(blank('sign'))}>Add an agreement</button>
        </div>
        <FormTable forms={agreements} onEdit={edit} onChanged={data.reload} empty="No agreements yet. Add one, such as a confidentiality agreement or a handbook acknowledgement." />
      </section>

      <section className="card table-card" aria-labelledby="tx-title">
        <div className="table-card__head">
          <div>
            <h2 id="tx-title" className="card-serif">Tax and employment forms</h2>
            <p className="body-xs">W-4, W-9, direct deposit and the like. People download the official blank form, fill it in and upload it. Files are encrypted and only admins can open them.</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={paperworkEnabled} disabled={!isOwner || toggling || (!paperworkEnabled && !secureStorage)} onChange={(e) => toggle(e.target.checked)} />
            <span className="switch__track" aria-hidden="true"><span /></span>
            <span className="body-sm-dark">{paperworkEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        {toggleError && <p className="form-error" role="alert">{toggleError}</p>}
        {!isOwner && <p className="body-xs">Only the owner can switch this on or off.</p>}
        {!secureStorage && <p className="hint body-sm-dark">Secure storage isn’t set up on this server yet, so these forms can’t be switched on.</p>}
        {paperworkEnabled ? (
          <>
            <div className="preset-row">
              <span className="body-xs">Quick add:</span>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="pill" onClick={() => setDraft({ ...blank('upload'), ...p.draft })}>{p.label}</button>
              ))}
              <button type="button" className="pill" onClick={() => setDraft(blank('upload'))}>Other form</button>
            </div>
            <FormTable forms={uploads} onEdit={edit} onChanged={data.reload} empty="No forms yet. Use Quick add above." />
            <p className="body-xs">Tip: once a form is in your payroll system, delete the stored copy from the person’s results page. The record that they handed it in stays.</p>
          </>
        ) : (
          <p className="body-sm">Off. Your team won’t see any tax or employment forms. {uploads.length ? `${uploads.length} saved form${uploads.length === 1 ? ' is' : 's are'} hidden until you switch this back on.` : ''}</p>
        )}
      </section>
    </>
  )
}

function FormTable({ forms, onEdit, onChanged, empty }: { forms: AdminForm[]; onEdit: (f: AdminForm) => void; onChanged: () => void; empty: string }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!forms.length) return <EmptyState title="Nothing here yet">{empty}</EmptyState>

  const remove = async (f: AdminForm) => {
    if (!window.confirm(`Remove “${f.title}”? If anyone has already signed or handed it in, it’s archived instead so their records stay.`)) return
    setBusy(f.id)
    setError(null)
    try {
      await api.deleteForm(f.id)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that.')
    } finally {
      setBusy(null)
    }
  }
  const restore = async (f: AdminForm) => {
    setBusy(f.id)
    try {
      await api.updateForm(f.id, { active: true })
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">For</th>
              <th scope="col">Done</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {forms.map((f) => (
              <tr key={f.id} className={f.active ? '' : 'is-archived'}>
                <th scope="row" className="cell-stack">
                  <span className="row-title-sm">{f.title}</span>
                  <span className="body-xs">
                    {f.required ? 'Required' : 'Optional'}
                    {f.kind === 'sign' && f.version > 1 ? `  ·  Version ${f.version}` : ''}
                    {!f.active ? '  ·  Archived' : ''}
                  </span>
                </th>
                <td className="body-sm">{f.positionName ?? 'Everyone except owners'}</td>
                <td className="body-sm">{f.done} of {f.assigned}</td>
                <td className="cell-actions">
                  {f.active ? (
                    <>
                      <button type="button" className="btn-ghost-text text-btn" onClick={() => onEdit(f)}>Edit</button>
                      <button type="button" className="btn-ghost-text text-btn" disabled={busy === f.id} onClick={() => remove(f)}>Remove</button>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost-text text-btn" disabled={busy === f.id} onClick={() => restore(f)}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FormEditor({ draft, positions, onCancel, onSaved }: { draft: Draft; positions: JobPosition[]; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const sign = d.kind === 'sign'
  const set = <K extends keyof Draft>(k: K) => (value: Draft[K]) => setD((x) => ({ ...x, [k]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body: FormInput = { title: d.title, body: d.body, positionId: d.positionId, required: d.required, ...(sign ? {} : { templateUrl: d.templateUrl }) }
    try {
      if (d.id) await api.updateForm(d.id, body)
      else await api.createForm({ ...body, kind: d.kind })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setBusy(false)
    }
  }

  return (
    <section className="card form-card" aria-labelledby={`${id}-t`}>
      <form className="stack-18" onSubmit={submit}>
        <h2 id={`${id}-t`} className="card-serif">{d.id ? 'Edit' : 'New'} {sign ? 'agreement' : 'form'}</h2>
        <div className="field">
          <label htmlFor={`${id}-title`} className="link-slate">Title</label>
          <input id={`${id}-title`} className="input" required maxLength={160} value={d.title} onChange={(e) => set('title')(e.target.value)} placeholder={sign ? 'Confidentiality agreement' : 'Form W-4'} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-body`} className="link-slate">{sign ? 'Agreement text (what they read and sign)' : 'Instructions (optional)'}</label>
          <textarea id={`${id}-body`} className="input textarea" rows={sign ? 14 : 4} required={sign} value={d.body} onChange={(e) => set('body')(e.target.value)} placeholder={sign ? 'Paste your agreement here. Your lawyer or HR provider should approve the wording.' : ''} />
          {sign && d.id && <p className="body-xs">Changing the text creates a new version. Anyone who signed the old one is asked to sign again.</p>}
        </div>
        {!sign && (
          <div className="field">
            <label htmlFor={`${id}-tpl`} className="link-slate">Link to the blank form <span className="body-xs">(optional)</span></label>
            <input id={`${id}-tpl`} className="input" type="url" value={d.templateUrl} onChange={(e) => set('templateUrl')(e.target.value)} placeholder="https://www.irs.gov/pub/irs-pdf/fw4.pdf" />
          </div>
        )}
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-pos`} className="link-slate">Who it’s for</label>
            <select id={`${id}-pos`} className="input" value={d.positionId ?? ''} onChange={(e) => set('positionId')(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Everyone</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
            </select>
          </div>
          <label className="check-row pw-required">
            <input type="checkbox" checked={d.required} onChange={(e) => set('required')(e.target.checked)} />
            <span className="body-sm-dark">Required to finish onboarding</span>
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pw-form__btns">
          <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : d.id ? 'Save changes' : sign ? 'Add agreement' : 'Add form'}</button>
          <button type="button" className="btn-ghost-text text-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  )
}
