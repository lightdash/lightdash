import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';

export const BigQueryAgentConnectionCard = () => (
    <Paper p="md">
        <Stack gap="sm">
            <Group gap="sm">
                <Title order={5}>BigQuery</Title>
                <Badge color="gray">Nothing to do</Badge>
            </Group>
            <Text fz="sm" c="dimmed">
                Agents run as the AI service account your admin set up. You can
                still see everything you normally can.
            </Text>
        </Stack>
    </Paper>
);
