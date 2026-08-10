import {
    FeatureFlags,
    getUnaccountedDimensions,
    MergeJoinType,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Group,
    MultiSelect,
    Paper,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import { useMerge } from '../context/useMerge';
import { useMergePivotValues, useMergeQueryRun } from '../hooks/useMergeQuery';

const MAX_PIVOT_VALUES = 50;
const SOURCE_A = 'a';
const SOURCE_B = 'b';
const JOIN_KEY = 'join_key';

/**
 * One query in the merge. Clicking it re-targets the field picker.
 *
 * Laid out as a grid rather than a flex row: the badge and the join selector
 * are fixed, the title takes what is left and truncates there. A flex row lets
 * a long explore name squeeze the badge until it clips.
 */
const QueryRow: FC<{
    color: string;
    name: string;
    title: string;
    subtitle: string;
    isFocused: boolean;
    isPlaceholder?: boolean;
    onFocus: () => void;
    joinControl: React.ReactNode;
    action?: React.ReactNode;
}> = ({
    color,
    name,
    title,
    subtitle,
    isFocused,
    isPlaceholder = false,
    onFocus,
    joinControl,
    action,
}) => (
    <Paper
        withBorder
        px="sm"
        py="xs"
        onClick={onFocus}
        style={{
            cursor: 'pointer',
            borderColor: isFocused
                ? `var(--mantine-color-${color}-5)`
                : undefined,
            boxShadow: isFocused
                ? `inset 3px 0 0 0 var(--mantine-color-${color}-5)`
                : undefined,
        }}
    >
        <Box
            style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
                alignItems: 'center',
                columnGap: 'var(--mantine-spacing-sm)',
            }}
        >
            <Badge color={color} variant="light" style={{ flex: 'none' }}>
                {name}
            </Badge>

            <Box style={{ minWidth: 0 }}>
                <Text
                    size="sm"
                    fw={500}
                    truncate
                    c={isPlaceholder ? 'dimmed' : undefined}
                >
                    {title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                    {subtitle}
                </Text>
            </Box>

            <Box onClick={(event) => event.stopPropagation()}>
                {joinControl}
            </Box>

            <Box onClick={(event) => event.stopPropagation()}>{action}</Box>
        </Box>
    </Paper>
);

/**
 * Merging is part of defining the query, not a way of viewing its output, so
 * this sits with the inputs rather than beside Results and SQL.
 *
 * The layout carries the correctness rule: a pivot chip belongs to a query row
 * because pre-pivoting repairs that query's grain, while the include chip
 * belongs to the join line because it describes the relationship.
 */
export const MergeQueryStrip: FC = () => {
    const projectUuid = useProjectUuid();
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const {
        isMerging,
        focus,
        queryB,
        joinFieldA,
        joinFieldB,
        joinType,
        pivotValues,
        addQuery,
        removeQuery,
        setFocus,
        setJoinFieldA,
        setJoinFieldB,
        setJoinType,
        setPivotValues,
    } = useMerge();

    const mergeRun = useMergeQueryRun(projectUuid);

    // Both sides default to their first dimension. Picking a dimension for a
    // query and then picking it again as the join field is the same choice
    // twice; the default is right almost always and stays overridable.
    const effectiveJoinFieldA = joinFieldA ?? metricQuery.dimensions[0] ?? null;
    const effectiveJoinFieldB = joinFieldB ?? queryB.dimensions[0] ?? null;

    const unaccounted = useMemo(() => {
        if (!effectiveJoinFieldA) return metricQuery.dimensions;
        return getUnaccountedDimensions(
            { id: SOURCE_A, metricQuery, pivot: null },
            [
                {
                    name: JOIN_KEY,
                    fieldIdBySourceId: { [SOURCE_A]: effectiveJoinFieldA },
                },
            ],
        );
    }, [metricQuery, effectiveJoinFieldA]);

    const pivotField = unaccounted[0] ?? null;

    const { data: pivotValueOptions, isLoading: isLoadingValues } =
        useMergePivotValues(
            projectUuid,
            metricQuery,
            pivotField,
            MAX_PIVOT_VALUES,
        );
    const suggestedValues = pivotValueOptions?.values ?? [];
    const effectivePivotValues =
        pivotValues.length > 0 ? pivotValues : suggestedValues;

    const canRun =
        !!effectiveJoinFieldA &&
        !!effectiveJoinFieldB &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        (unaccounted.length === 0 ||
            (unaccounted.length === 1 && effectivePivotValues.length > 0));

    const handleRun = () => {
        if (!effectiveJoinFieldA || !effectiveJoinFieldB || !queryB.exploreName)
            return;

        const mergeQuery: MergeQuery = {
            sources: [
                {
                    id: SOURCE_A,
                    metricQuery,
                    pivot: pivotField
                        ? {
                              fieldId: pivotField,
                              values: effectivePivotValues,
                              includeNulls: false,
                          }
                        : null,
                },
                {
                    id: SOURCE_B,
                    pivot: null,
                    metricQuery: {
                        exploreName: queryB.exploreName,
                        dimensions: queryB.dimensions,
                        metrics: queryB.metrics,
                        filters: {},
                        sorts: [],
                        limit: metricQuery.limit,
                        tableCalculations: [],
                    } satisfies MetricQuery,
                },
            ],
            joinKey: [
                {
                    name: JOIN_KEY,
                    fieldIdBySourceId: {
                        [SOURCE_A]: effectiveJoinFieldA,
                        [SOURCE_B]: effectiveJoinFieldB,
                    },
                },
            ],
            joinType,
            postPivot: null,
            tableCalculations: [],
            limit: metricQuery.limit,
        };

        mergeRun.mutate(mergeQuery);
    };

    const result = mergeRun.data;
    const columns = useMemo(
        () => (result?.rows.length ? Object.keys(result.rows[0]) : []),
        [result],
    );
    const labelByColumn = useMemo(
        () =>
            Object.fromEntries(
                (result?.compiled.fields ?? []).map((field) => [
                    field.column,
                    field.label,
                ]),
            ),
        [result],
    );

    // The entry point is the gate: with the flag off there is nothing to click,
    // so nobody reaches a half-released path by accident.
    if (!tableName || mergeFlag?.enabled !== true) return null;

    if (!isMerging) {
        return (
            <Group>
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={addQuery}
                >
                    Merge with another query
                </Button>
            </Group>
        );
    }

    return (
        <Stack gap="xs">
            <QueryRow
                color="blue"
                name="Query A"
                title={tableName}
                subtitle={`${metricQuery.metrics.length} metrics · ${metricQuery.dimensions.length} dimensions`}
                isFocused={focus === 'a'}
                onFocus={() => setFocus('a')}
                joinControl={
                    <Select
                        size="xs"
                        w={220}
                        placeholder="join on…"
                        data={metricQuery.dimensions.map((dimension) => ({
                            value: dimension,
                            label: dimension,
                        }))}
                        value={effectiveJoinFieldA}
                        onChange={setJoinFieldA}
                        searchable
                    />
                }
            />

            {/* The key is one relationship with a side in each query, so it
                reads as a connector between the rows rather than as a third
                unrelated control. */}
            <Group gap="xs" pl="md" style={{ marginTop: -4, marginBottom: -4 }}>
                <Box
                    style={{
                        width: 2,
                        height: 14,
                        background: 'var(--mantine-color-default-border)',
                    }}
                />
                <Text size="xs" c="dimmed">
                    joined on
                </Text>
            </Group>

            <QueryRow
                color="orange"
                name="Query B"
                title={queryB.exploreName ?? 'Choose an explore on the left'}
                isPlaceholder={!queryB.exploreName}
                subtitle={
                    queryB.exploreName
                        ? `${queryB.metrics.length} metrics · ${queryB.dimensions.length} dimensions`
                        : 'the second query'
                }
                isFocused={focus === 'b'}
                onFocus={() => setFocus('b')}
                joinControl={
                    <Select
                        size="xs"
                        w={220}
                        placeholder={
                            queryB.dimensions.length === 0
                                ? 'pick a dimension first'
                                : 'join on…'
                        }
                        data={queryB.dimensions.map((dimension) => ({
                            value: dimension,
                            label: dimension,
                        }))}
                        value={effectiveJoinFieldB}
                        onChange={setJoinFieldB}
                        disabled={queryB.dimensions.length === 0}
                        searchable
                    />
                }
                action={
                    <Tooltip label="Remove the second query">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={removeQuery}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                }
            />

            <Group gap="sm" mt={4}>
                <Text size="xs" c="dimmed">
                    Include
                </Text>
                <SegmentedControl
                    size="xs"
                    value={joinType}
                    onChange={(value) => setJoinType(value as MergeJoinType)}
                    data={[
                        { label: 'All keys', value: MergeJoinType.FULL },
                        { label: 'All of A', value: MergeJoinType.LEFT },
                        { label: 'Matched only', value: MergeJoinType.INNER },
                    ]}
                />
                <Tooltip
                    label={
                        canRun
                            ? 'Compile and run the merged query'
                            : 'Pick an explore, a metric and a field to join on'
                    }
                >
                    <Button
                        size="compact-sm"
                        ml="auto"
                        onClick={handleRun}
                        loading={mergeRun.isLoading}
                        disabled={!canRun}
                    >
                        Run merge
                    </Button>
                </Tooltip>
            </Group>

            {unaccounted.length > 1 && (
                <Alert color="red" title="This merge would double-count">
                    <Text size="sm">
                        Query A still carries {unaccounted.join(', ')}. Only one
                        extra dimension can become columns — drop the others, or
                        join on them too.
                    </Text>
                </Alert>
            )}

            {unaccounted.length === 1 && pivotField && (
                <Alert color="yellow" title={`Pivot Query A by ${pivotField}`}>
                    <Stack gap="xs">
                        <Text size="sm">
                            Query A is finer-grained than the join key, so
                            merging as-is would repeat Query B's rows once per{' '}
                            {pivotField}. Spreading it into columns brings A to
                            the join grain.
                        </Text>
                        <MultiSelect
                            label="Values to spread into columns"
                            description={
                                pivotValueOptions?.truncated
                                    ? `One column per value. Showing the first ${MAX_PIVOT_VALUES}; narrow the query to see the rest.`
                                    : 'One column per value, read from the warehouse.'
                            }
                            data={suggestedValues}
                            value={effectivePivotValues}
                            onChange={setPivotValues}
                            disabled={isLoadingValues}
                            searchable
                        />
                    </Stack>
                </Alert>
            )}

            {result?.compiled.errors.map((error) => (
                <Alert
                    key={`${error.kind}-${error.sourceId ?? 'merge'}`}
                    color="red"
                    title="Merge refused"
                >
                    <Text size="sm">{error.message}</Text>
                </Alert>
            ))}

            {mergeRun.error && (
                <Alert color="red" title="Merge failed">
                    <Text size="sm">
                        {mergeRun.error.error?.message ??
                            'Something went wrong'}
                    </Text>
                </Alert>
            )}

            {result && result.rows.length > 0 && (
                <Paper withBorder p={0}>
                    <ScrollArea.Autosize mah={320}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    {columns.map((column) => (
                                        <Table.Th key={column}>
                                            {labelByColumn[column] ?? column}
                                        </Table.Th>
                                    ))}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {result.rows.slice(0, 100).map((row, index) => (
                                    // eslint-disable-next-line react/no-array-index-key
                                    <Table.Tr key={index}>
                                        {columns.map((column) => (
                                            <Table.Td key={column}>
                                                {row[column] === null ||
                                                row[column] === undefined
                                                    ? ''
                                                    : String(row[column])}
                                            </Table.Td>
                                        ))}
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea.Autosize>
                </Paper>
            )}
        </Stack>
    );
};
