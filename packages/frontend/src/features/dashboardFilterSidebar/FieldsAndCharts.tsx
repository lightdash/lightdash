import { Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { type FilterReach } from './sidebarState';

type Props = {
    reach: FilterReach;
};

export const FieldsAndCharts: FC<Props> = ({ reach }) => (
    <Stack gap="xs">
        {reach.groups.map((group) => (
            <Group key={group.tabUuid ?? 'dashboard'} justify="space-between">
                <Text fz="sm" fw={500}>
                    {group.name}
                </Text>
                <Text fz="sm" c="dimmed">
                    {group.applied} of {group.total} charts
                </Text>
            </Group>
        ))}
    </Stack>
);
