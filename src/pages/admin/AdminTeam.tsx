import { useId, useState, type FormEvent } from 'react'
import { api, type AdminUser, type JobPosition, type Role } from '../../api'
import { useAuth } from '../../auth'
import { CopyIcon } from '../../components/Icons'
import { roleName, TopBar } from '../../components/Shell'
import { Avatar, EmptyState, ErrorState, PageHead, Spinner } from '../../components/ui'
import { relativeDate } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { cap, useTerms } from '../../lib/terms'

const isActive = (u: AdminUser) => u.active !== false && u.active !== 0

export function AdminTeamPage() {
  const { me } = useAuth()
  const terms = useTerms()
  const team = useApi(() => api.adminTeam())
  const positions = useApi(() => api.positions())
  const [rowError, setRowError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const roles: Role[] = me?.role === 'owner' ? ['owner', 'admin', 'clinician'] : ['admin', 'clinician']

  const update = async (u: AdminUser, patch: { role?: Role; active?: boolean; positionId?: number | null }) => {
    setBusyId(u.id)
    setRowError(null)
    try {
      await api.updateUser(u.id, patch)
      team.setData((t) =>
        t ? { ...t, users: t.users.map((x) => (x.id === u.id ? { ...x, ...patch } : x)) } : t,
      )
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not update that person.')
    } finally {
      setBusyId(null)
    }
  }

  const revoke = async (email: string) => {
    setRowError(null)
    try {
      await api.revokeInvite(email)
      team.setData((t) => (t ? { ...t, invites: t.invites.filter((i) => i.email !== email) } : t))
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not revoke that invite.')
    }
  }

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Invites and roles">
        Invite {terms.members} and staff, change roles, and turn off access for people who have left.
      </PageHead>
      <InviteForm roles={roles} positions={positions.data ?? []} onCreated={team.reload} />

      {team.loading && !team.data ? (
        <Spinner label="Loading team" />
      ) : team.error ? (
        <ErrorState message={team.error} onRetry={team.reload} />
      ) : team.data ? (
        <>
          {rowError && <p className="form-error banner-error" role="alert">{rowError}</p>}
          <section className="card table-card" aria-labelledby="people-title">
            <div className="table-card__head">
              <h2 id="people-title" className="card-serif">People</h2>
              <p className="meta">{team.data.users.filter(isActive).length} active</p>
            </div>
            {team.data.users.length === 0 ? (
              <EmptyState title="No one yet" />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      {(positions.data?.length ?? 0) > 0 && <th scope="col">Position</th>}
                      <th scope="col">Access</th>
                      <th scope="col">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.data.users.map((u) => {
                      const self = u.id === me?.id
                      const active = isActive(u)
                      return (
                        <tr key={u.id} className={active ? '' : 'is-inactive'}>
                          <th scope="row">
                            <span className="cell-person">
                              <Avatar initials={u.initials} size={36} />
                              <span>
                                <span className="row-title-sm">{u.name}{self ? ' (you)' : ''}</span>
                                <span className="body-xs">{u.title}</span>
                              </span>
                            </span>
                          </th>
                          <td className="body-sm">
                          {u.email}
                          {u.signsInWith && u.signsInWith.length > 0 && (
                            <span className="signin-tags" aria-label="Signs in with">
                              {u.signsInWith.map((m) => (
                                <span key={m} className="signin-tag">
                                  {m !== 'password' && <img src={`/brand/${m === 'google' ? 'google-g' : 'microsoft'}.svg`} alt="" />}
                                  {m === 'google' ? 'Google' : m === 'microsoft' ? 'Microsoft' : 'Password'}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                          <td>
                            <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.name}</label>
                            <select
                              id={`role-${u.id}`}
                              className="input input--sm"
                              value={u.role}
                              disabled={self || busyId === u.id || (u.role === 'owner' && me?.role !== 'owner')}
                              onChange={(e) => void update(u, { role: e.target.value as Role })}
                            >
                              {(roles.includes(u.role) ? roles : [u.role, ...roles]).map((r) => (
                                <option key={r} value={r}>{roleName(r, terms.member)}</option>
                              ))}
                            </select>
                          </td>
                          {(positions.data?.length ?? 0) > 0 && (
                            <td>
                              <label className="sr-only" htmlFor={`pos-${u.id}`}>Position for {u.name}</label>
                              <select
                                id={`pos-${u.id}`}
                                className="input input--sm"
                                value={u.positionId ?? ''}
                                disabled={busyId === u.id}
                                onChange={(e) => void update(u, { positionId: e.target.value ? Number(e.target.value) : null })}
                              >
                                <option value="">None</option>
                                {positions.data!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                          )}
                          <td>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={active}
                                disabled={self || busyId === u.id}
                                onChange={(e) => void update(u, { active: e.target.checked })}
                              />
                              <span className="switch__track" aria-hidden="true"><span /></span>
                              <span className="body-sm">{active ? 'Active' : 'Deactivated'}</span>
                              <span className="sr-only"> access for {u.name}</span>
                            </label>
                          </td>
                          <td className="body-sm">{relativeDate(u.lastSeenAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card table-card" aria-labelledby="inv-title">
            <div className="table-card__head">
              <h2 id="inv-title" className="card-serif">Pending invites</h2>
              <p className="meta">{team.data.invites.length} pending</p>
            </div>
            {team.data.invites.length === 0 ? (
              <EmptyState title="No pending invites">Invites you send show here until they’re accepted.</EmptyState>
            ) : (
              <ul className="invite-list">
                {team.data.invites.map((i) => (
                  <li key={i.email} className="invite-row">
                    <span>
                      <span className="row-title-sm">{i.name || i.email}</span>
                      <span className="body-xs">
                        {i.email}  ·  {roleName(i.role, terms.member)}
                        {i.expiresAt ? `  ·  expires ${new Date(i.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                      </span>
                    </span>
                    <button type="button" className="btn btn--ghost btn--small-ghost" onClick={() => void revoke(i.email)} aria-label={`Revoke invite for ${i.email}`}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}

function InviteForm({ roles, positions, onCreated }: { roles: Role[]; positions: JobPosition[]; onCreated: () => void }) {
  const terms = useTerms()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<Role>('clinician')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [positionId, setPositionId] = useState('')
  const ids = { email: useId(), name: useId(), title: useId(), role: useId(), link: useId(), pos: useId() }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setLink(null)
    setCopied(false)
    try {
      const r = await api.createInvite({ email: email.trim(), name: name.trim(), title: title.trim(), role, positionId: positionId ? Number(positionId) : null })
      setLink(new URL(r.inviteUrl, window.location.origin).toString())
      setEmail('')
      setName('')
      setTitle('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      ;(document.getElementById(ids.link) as HTMLInputElement | null)?.select()
    }
  }

  return (
    <section className="card form-card" aria-labelledby="invite-title">
      <h2 id="invite-title" className="card-serif">Invite someone</h2>
      <p className="body-xs">No email is sent. Copy the link and send it to them yourself. Links work once and expire in 7 days.</p>
      <form onSubmit={submit} className="form-grid">
        <div className="field">
          <label htmlFor={ids.email} className="link-slate">Email</label>
          <input id={ids.email} className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={ids.name} className="link-slate">Name</label>
          <input id={ids.name} className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={ids.title} className="link-slate">Title</label>
          <input id={ids.title} className="input" placeholder={cap(terms.member)} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={ids.role} className="link-slate">Role</label>
          <select id={ids.role} className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => <option key={r} value={r}>{roleName(r, terms.member)}</option>)}
          </select>
        </div>
        {positions.length > 0 && (
          <div className="field">
            <label htmlFor={ids.pos} className="link-slate">Position</label>
            <select id={ids.pos} className="input" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
              <option value="">None</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-grid__full">
          <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Creating…' : 'Create invite link'}</button>
        </div>
      </form>
      <p className="form-error" role="alert">{error}</p>
      {link && (
        <div className="invite-link" role="status">
          <label htmlFor={ids.link} className="link-slate">Invite link</label>
          <div className="invite-link__row">
            <input id={ids.link} className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn--ghost" onClick={() => void copy()}>
              <CopyIcon /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">{copied ? 'Invite link copied to clipboard' : ''}</p>
        </div>
      )}
    </section>
  )
}
