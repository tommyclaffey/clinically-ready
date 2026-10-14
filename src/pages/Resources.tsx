import { useState } from 'react'
import { api } from '../api'
import { TopBar } from '../components/Shell'
import { EmptyState, ErrorState, PageHead, ResourceCard, Spinner } from '../components/ui'
import { useApi } from '../lib/useApi'
import { useTerms } from '../lib/terms'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Resource', label: 'Resources' },
  { key: 'Policy', label: 'Policies' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

export function ResourcesPage() {
  const terms = useTerms()
  const { data, error, loading, reload } = useApi(() => api.resources())
  const [filter, setFilter] = useState<FilterKey>('all')

  const list = (data ?? []).filter((r) => filter === 'all' || r.category === filter)

  return (
    <>
      <TopBar />
      <PageHead label="RESOURCE LIBRARY" title="Resources and policies">
        Handbooks, templates and {terms.org} policies. Everything here downloads straight to your device.
      </PageHead>
      <div className="filters" role="group" aria-label="Filter resources">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`pill ${filter === f.key ? 'is-active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {data && <span className="pill__n">{f.key === 'all' ? data.length : data.filter((r) => r.category === f.key).length}</span>}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <Spinner label="Loading resources" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : list.length ? (
        <ul className="file-grid" aria-live="polite">
          {list.map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}
        </ul>
      ) : (
        <EmptyState title={filter === 'Policy' ? 'No policies yet' : 'No resources yet'}>
          Your {terms.org} hasn’t uploaded anything here.
        </EmptyState>
      )}
    </>
  )
}
