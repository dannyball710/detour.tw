import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '#/components/HomePage'
import { ResultMissing } from '#/components/ResultPage'
import { resultHead } from '../-heads'
import { loadResultPage } from '../-server'

export const Route = createFileRoute('/r/$id')({
  loader: ({ params }) => loadResultPage(params.id),
  // An in-page link (#why) is a navigation to this same route; that must not refetch.
  shouldReload: false,
  head: ({ params, loaderData }) => resultHead('zh', params.id, loaderData?.result),
  component: Page,
  notFoundComponent: () => <ResultMissing lang="zh" />,
  // The database can fail for a moment; say so in the page's language instead of a stack trace.
  errorComponent: () => <ResultMissing lang="zh" kind="error" />,
})

function Page() {
  const { result, stats } = Route.useLoaderData()
  // Keyed: opening another result's link starts the page over with that result.
  return <HomePage key={result.id} lang="zh" stats={stats} shared={result} />
}
