// Admin › Tools: the apps the team uses. Each gets a card on the Tools page, and can be placed on any step.
import { useId, useState, type FormEvent } from 'react'
import { api, type ToolApp, type ToolInput } from '../../api'
import { AppCard, AppIcon } from '../../components/AppCard'
import { ArrowDownIcon, ArrowUpIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { TopBar } from '../../components/Shell'
import { EmptyState, ErrorState, PageHead, Spinner } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { useTerms } from '../../lib/terms'

type Draft = Required<ToolInput> & { id: number | null }
const blank = (): Draft => ({ id: null, name: '', description: '', iconUrl: '', webUrl: '', macUrl: '', windowsUrl: '', iosUrl: '', androidUrl: '', signinNote: '' })

// Starting points. Only links checked against each company's own site; add app-store links yourself.
const PRESETS: { label: string; draft: Partial<Draft> }[] = [
  { label: 'SimplePractice', draft: { name: 'SimplePractice', description: 'Client records, scheduling, notes and billing.', webUrl: 'https://secure.simplepractice.com' } },
  { label: 'Slack', draft: { name: 'Slack', description: 'Team chat.', webUrl: 'https://slack.com/signin', macUrl: 'https://slack.com/downloads', windowsUrl: 'https://slack.com/downloads' } },
  { label: 'Notion', draft: { name: 'Notion', description: 'Docs, policies and the team wiki.', webUrl: 'https://www.notion.so/login', macUrl: 'https://www.notion.com/desktop', windowsUrl: 'https://www.notion.com/desktop' } },
  { label: 'Zoom', draft: { name: 'Zoom', description: 'Video calls and telehealth sessions.', webUrl: 'https://zoom.us/signin', macUrl: 'https://zoom.us/download', windowsUrl: 'https://zoom.us/download' } },
  { label: 'Microsoft Teams', draft: { name: 'Microsoft Teams', description: 'Chat and video calls.', webUrl: 'https://teams.microsoft.com', macUrl: 'https://www.microsoft.com/en-us/microsoft-teams/download-app', windowsUrl: 'https://www.microsoft.com/en-us/microsoft-teams/download-app' } },
  { label: 'Google Workspace', draft: { name: 'Gmail', description: 'Work email.', webUrl: 'https://mail.google.com' } },
]

export function AdminToolsPage() {
  const terms = useTerms()
  const apps = useApi(() => api.apps())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (apps.loading && !apps.data) return <><TopBar /><Spinner label="Loading tools" /></>
  if (apps.error || !apps.data) return <><TopBar /><ErrorState message={apps.error ?? 'No data.'} onRetry={apps.reload} /></>
  const list = apps.data

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      apps.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }
  const move = (i: number, d: number) => {
    const a = list[i]
    const b = list[i + d]
    if (!a || !b) return
    void run(async () => {
      await api.updateApp(a.id, { position: b.position })
      await api.updateApp(b.id, { position: a.position === b.position ? b.position + d : a.position })
    })
  }
  const remove = (a: ToolApp) => {
    if (!window.confirm(`Remove ${a.name}? It also comes off any step it was placed on.`)) return
    void run(() => api.deleteApp(a.id))
  }
  const edit = (a: ToolApp) => setDraft({ id: a.id, name: a.name, description: a.description, iconUrl: a.iconUrl, webUrl: a.webUrl, macUrl: a.macUrl, windowsUrl: a.windowsUrl, iosUrl: a.iosUrl, androidUrl: a.androidUrl, signinNote: a.signinNote })

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Tools">
        The apps your {terms.members} use. Each one gets a card on their Tools page with Open, downloads and how to bookmark it. You can also place a tool on any step in Content.
      </PageHead>

      {draft ? (
        <ToolEditor draft={draft} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); apps.reload() }} />
      ) : (
        <section className="card table-card" aria-labelledby="add-tool">
          <div className="table-card__head">
            <h2 id="add-tool" className="card-serif">Add a tool</h2>
            <button type="button" className="btn btn--dark btn--small" onClick={() => setDraft(blank())}><PlusIcon /> Custom tool</button>
          </div>
          <p className="body-sm">Start from a common one, then check the links match how your {terms.org} signs in.</p>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn--ghost btn--small-ghost" onClick={() => setDraft({ ...blank(), ...p.draft })}>
                <PlusIcon /> {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card table-card" aria-labelledby="tools-title">
        <div className="table-card__head">
          <h2 id="tools-title" className="card-serif">Your tools</h2>
          <p className="meta">{list.length} {list.length === 1 ? 'tool' : 'tools'}</p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!list.length ? (
          <EmptyState title="No tools yet">Add SimplePractice, Slack or whatever your team signs in to.</EmptyState>
        ) : (
          <ol className="tool-rows">
            {list.map((a, i) => (
              <li key={a.id} className="tool-row">
                <AppIcon app={a} size={36} />
                <span className="tool-row__text">
                  <span className="row-title-sm">{a.name}</span>
                  <span className="body-xs">
                    {[a.webUrl && 'Web', a.macUrl && 'Mac', a.windowsUrl && 'Windows', a.iosUrl && 'iPhone', a.androidUrl && 'Android'].filter(Boolean).join('  ·  ')}
                  </span>
                </span>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${a.name} up`}><ArrowUpIcon /></button>
                <button type="button" className="icon-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${a.name} down`}><ArrowDownIcon /></button>
                <button type="button" className="icon-btn" onClick={() => edit(a)} aria-label={`Edit ${a.name}`}><EditIcon /></button>
                <button type="button" className="icon-btn" onClick={() => remove(a)} aria-label={`Remove ${a.name}`}><TrashIcon /></button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

function Field({ label, value, onChange, hint, required, type = 'url', area }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; required?: boolean; type?: string; area?: boolean
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="link-slate">{label}{!required && <span className="body-xs"> (optional)</span>}</label>
      {area ? (
        <textarea id={id} className="input textarea" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} placeholder={type === 'url' ? 'https://' : undefined} />
      )}
      {hint && <p className="body-xs">{hint}</p>}
    </div>
  )
}

function ToolEditor({ draft, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { id, ...rest } = d
    const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v).trim()])) as ToolInput
    try {
      if (id) await api.updateApp(id, body)
      else await api.createApp(body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setBusy(false)
    }
  }

  const preview: ToolApp = { ...d, id: 0, position: 0, name: d.name || 'Tool name' }

  return (
    <section className="card table-card tool-editor" aria-labelledby="tool-ed">
      <h2 id="tool-ed" className="card-serif">{d.id ? `Edit ${draft.name}` : 'New tool'}</h2>
      <div className="tool-editor__cols">
        <form className="stack-18" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Name" type="text" value={d.name} onChange={set('name')} required />
            <Field label="What it’s for" type="text" value={d.description} onChange={set('description')} />
            <div className="form-grid__full">
              <Field label="Web app link" value={d.webUrl} onChange={set('webUrl')} hint="Where people sign in. The Open button goes here." />
            </div>
            <Field label="Mac download" value={d.macUrl} onChange={set('macUrl')} />
            <Field label="Windows download" value={d.windowsUrl} onChange={set('windowsUrl')} />
            <Field label="iPhone and iPad (App Store)" value={d.iosUrl} onChange={set('iosUrl')} />
            <Field label="Android (Google Play)" value={d.androidUrl} onChange={set('androidUrl')} />
            <div className="form-grid__full">
              <Field label="Sign-in note" type="text" area value={d.signinNote} onChange={set('signinNote')} hint="For example: “Use your work Google account. Ask the office for an invite if you don’t have one.”" />
            </div>
            <div className="form-grid__full">
              <Field label="Icon image link" value={d.iconUrl} onChange={set('iconUrl')} hint="Leave empty to use the site’s own icon." />
            </div>
          </div>
          <div className="editor-actions">
            <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : d.id ? 'Save tool' : 'Add tool'}</button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <div className="tool-editor__preview">
          <p className="label-muted">PREVIEW</p>
          <AppCard app={preview} />
        </div>
      </div>
    </section>
  )
}
