import { type DashboardFilterableField } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import classes from './FieldsAndTiles.module.css';

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
};

export const FieldRow: FC<Props> = ({ field, label, tableLabel }) => (
    <Stack className={classes.row} gap={2}>
        <Group gap="xs" wrap="nowrap">
            {field !== null && <FieldIcon item={field} size={14} aria-hidden />}
            <Text fz="sm" fw={600} truncate>
                {label}
            </Text>
        </Group>
        <Text fz="xs" c="dimmed" truncate>
            {tableLabel}
        </Text>
    </Stack>
);
