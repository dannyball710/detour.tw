import { createFileRoute } from '@tanstack/react-router'
import { MethodologyPage } from '#/components/MethodologyPage'
import { methodHead } from '../-heads'

export const Route = createFileRoute('/en/methodology')({
  head: () => methodHead('en'),
  component: () => <MethodologyPage lang="en" />,
})
