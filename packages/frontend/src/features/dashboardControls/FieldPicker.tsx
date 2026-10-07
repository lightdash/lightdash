import {
    type DashboardFilterableField,
    type FilterType,
} from '@lightdash/common';
import { Group, Select, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { foldFieldGrains } from './fieldGrains';
import { filterFieldsByKind } from './fieldKinds';
import classes from './FieldPicker.module.css';

type Props = {
    fields: DashboardFilterableField[];
    getTileCount: (field: DashboardFilterableField) => number;
    onPickField: (field: DashboardFilterableField) => void;
    /** Narrows the list to one kind. */
    lockedKind?: FilterType;
    /** Opens the dropdown focused. */
    openOnMount?: boolean;
};

const pluralizeTiles = (count: number) => (count === 1 ? 'tile' : 'tiles');

export const FieldPicker: FC<Props> = ({
    fields,
    getTileCount,
    onPickField,
    lockedKind,
    openOnMount = false,
}) => {
    // One row per field, grains folded, sorted by explore then by name
    const rows = useMemo(
        () =>
            foldFieldGrains(
                filterFieldsByKind(fields, lockedKind ?? null),
            ).sort(
                (a, b) =>
                    a.tableLabel.localeCompare(b.tableLabel) ||
                    a.label.localeCompare(b.label),
            ),
        [fields, lockedKind],
    );
    const rowsByValue = useMemo(
        () => new Map(rows.map((row) => [row.key, row])),
        [rows],
    );

    return (
        <Select
            size="sm"
            searchable
            clearable={false}
            autoFocus={openOnMount}
            defaultDropdownOpened={openOnMount}
            placeholder="Search fields"
            aria-label="Search fields"
            nothingFoundMessage="No fields match"
            leftSection={<MantineIcon icon={IconSearch} />}
            comboboxProps={{ withinPortal: true }}
            maxDropdownHeight={360}
            value={null}
            data={rows.map((row) => ({
                value: row.key,
                label: `${row.tableLabel} ${row.label}`,
            }))}
            renderOption={({ option }) => {
                const row = rowsByValue.get(option.value);
                if (row === undefined) return option.label;
                const count = getTileCount(row.field);
                return (
                    <Group gap="xs" wrap="nowrap" flex={1}>
                        <FieldIcon item={row.field} size={14} aria-hidden />
                        <Text fz="sm" truncate className={classes.rowText}>
                            <Text span c="dimmed">
                                {row.tableLabel}
                            </Text>{' '}
                            {row.label}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {count} {pluralizeTiles(count)}
                        </Text>
                    </Group>
                );
            }}
            onChange={(value) => {
                const row = value === null ? undefined : rowsByValue.get(value);
                if (row) onPickField(row.field);
            }}
        />
    );
};
