import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '#/components/HomePage'
import { homeHead } from '../-heads'
import { fetchStats } from '../-server'

export const Route = createFileRoute('/en/')({
  loader: () => fetchStats(),
  // An in-page link (#why) is a navigation to this same route; that must not refetch.
  shouldReload: false,
  head: () => homeHead('en'),
  component: () => <HomePage lang="en" stats={Route.useLoaderData()} />,
})
