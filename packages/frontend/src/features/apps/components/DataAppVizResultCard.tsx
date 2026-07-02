import { type DataAppVizField, type DataAppVizSchema } from '@lightdash/common';
import { Badge, Card, Group, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { LD_FIELD_COLORS } from '../../../mantineTheme';

// Match the field-type colors used everywhere else (field icons, sidebar tree,
// AI-copilot field badges) via the canonical LD_FIELD_COLORS tokens. `series`
// has no Lightdash field-type equivalent, so it falls back to the neutral
// default. Keyed off the union type so a new field type breaks the build here.
const FIELD_TYPE_COLORS: Record<
    DataAppVizField['type'],
    { bg: string; color: string }
> = {
    dimension: LD_FIELD_COLORS.dimension,
    metric: LD_FIELD_COLORS.metric,
    series: LD_FIELD_COLORS.DEFAULT,
};

type Props = {
    schema: DataAppVizSchema;
};

// Renders a data app viz's declared field schema as a summary card in the
// generator chat, instead of the raw `{"fields":[...]}` JSON reply. Required
// fields aren't badged here — required-ness is surfaced where it's actionable
// (the field-mapping step), matching how Parameter inputs treat it.
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
                {schema.fields.map((f) => {
                    const colors = FIELD_TYPE_COLORS[f.type];
                    return (
                        <Group key={f.name} justify="space-between" gap="xs">
                            <Text size="sm">{f.label}</Text>
                            <Badge
                                size="xs"
                                radius="sm"
                                bg={colors.bg}
                                c={colors.color}
                            >
                                {f.type}
                            </Badge>
                        </Group>
                    );
                })}
            </Stack>
        </Stack>
    </Card>
);

export default DataAppVizResultCard;
