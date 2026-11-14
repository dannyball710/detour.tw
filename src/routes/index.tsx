import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '#/components/HomePage'
import { homeHead } from './-heads'
import { fetchStats } from './-server'

export const Route = createFileRoute('/')({
  loader: () => fetchStats(),
  // An in-page link (#why) is a navigation to this same route; that must not refetch.
  shouldReload: false,
  head: () => homeHead('zh'),
  component: () => <HomePage lang="zh" stats={Route.useLoaderData()} />,
})
