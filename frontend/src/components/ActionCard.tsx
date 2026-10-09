import { Paper, Stack, Text, Title } from '@mantine/core'

interface ActionCardProps {
  title: string
  description: string
  children: React.ReactNode
}

export function ActionCard({ title, description, children }: ActionCardProps) {
  return (
    <Paper radius="lg" p="md" withBorder className="record-card">
      <Stack gap="sm">
        <div>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed" mt={4}>{description}</Text>
        </div>
        {children}
      </Stack>
    </Paper>
  )
}

