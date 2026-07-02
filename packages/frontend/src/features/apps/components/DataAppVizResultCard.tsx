import { type DataAppVizField, type DataAppVizSchema } from '@lightdash/common';
import { Badge, Card, Group, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';

const TYPE_COLOR: Record<DataAppVizField['type'], string> = {
    dimension: 'blue',
    metric: 'orange',
    series: 'grape',
};

type Props = {
    schema: DataAppVizSchema;
};

// Renders a data app viz's declared field schema as a summary card in the
// generator chat, instead of the raw `{"fields":[...]}` JSON reply.
const DataAppVizResultCard: FC<Props> = ({ schema }) => (
    <Card withBorder radius="md" p="sm">
        <Stack gap="xs">
            <Text size="sm" fw={600}>
                Visualization ready
            </Text>
            <Text size="xs" c="dimmed">
                {schema.fields.length} field
                {schema.fields.length === 1 ? '' : 's'} to map
            </Text>
            <Stack gap={4}>
                {schema.fields.map((f) => (
                    <Group key={f.name} justify="space-between" gap="xs">
                        <Text size="sm">{f.label}</Text>
                        <Group gap={4}>
                            <Badge
                                size="xs"
                                variant="light"
                                color={TYPE_COLOR[f.type]}
                            >
                                {f.type}
                            </Badge>
                            {f.required && (
                                <Badge size="xs" variant="outline" color="gray">
                                    required
                                </Badge>
                            )}
                        </Group>
                    </Group>
                ))}
            </Stack>
        </Stack>
    </Card>
);

export default DataAppVizResultCard;
