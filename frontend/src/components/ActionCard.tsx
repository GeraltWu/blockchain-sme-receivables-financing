import { Paper, Stack, Text, Title } from '@mantine/core'

interface ActionCardProps {
  title: string
  description: string
  children: React.ReactNode
}

export function ActionCard({ title, description, children }: ActionCardProps) {
  return (
    <Paper radius="lg" p="lg" withBorder>
      <Stack gap="md">
        <div>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed" mt={4}>{description}</Text>
        </div>
        {children}
      </Stack>
    </Paper>
  )
}

