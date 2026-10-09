import { Center, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { PageHeader } from './PageHeader'

interface ComingSoonProps {
  title: string
  description: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <>
      <PageHeader eyebrow="Planned module" title={title} description={description} badge="Coming soon" />
      <Paper className="empty-panel" radius="lg" p="md" withBorder>
        <Center>
          <Stack align="center" gap="xs" ta="center">
            <ThemeIcon size={48} radius="xl" color="gray" variant="light">···</ThemeIcon>
            <Title order={3}>Reserved in the product flow</Title>
            <Text c="dimmed" maw={440}>This service is being prepared and will be available in a future release.</Text>
          </Stack>
        </Center>
      </Paper>
    </>
  )
}

