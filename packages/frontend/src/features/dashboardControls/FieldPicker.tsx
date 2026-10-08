import {
    type DashboardFilterableField,
    type FilterType,
} from '@lightdash/common';
import { Group, Select, Text } from '@mantine/core';
import { IconSearch, IconVariable } from '@tabler/icons-react';
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
    /** Parameters offered after the fields. */
    parameters?: ParameterOption[];
    onPickParameter?: (key: string) => void;
};

type ParameterOption = { key: string; label: string; tileCount: number };

const PARAMETER_PREFIX = 'parameter:';

const pluralizeTiles = (count: number) => (count === 1 ? 'tile' : 'tiles');

export const FieldPicker: FC<Props> = ({
    fields,
    getTileCount,
    onPickField,
    lockedKind,
    openOnMount = false,
    parameters,
    onPickParameter,
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
    const parametersByValue = useMemo(
        () =>
            new Map(
                (parameters ?? []).map((parameter) => [
                    `${PARAMETER_PREFIX}${parameter.key}`,
                    parameter,
                ]),
            ),
        [parameters],
    );
    const hasParameters = parametersByValue.size > 0;
    const searchLabel = hasParameters
        ? 'Search fields and parameters'
        : 'Search fields';
    const fieldOptions = rows.map((row) => ({
        value: row.key,
        label: `${row.tableLabel} ${row.label}`,
    }));

    return (
        <Select
            size="sm"
            searchable
            clearable={false}
            autoFocus={openOnMount}
            defaultDropdownOpened={openOnMount}
            placeholder={searchLabel}
            aria-label={searchLabel}
            nothingFoundMessage={
                hasParameters
                    ? 'No fields or parameters match'
                    : 'No fields match'
            }
            leftSection={<MantineIcon icon={IconSearch} />}
            comboboxProps={{ withinPortal: true }}
            maxDropdownHeight={360}
            value={null}
            data={
                hasParameters
                    ? [
                          { group: 'Fields', items: fieldOptions },
                          {
                              group: 'Parameters',
                              items: [...parametersByValue].map(
                                  ([value, parameter]) => ({
                                      value,
                                      label: parameter.label,
                                  }),
                              ),
                          },
                      ]
                    : fieldOptions
            }
            renderOption={({ option }) => {
                const parameter = parametersByValue.get(option.value);
                if (parameter !== undefined) {
                    return (
                        <Group gap="xs" wrap="nowrap" flex={1}>
                            <MantineIcon
                                icon={IconVariable}
                                size={14}
                                color="dimmed"
                                aria-hidden
                            />
                            <Text fz="sm" truncate className={classes.rowText}>
                                {parameter.label}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {parameter.tileCount}{' '}
                                {pluralizeTiles(parameter.tileCount)}
                            </Text>
                        </Group>
                    );
                }
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
                const parameter =
                    value === null ? undefined : parametersByValue.get(value);
                if (parameter !== undefined) {
                    onPickParameter?.(parameter.key);
                    return;
                }
                const row = value === null ? undefined : rowsByValue.get(value);
                if (row) onPickField(row.field);
            }}
        />
    );
};
