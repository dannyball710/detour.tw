import { createFileRoute } from '@tanstack/react-router'
import { MethodologyPage } from '#/components/MethodologyPage'
import { methodHead } from './-heads'

export const Route = createFileRoute('/methodology')({
  head: () => methodHead('zh'),
  component: () => <MethodologyPage lang="zh" />,
})
