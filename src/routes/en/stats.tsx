import { createFileRoute } from '@tanstack/react-router'
import { StatsPage } from '#/components/StatsPage'
import { statsHead } from '../-heads'
import { fetchStats } from '../-server'

export const Route = createFileRoute('/en/stats')({
  loader: () => fetchStats(),
  head: () => statsHead('en'),
  component: () => <StatsPage lang="en" stats={Route.useLoaderData()} />,
})
