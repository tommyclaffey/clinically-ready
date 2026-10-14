import { useId, useState, type FormEvent } from 'react'
import { api, type SignInMethods, type Terms } from '../../api'
import { useAuth } from '../../auth'
import { TopBar } from '../../components/Shell'
import { BrandMark, PageHead } from '../../components/ui'
import { DEFAULT_BRAND } from '../../lib/brand'
import { cap, PRESETS, termsOf } from '../../lib/terms'
import { useProviders } from '../../components/ProviderButtons'
import { AA_BODY, contrastRatio, formatRatio, normalizeHex } from '../../lib/contrast'

export function AdminSettingsPage() {
  const { practice, refresh } = useAuth()
  const [name, setName] = useState(practice?.name ?? '')
  const [hex, setHex] = useState(practice?.brandColor ?? DEFAULT_BRAND)
  const [logoUrl, setLogoUrl] = useState(practice?.logoUrl ?? '')
  const [terms, setTerms] = useState<Terms>(termsOf(practice?.terms))
  const [quote, setQuote] = useState(practice?.welcome?.quote ?? '')
  const [quoteRef, setQuoteRef] = useState(practice?.welcome?.ref ?? '')
  const [photoUrl, setPhotoUrl] = useState(practice?.welcome?.photoUrl ?? '')
  const [methods, setMethods] = useState<SignInMethods>(practice?.signIn ?? { password: true, google: true, microsoft: true })
  const providers = useProviders()
  const [cmLabel, setCmLabel] = useState(practice?.clientMessaging?.label ?? '')
  const [cmUrl, setCmUrl] = useState(practice?.clientMessaging?.url ?? '')
  const setTerm = (k: keyof Terms) => (v: string) => setTerms((t) => ({ ...t, [k]: v }))
  const preset = PRESETS.find((p) => (Object.keys(p.terms) as (keyof Terms)[]).every((k) => p.terms[k] === terms[k]))?.id ?? 'custom'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const cmIds = { label: useId(), url: useId() }
  const ids = { name: useId(), color: useId(), hex: useId(), logo: useId(), ratio: useId(), preset: useId(), quote: useId(), ref: useId(), photo: useId() }

  const norm = normalizeHex(hex)
  const ratio = norm ? contrastRatio(norm, '#FFFFFF') : null
  const passes = ratio !== null && ratio >= AA_BODY

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!norm) return setError('Enter a hex colour like #22688A.')
    if (!passes) return setError(`That colour is ${formatRatio(ratio!)}:1 against white. It needs at least 4.5:1 so links and labels stay readable.`)
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const cleanTerms = Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, v.trim()])) as unknown as Terms
      if (Object.values(cleanTerms).some((v) => !v)) return setError('Fill in every word in “Your words”.')
      await api.updatePractice({
        name: name.trim(), brandColor: norm.toUpperCase(), logoUrl: logoUrl.trim(),
        terms: cleanTerms,
        welcome: { quote: quote.trim(), ref: quoteRef.trim(), photoUrl: photoUrl.trim() },
        signInMethods: methods,
        clientMessaging: cmLabel.trim() || cmUrl.trim() ? { label: cmLabel.trim(), url: cmUrl.trim() } : null,
      })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN · OWNER" title={`${cap(termsOf(practice?.terms).org)} settings`}>
        Your name, brand, the words the app uses, and your sign-in page. Everyone on your team sees these.
      </PageHead>
      <div className="settings-grid">
        <form className="card form-card stack-18" onSubmit={submit}>
          <h2 className="card-serif">Brand</h2>
          <div className="field">
            <label htmlFor={ids.name} className="link-slate">Organisation name</label>
            <input id={ids.name} className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={ids.hex} className="link-slate">Brand colour</label>
            <div className="color-row">
              <input
                id={ids.color}
                type="color"
                className="color-swatch"
                aria-label="Pick brand colour"
                value={norm ?? '#22688a'}
                onChange={(e) => setHex(e.target.value.toUpperCase())}
              />
              <input
                id={ids.hex}
                className="input"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                aria-describedby={ids.ratio}
                aria-invalid={!passes}
                spellCheck={false}
                maxLength={7}
              />
            </div>
            <p id={ids.ratio} className={`contrast ${passes ? 'is-ok' : 'is-bad'}`} aria-live="polite">
              {ratio === null
                ? 'Enter a hex colour like #22688A.'
                : `${formatRatio(ratio)}:1 against white — ${passes ? 'passes' : 'fails'} WCAG AA (needs 4.5:1).`}
            </p>
          </div>
          <div className="field">
            <label htmlFor={ids.logo} className="link-slate">Logo URL</label>
            <input id={ids.logo} className="input" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
          </div>
          <h2 className="card-serif">Your words</h2>
          <p className="body-sm">The app uses these everywhere: a therapy practice says “clinician” and “supervisor”, a company says “team member” and “manager”.</p>
          <div className="field">
            <label htmlFor={ids.preset} className="link-slate">Start from</label>
            <select id={ids.preset} className="input" value={preset} onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) setTerms(p.terms) }}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="custom" disabled>Custom</option>
            </select>
          </div>
          <div className="terms-grid">
            <div className="field">
              <label htmlFor={`${ids.preset}-portal`} className="link-slate">Portal name</label>
              <input id={`${ids.preset}-portal`} className="input" required maxLength={40} value={terms.portal} onChange={(e) => setTerm('portal')(e.target.value)} placeholder="Clinician portal" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-member`} className="link-slate">One new hire is a…</label>
              <input id={`${ids.preset}-member`} className="input" required maxLength={40} value={terms.member} onChange={(e) => setTerm('member')(e.target.value)} placeholder="clinician" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-members`} className="link-slate">Several are…</label>
              <input id={`${ids.preset}-members`} className="input" required maxLength={40} value={terms.members} onChange={(e) => setTerm('members')(e.target.value)} placeholder="clinicians" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-lead`} className="link-slate">Their lead is a…</label>
              <input id={`${ids.preset}-lead`} className="input" required maxLength={40} value={terms.lead} onChange={(e) => setTerm('lead')(e.target.value)} placeholder="supervisor" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-org`} className="link-slate">Your organisation is a…</label>
              <input id={`${ids.preset}-org`} className="input" required maxLength={40} value={terms.org} onChange={(e) => setTerm('org')(e.target.value)} placeholder="practice" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-checklist`} className="link-slate">Checklist title</label>
              <input id={`${ids.preset}-checklist`} className="input" required maxLength={40} value={terms.checklist} onChange={(e) => setTerm('checklist')(e.target.value)} placeholder="Before your first client" />
            </div>
            <div className="field">
              <label htmlFor={`${ids.preset}-onboarding`} className="link-slate">Your onboarding is called</label>
              <input id={`${ids.preset}-onboarding`} className="input" required maxLength={40} value={terms.onboarding} onChange={(e) => setTerm('onboarding')(e.target.value)} placeholder="Clinical onboarding" />
              <p className="body-xs">Shown when someone shares a link to the app.</p>
            </div>
          </div>
          <h2 className="card-serif">How your team signs in</h2>
          <p className="body-sm">Invites still decide who gets in. These decide how invited people prove it’s them. Work accounts are safest: when someone leaves and you turn off their account, they lose access here too.</p>
          <fieldset className="checks">
            <legend className="sr-only">Allowed sign-in methods</legend>
            {([
              ['google', 'Google (Google Workspace or Gmail)'],
              ['microsoft', 'Microsoft (Microsoft 365 or Outlook)'],
              ['password', 'Email and password'],
            ] as const).map(([k, label]) => (
              <label key={k} className="check-row">
                <input type="checkbox" checked={methods[k]} onChange={(e) => setMethods((m) => ({ ...m, [k]: e.target.checked }))} />
                <span>{label}{k !== 'password' && providers && !providers[k] ? ' — not switched on for this app yet' : ''}</span>
              </label>
            ))}
          </fieldset>
          <h2 className="card-serif">Questions about clients</h2>
          <p className="body-sm">Client details belong in your records system, not here. Name it and add its link, and the app points people there whenever they ask a question. Leave both empty to hide it.</p>
          <div className="terms-grid">
            <div className="field">
              <label htmlFor={cmIds.label} className="link-slate">App name</label>
              <input id={cmIds.label} className="input" maxLength={40} value={cmLabel} onChange={(e) => setCmLabel(e.target.value)} placeholder="SimplePractice" />
            </div>
            <div className="field">
              <label htmlFor={cmIds.url} className="link-slate">Link</label>
              <input id={cmIds.url} className="input" type="url" value={cmUrl} onChange={(e) => setCmUrl(e.target.value)} placeholder="https://secure.simplepractice.com" />
            </div>
          </div>
          <h2 className="card-serif">Sign-in page</h2>
          <p className="body-sm">Shown beside the sign-in form at <span className="text-slate">/signin?org={practice?.slug}</span>. Leave the photo empty for a plain panel.</p>
          <div className="field">
            <label htmlFor={ids.photo} className="link-slate">Photo URL</label>
            <input id={ids.photo} className="input" type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="field">
            <label htmlFor={ids.quote} className="link-slate">Welcome quote</label>
            <textarea id={ids.quote} className="input" rows={3} maxLength={300} value={quote} onChange={(e) => setQuote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={ids.ref} className="link-slate">Quote credit</label>
            <input id={ids.ref} className="input" maxLength={60} value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} placeholder="MATTHEW 11:28" />
          </div>
          <p className="form-error" role="alert">{error}</p>
          <div className="editor-actions">
            <button type="submit" className="btn btn--dark" disabled={busy || !passes}>{busy ? 'Saving…' : 'Save settings'}</button>
            <p className="meta" role="status" aria-live="polite">{saved ? 'Saved' : ''}</p>
          </div>
        </form>
        <aside className="card form-card stack-18" aria-label="Preview">
          <h2 className="card-serif">Preview</h2>
          <div className="preview" style={{ ['--pv' as string]: norm ?? DEFAULT_BRAND }}>
            <div className="preview__brand">
              <BrandMark logoUrl={logoUrl} name={name} size={40} />
              <span className="brand">{name || 'Organisation name'}</span>
            </div>
            <p className="preview__label">LESSON 1  ·  WELCOME</p>
            <p className="preview__nav"><span>My onboarding</span><span className="preview__pill">3/9</span></p>
            <span className="preview__tile">PDF</span>
          </div>
        </aside>
      </div>
    </>
  )
}
