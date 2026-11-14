import { createFileRoute } from '@tanstack/react-router'
import { StatsPage } from '#/components/StatsPage'
import { statsHead } from './-heads'
import { fetchStats } from './-server'

export const Route = createFileRoute('/stats')({
  loader: () => fetchStats(),
  head: () => statsHead('zh'),
  component: () => <StatsPage lang="zh" stats={Route.useLoaderData()} />,
})
