import { api } from '../api'
import { roleName, TopBar } from '../components/Shell'
import { Avatar, EmptyState, ErrorState, PageHead, Spinner } from '../components/ui'
import { useApi } from '../lib/useApi'
import { useTerms } from '../lib/terms'

export function TeamPage() {
  const { data, error, loading, reload } = useApi(() => api.team())
  const terms = useTerms()
  return (
    <>
      <TopBar />
      <PageHead label="TEAM DIRECTORY" title="Your team">
        The people you’ll work alongside. Questions for your {terms.lead} go through Support.
      </PageHead>
      {loading && !data ? (
        <Spinner label="Loading your team" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.length ? (
        <ul className="team-grid">
          {data.map((p) => (
            <li key={p.id} className="card team-card">
              <Avatar initials={p.initials} size={56} tone={p.role === 'clinician' ? 'blue' : 'media'} />
              <div>
                <p className="card-serif">{p.name}</p>
                <p className="body-sm">{p.title || '—'}</p>
              </div>
              <span className="role-tag">{roleName(p.role, terms.member)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No one here yet">Your {terms.org} owner will invite the team.</EmptyState>
      )}
    </>
  )
}
