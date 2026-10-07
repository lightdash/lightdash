import { FilterType, type DashboardFilterableField } from '@lightdash/common';
import {
    Box,
    Group,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAbc,
    IconCalendar,
    IconHash,
    IconSearch,
    IconToggleLeft,
    IconVariable,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { foldFieldGrains, matchesSearch } from './fieldGrains';
import {
    FIELD_KINDS,
    countPickableByKind,
    filterFieldsByKind,
    filterParametersByKind,
    matchesParameterSearch,
    type PickableParameter,
} from './fieldKinds';
import classes from './FieldPicker.module.css';

const KIND_META = {
    [FilterType.DATE]: { label: 'Date', icon: IconCalendar },
    [FilterType.STRING]: { label: 'Text', icon: IconAbc },
    [FilterType.NUMBER]: { label: 'Number', icon: IconHash },
    [FilterType.BOOLEAN]: { label: 'True or false', icon: IconToggleLeft },
};

type Props = {
    fields: DashboardFilterableField[];
    getChartCount: (field: DashboardFilterableField) => number;
    onPickField: (field: DashboardFilterableField) => void;
    parameters: PickableParameter[];
    /** Parameters are listed only when given. */
    onPickParameter?: (key: string) => void;
    /** Kind tiles are shown only when given. */
    onPickKind?: (kind: FilterType) => void;
    /** Narrows the list to one kind, as "Add a field" needs. */
    lockedKind?: FilterType;
};

const pluralizeCharts = (count: number) => (count === 1 ? 'chart' : 'charts');

export const FieldPicker: FC<Props> = ({
    fields,
    getChartCount,
    onPickField,
    parameters,
    onPickParameter,
    onPickKind,
    lockedKind,
}) => {
    const [search, setSearch] = useState('');
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
            foldFieldGrains(
                pickableFields.filter((field) => matchesSearch(field, search)),
            ).sort(
                (a, b) =>
                    a.tableLabel.localeCompare(b.tableLabel) ||
                    a.label.localeCompare(b.label),
            ),
        [pickableFields, search],
    );
    const parameterRows = useMemo(
        () =>
            pickableParameters.filter((parameter) =>
                matchesParameterSearch(parameter, search),
            ),
        [pickableParameters, search],
    );
    const counts = countPickableByKind(pickableFields, pickableParameters);
    const kinds = lockedKind ? [lockedKind] : FIELD_KINDS;
    const listsParameters = onPickParameter !== undefined;
    const searchLabel = listsParameters
        ? 'Search fields and parameters'
        : 'Search fields';

    return (
        <Stack gap="sm" className={classes.picker}>
            {onPickKind && (
                <>
                    <Text fz="sm" fw={600}>
                        What do you want to control?
                    </Text>
                    <SimpleGrid cols={2} spacing="xs">
                        {kinds.map((item) => {
                            const meta = KIND_META[item];
                            return (
                                <UnstyledButton
                                    key={item}
                                    className={classes.kindTile}
                                    onClick={() => onPickKind(item)}
                                >
                                    <MantineIcon icon={meta.icon} />
                                    <Text fz="sm">{meta.label}</Text>
                                    <Text fz="xs" c="dimmed">
                                        {counts[item]}
                                    </Text>
                                </UnstyledButton>
                            );
                        })}
                    </SimpleGrid>
                    <Text fz="sm" c="dimmed">
                        Alternatively, pick a field or parameter
                    </Text>
                </>
            )}
            <TextInput
                placeholder={searchLabel}
                autoFocus
                aria-label={searchLabel}
                leftSection={<MantineIcon icon={IconSearch} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Box className={classes.list}>
                {rows.length === 0 && parameterRows.length === 0 && (
                    <Text fz="xs" c="dimmed" px="xs">
                        {listsParameters
                            ? 'No fields or parameters match'
                            : 'No fields match'}
                    </Text>
                )}
                {rows.map((row) => {
                    const count = getChartCount(row.field);
                    return (
                        <UnstyledButton
                            key={row.key}
                            className={classes.fieldRow}
                            aria-label={`${row.tableLabel} ${row.label}`}
                            onClick={() => onPickField(row.field)}
                        >
                            <FieldIcon item={row.field} size={14} aria-hidden />
                            <Text fz="sm" truncate className={classes.rowText}>
                                <Text span c="dimmed">
                                    {row.tableLabel}
                                </Text>{' '}
                                {row.label}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {count} {pluralizeCharts(count)}
                            </Text>
                        </UnstyledButton>
                    );
                })}
                {parameterRows.length > 0 && (
                    <Group className={classes.groupHeader}>
                        <Text fz="xs" c="dimmed">
                            Parameters
                        </Text>
                    </Group>
                )}
                {parameterRows.map((parameter) => (
                    <UnstyledButton
                        key={parameter.key}
                        className={classes.fieldRow}
                        aria-label={parameter.label}
                        onClick={() => onPickParameter?.(parameter.key)}
                    >
                        <MantineIcon
                            icon={IconVariable}
                            color="dimmed"
                            aria-hidden
                        />
                        <Text fz="sm" truncate className={classes.rowText}>
                            {parameter.label}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {parameter.chartCount}{' '}
                            {pluralizeCharts(parameter.chartCount)}
                        </Text>
                    </UnstyledButton>
                ))}
            </Box>
        </Stack>
    );
};
