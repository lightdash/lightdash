import {
    type FilterType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { Group, Select, Stack, Text } from '@mantine/core';
import { IconSearch, IconVariable } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { foldFieldGrains } from './fieldGrains';
import {
    filterFieldsByKind,
    filterParametersByKind,
    type PickableParameter,
} from './fieldKinds';
import classes from './FieldPicker.module.css';

type Props = {
    fields: DashboardFilterableField[];
    getChartCount: (field: DashboardFilterableField) => number;
    onPickField: (field: DashboardFilterableField) => void;
    parameters: PickableParameter[];
    /** Parameters are listed only when given. */
    onPickParameter?: (key: string) => void;
    /** Narrows the list to one kind, as "Add a field" needs. */
    lockedKind?: FilterType;
    /** Opens the dropdown focused, for the Add a field flow. */
    openOnMount?: boolean;
};

const pluralizeCharts = (count: number) => (count === 1 ? 'chart' : 'charts');

export const FieldPicker: FC<Props> = ({
    fields,
    getChartCount,
    onPickField,
    parameters,
    onPickParameter,
    lockedKind,
    openOnMount = false,
}) => {
    const activeKind = lockedKind ?? null;
    const pickableFields = useMemo(
        () => filterFieldsByKind(fields, activeKind),
        [fields, activeKind],
    );
    const pickableParameters = useMemo(
        () =>
            onPickParameter === undefined
                ? []
                : filterParametersByKind(parameters, activeKind),
        [parameters, activeKind, onPickParameter],
    );
    // One row per field, grains folded, sorted by explore then by name
    const rows = useMemo(
        () =>
            foldFieldGrains(pickableFields).sort(
                (a, b) =>
                    a.tableLabel.localeCompare(b.tableLabel) ||
                    a.label.localeCompare(b.label),
            ),
        [pickableFields],
    );
    const parameterRows = pickableParameters;
    const rowsByValue = useMemo(
        () => new Map(rows.map((row) => [`field:${row.key}`, row])),
        [rows],
    );
    const parametersByValue = useMemo(
        () =>
            new Map(
                parameterRows.map((parameter) => [
                    `parameter:${parameter.key}`,
                    parameter,
                ]),
            ),
        [parameterRows],
    );
    const listsParameters = onPickParameter !== undefined;
    const searchLabel = listsParameters
        ? 'Search fields and parameters'
        : 'Search fields';

    return (
        <Stack gap="sm">
            <Select
                size="sm"
                searchable
                clearable={false}
                autoFocus={openOnMount}
                defaultDropdownOpened={openOnMount}
                placeholder={searchLabel}
                aria-label={searchLabel}
                nothingFoundMessage={
                    listsParameters
                        ? 'No fields or parameters match'
                        : 'No fields match'
                }
                leftSection={<MantineIcon icon={IconSearch} />}
                comboboxProps={{ withinPortal: true }}
                maxDropdownHeight={360}
                value={null}
                data={[
                    ...(rows.length > 0
                        ? [
                              {
                                  group: 'Fields',
                                  items: rows.map((row) => ({
                                      value: `field:${row.key}`,
                                      label: `${row.tableLabel} ${row.label}`,
                                  })),
                              },
                          ]
                        : []),
                    ...(parameterRows.length > 0
                        ? [
                              {
                                  group: 'Parameters',
                                  items: parameterRows.map((parameter) => ({
                                      value: `parameter:${parameter.key}`,
                                      label: parameter.label,
                                  })),
                              },
                          ]
                        : []),
                ]}
                renderOption={({ option }) => {
                    const row = rowsByValue.get(option.value);
                    const parameter = parametersByValue.get(option.value);
                    const count = row
                        ? getChartCount(row.field)
                        : (parameter?.chartCount ?? 0);
                    return (
                        <Group gap="xs" wrap="nowrap" flex={1}>
                            {row ? (
                                <FieldIcon
                                    item={row.field}
                                    size={14}
                                    aria-hidden
                                />
                            ) : (
                                <MantineIcon
                                    icon={IconVariable}
                                    color="dimmed"
                                    aria-hidden
                                />
                            )}
                            <Text fz="sm" truncate className={classes.rowText}>
                                {row ? (
                                    <>
                                        <Text span c="dimmed">
                                            {row.tableLabel}
                                        </Text>{' '}
                                        {row.label}
                                    </>
                                ) : (
                                    option.label
                                )}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {count} {pluralizeCharts(count)}
                            </Text>
                        </Group>
                    );
                }}
                onChange={(value) => {
                    if (value === null) return;
                    const row = rowsByValue.get(value);
                    if (row) {
                        onPickField(row.field);
                        return;
                    }
                    const parameter = parametersByValue.get(value);
                    if (parameter) onPickParameter?.(parameter.key);
                }}
            />
        </Stack>
    );
};
