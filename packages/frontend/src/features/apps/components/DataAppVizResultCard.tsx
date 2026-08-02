import { type DataAppVizSchema } from '@lightdash/common';
import { Card, Group, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';

type Props = {
    schema: DataAppVizSchema;
};

// Read-only summary of a data app viz's declared fields, shown on older history
// versions in the generator chat (the latest ready version renders the
// interactive DataAppVizTestPanel instead). Required fields aren't badged —
// required-ness is surfaced where it's actionable (the field-mapping step).
const DataAppVizResultCard: FC<Props> = ({ schema }) => (
    <Card withBorder radius="md" p="sm">
        <Stack gap="xs">
            <Text size="sm" fw={600}>
                Visualization ready
            </Text>
            <Stack gap={4}>
                {schema.fields.map((f) => (
                    <Group key={f.name} justify="space-between" gap="xs">
                        <Text size="sm">{f.label}</Text>
                        <DataAppVizFieldTypeBadge type={f.type} />
                    </Group>
                ))}
            </Stack>
        </Stack>
    </Card>
);

export default DataAppVizResultCard;
