import { Badge, Group, Stack, Text, Title } from '@mantine/core'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
  badge?: string
}

export function PageHeader({ eyebrow, title, description, badge }: PageHeaderProps) {
  return (
    <Stack gap={6}>
      <Group gap="sm">
        <Text className="eyebrow">{eyebrow}</Text>
        {badge && <Badge color="gray" variant="light">{badge}</Badge>}
      </Group>
      <Title order={1}>{title}</Title>
      <Text c="dimmed" maw={680}>{description}</Text>
    </Stack>
  )
}

