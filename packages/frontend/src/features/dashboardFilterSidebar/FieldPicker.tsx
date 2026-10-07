import {
    getDashboardFilterableFieldKey,
    type DashboardFilterableField,
} from '@lightdash/common';
import { Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    foldFieldGrains,
    matchesSearch,
    type FieldRowItem,
} from './fieldGrains';
import classes from './FieldsAndCharts.module.css';

const MAX_SHORTLIST = 6;
const MAX_SEARCH_RESULTS = 12;

type Props = {
    fields: DashboardFilterableField[];
    onPick: (field: DashboardFilterableField) => void;
    getChartCount: (field: DashboardFilterableField) => number;
};

type Row = {
    key: string;
    label: string;
    tableLabel: string;
    count: number;
    field: DashboardFilterableField;
};

const pluralizeCharts = (count: number) => (count === 1 ? 'chart' : 'charts');

export const FieldPicker: FC<Props> = ({ fields, onPick, getChartCount }) => {
    const getUiString = useUiStrings();
    const [search, setSearch] = useState('');
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const hasTabs = (dashboardTabs?.length ?? 0) > 1;

    const shortlist = useMemo<Row[]>(
        () =>
            foldFieldGrains(fields)
                .map((item: FieldRowItem) => ({
                    key: item.key,
                    label: item.label,
                    tableLabel: item.tableLabel,
                    field: item.field,
                    count: getChartCount(item.field),
                }))
                .sort(
                    (a, b) =>
                        b.count - a.count || a.label.localeCompare(b.label),
                )
                .slice(0, MAX_SHORTLIST),
        [fields, getChartCount],
    );

    const matches = useMemo<Row[]>(
        () =>
            search.trim() === ''
                ? []
                : fields
                      .filter((field) => matchesSearch(field, search))
                      .map((field) => ({
                          key: getDashboardFilterableFieldKey(field),
                          label: field.label,
                          tableLabel: field.tableLabel || field.table,
                          field,
                          count: getChartCount(field),
                      })),
        [fields, search, getChartCount],
    );

    const isSearching = search.trim() !== '';
    const rows = isSearching ? matches.slice(0, MAX_SEARCH_RESULTS) : shortlist;
    const overflow = isSearching ? matches.length - rows.length : 0;
    const hiddenCount = Math.max(fields.length - shortlist.length, 0);
    const duplicateLabels = new Set(
        rows
            .map((row) => row.label)
            .filter((label, index, all) => all.indexOf(label) !== index),
    );

    return (
        <Stack gap="xs">
            <TextInput
                placeholder={
                    hiddenCount > 0
                        ? `Search ${hiddenCount} more fields`
                        : 'Search fields'
                }
                aria-label="Search fields"
                leftSection={<MantineIcon icon={IconSearch} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {rows.length === 0 && (
                <Text fz="xs" c="dimmed">
                    No fields to add
                </Text>
            )}
            <Stack gap={0}>
                {!isSearching && hasTabs && rows.length > 0 && (
                    <Text fz="xs" fw={600} c="dimmed" px="xs">
                        {getUiString('filters.config.fieldsInThisTab')}
                    </Text>
                )}
                {rows.map((row) => (
                    <UnstyledButton
                        key={row.key}
                        className={classes.option}
                        onClick={() => onPick(row.field)}
                    >
                        <Text fz="sm" truncate>
                            {row.label}
                        </Text>
                        <Text fz="xs" c="dimmed" truncate>
                            {duplicateLabels.has(row.label)
                                ? `${row.tableLabel} · `
                                : ''}
                            {row.count} {pluralizeCharts(row.count)}
                        </Text>
                    </UnstyledButton>
                ))}
                {overflow > 0 && (
                    <Text fz="xs" c="dimmed" px="xs">
                        {overflow} more fields. Keep typing
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
