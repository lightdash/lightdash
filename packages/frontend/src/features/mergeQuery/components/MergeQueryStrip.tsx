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
    SegmentedControl,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconLayoutColumns, IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';
import { useMergePivotValues } from '../hooks/useMergeQuery';

const MAX_PIVOT_VALUES = 50;

/** Stand-in when no provider is mounted; the strip renders nothing. */
const EMPTY_MERGE = {
    isMerging: false,
    focus: 'a' as const,
    queryB: {
        exploreName: null,
        dimensions: [] as string[],
        metrics: [] as string[],
    },
    joinParts: [{ fieldA: null, fieldB: null }],
    joinType: MergeJoinType.FULL,
    pivotValues: [] as string[],
    postPivotIndex: null,
    addQuery: () => {},
    removeQuery: () => {},
    setFocus: () => {},
    setJoinField: () => {},
    addJoinPart: () => {},
    removeJoinPart: () => {},
    setJoinType: () => {},
    setPivotValues: () => {},
    setPostPivotIndex: () => {},
};
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
    action?: React.ReactNode;
}> = ({
    color,
    name,
    title,
    subtitle,
    isFocused,
    isPlaceholder = false,
    onFocus,
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
                gridTemplateColumns: 'auto minmax(0, 1fr) auto',
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
    const mergeContext = useMergeSafe();
    const {
        isMerging,
        focus,
        queryB,
        joinParts,
        joinType,
        pivotValues,
        postPivotIndex,
        addQuery,
        removeQuery,
        setFocus,
        setJoinField,
        addJoinPart,
        removeJoinPart,
        setJoinType,
        setPivotValues,
        setPostPivotIndex,
    } = mergeContext ?? EMPTY_MERGE;

    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};

    // The first key part defaults to each query's first dimension. Picking a
    // dimension and then picking it again as the join field is the same choice
    // twice; further parts start empty because there is no obvious default.
    const effectiveParts = useMemo(
        () =>
            joinParts.map((part, index) => ({
                fieldA:
                    part.fieldA ??
                    (index === 0 ? (metricQuery.dimensions[0] ?? null) : null),
                fieldB:
                    part.fieldB ??
                    (index === 0 ? (queryB.dimensions[0] ?? null) : null),
            })),
        [joinParts, metricQuery.dimensions, queryB.dimensions],
    );
    const completeParts = effectiveParts.filter(
        (part) => part.fieldA && part.fieldB,
    );

    const unaccounted = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: SOURCE_A, metricQuery, pivot: null },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: { [SOURCE_A]: part.fieldA as string },
                })),
            ),
        [metricQuery, completeParts],
    );

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
        completeParts.length > 0 &&
        completeParts.length === effectiveParts.length &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        (unaccounted.length === 0 ||
            (unaccounted.length === 1 && effectivePivotValues.length > 0));

    const handleRun = () => {
        if (!queryB.exploreName || completeParts.length === 0) return;

        const joinKey = completeParts.map((part, index) => ({
            name: `${JOIN_KEY}_${index}`,
            fieldIdBySourceId: {
                [SOURCE_A]: part.fieldA as string,
                [SOURCE_B]: part.fieldB as string,
            },
        }));

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
            joinKey,
            joinType,
            postPivot:
                postPivotIndex !== null && joinKey[postPivotIndex]
                    ? {
                          keyName: joinKey[postPivotIndex].name,
                          values: effectivePivotValues,
                          includeNulls: false,
                      }
                    : null,
            tableCalculations: [],
            limit: metricQuery.limit,
        };

        run?.(mergeQuery);
    };

    const mergeError = mergeResults?.results.error ?? null;

    // The entry point is the gate: with the flag off there is nothing to click,
    // so nobody reaches a half-released path by accident.
    if (!mergeContext || !tableName || mergeFlag?.enabled !== true) return null;

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
            />

            {/* The key is one relationship with a side in each query, so it
                sits between the rows rather than being split across them. */}
            <Paper withBorder px="sm" py="xs" bg="var(--mantine-color-body)">
                <Stack gap={6}>
                    <Text size="xs" c="dimmed">
                        Joined on
                    </Text>
                    {effectiveParts.map((part, index) => (
                        <Group
                            // eslint-disable-next-line react/no-array-index-key
                            key={index}
                            gap="xs"
                            wrap="nowrap"
                        >
                            <Select
                                size="xs"
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="field in Query A"
                                data={metricQuery.dimensions.map((d) => ({
                                    value: d,
                                    label: d,
                                }))}
                                value={part.fieldA}
                                onChange={(value) =>
                                    setJoinField(index, 'fieldA', value)
                                }
                                searchable
                            />
                            <Text size="xs" c="dimmed">
                                =
                            </Text>
                            <Select
                                size="xs"
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder={
                                    queryB.dimensions.length === 0
                                        ? 'pick a dimension for Query B'
                                        : 'field in Query B'
                                }
                                data={queryB.dimensions.map((d) => ({
                                    value: d,
                                    label: d,
                                }))}
                                value={part.fieldB}
                                onChange={(value) =>
                                    setJoinField(index, 'fieldB', value)
                                }
                                disabled={queryB.dimensions.length === 0}
                                searchable
                            />
                            {effectiveParts.length > 1 && (
                                <Tooltip
                                    label={
                                        postPivotIndex === index
                                            ? 'Showing this as columns'
                                            : 'Spread this across columns'
                                    }
                                >
                                    <ActionIcon
                                        variant={
                                            postPivotIndex === index
                                                ? 'filled'
                                                : 'subtle'
                                        }
                                        color="blue"
                                        onClick={() =>
                                            setPostPivotIndex(
                                                postPivotIndex === index
                                                    ? null
                                                    : index,
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconLayoutColumns} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {effectiveParts.length > 1 && (
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => removeJoinPart(index)}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )}
                        </Group>
                    ))}
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={addJoinPart}
                        >
                            Add another field
                        </Button>
                        {postPivotIndex !== null && (
                            <Text size="xs" c="dimmed">
                                one column per value of that field
                            </Text>
                        )}
                    </Group>
                </Stack>
            </Paper>

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
                            : 'Pick an explore, a metric, and a field on each side to join on'
                    }
                >
                    <Button
                        size="compact-sm"
                        ml="auto"
                        onClick={handleRun}
                        loading={!!isRunning}
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

            {(runErrors ?? []).map((error) => (
                <Alert
                    key={`${error.kind}-${error.sourceId ?? 'merge'}`}
                    color="red"
                    title="Merge refused"
                >
                    <Text size="sm">{error.message}</Text>
                </Alert>
            ))}

            {mergeError && (
                <Alert color="red" title="Merge failed">
                    <Text size="sm">
                        {mergeError.error?.message ?? 'Something went wrong'}
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};
