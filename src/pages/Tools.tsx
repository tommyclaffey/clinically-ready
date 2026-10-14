// Tools: the apps the team uses, each with Open, downloads and how to bookmark it.
import { api } from '../api'
import { AppCard } from '../components/AppCard'
import { TopBar } from '../components/Shell'
import { EmptyState, ErrorState, PageHead, Spinner } from '../components/ui'
import { useApi } from '../lib/useApi'
import { useTerms } from '../lib/terms'

export function ToolsPage() {
  const terms = useTerms()
  const apps = useApi(() => api.apps())
  return (
    <>
      <TopBar />
      <PageHead label="TOOLS" title="The apps we use">
        Open each one, download it to your computer or phone, and bookmark it so it’s one click away.
      </PageHead>
      {apps.loading && !apps.data ? (
        <Spinner label="Loading tools" />
      ) : apps.error || !apps.data ? (
        <ErrorState message={apps.error ?? 'Could not load tools.'} onRetry={apps.reload} />
      ) : !apps.data.length ? (
        <EmptyState title="No tools yet">Your {terms.org} hasn’t added any apps.</EmptyState>
      ) : (
        <div className="tools-grid">
          {apps.data.map((a) => <AppCard key={a.id} app={a} />)}
        </div>
      )}
    </>
  )
}
