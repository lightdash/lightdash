import {
    FeatureFlags,
    getItemMap,
    isDimension,
    MergeQueryErrorKind,
    validateMergeQuery,
    type Explore,
    type MergeFieldTypes,
    getUnaccountedDimensions,
    isField,
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
import {
    IconAlertTriangle,
    IconLayoutColumns,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplore } from '../../../hooks/useExplore';
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
    wasRestored: false,
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
        wasRestored,
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

    const { data: exploreA } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const { data: exploreB } = useExplore(queryB.exploreName ?? undefined, {
        refetchOnMount: false,
    });
    // Field ids are how the merge is addressed, but they are not what anyone
    // calls these things. Everything the user reads says the label.
    const labelFor = useCallback(
        (fieldId: string) => {
            const item =
                (exploreA ? getItemMap(exploreA)[fieldId] : undefined) ??
                (exploreB ? getItemMap(exploreB)[fieldId] : undefined);
            return item && isField(item) ? item.label : fieldId;
        },
        [exploreA, exploreB],
    );

    const metricQueryB = useMemo<MetricQuery>(
        () => ({
            exploreName: queryB.exploreName ?? '',
            dimensions: queryB.dimensions,
            metrics: queryB.metrics,
            filters: {},
            sorts: [],
            limit: metricQuery.limit,
            tableCalculations: [],
        }),
        [queryB, metricQuery.limit],
    );

    // Either query can be the finer-grained one. Both are checked, because a
    // merge is refused for whichever side carries the extra dimension and the
    // repair has to be offered where the problem is.
    const unaccountedA = useMemo(
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
    const unaccountedB = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: SOURCE_B, metricQuery: metricQueryB, pivot: null },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: { [SOURCE_B]: part.fieldB as string },
                })),
            ),
        [metricQueryB, completeParts],
    );

    // One side at a time: repairing both at once needs a value set per side,
    // which the setup does not yet ask for.
    const pivotSide: 'a' | 'b' | null =
        unaccountedA.length === 1 && unaccountedB.length === 0
            ? 'a'
            : unaccountedB.length === 1 && unaccountedA.length === 0
              ? 'b'
              : null;
    const unaccounted = pivotSide === 'b' ? unaccountedB : unaccountedA;
    const pivotField = pivotSide ? unaccounted[0] : null;
    const pivotQueryLabel = pivotSide === 'b' ? 'Query B' : 'Query A';
    const otherQueryLabel = pivotSide === 'b' ? 'Query A' : 'Query B';
    const pivotFieldLabel = pivotField ? labelFor(pivotField) : '';
    const joinFieldLabel = effectiveParts[0]?.fieldA
        ? labelFor(effectiveParts[0].fieldA)
        : 'the join key';

    const { data: pivotValueOptions, isLoading: isLoadingValues } =
        useMergePivotValues(
            projectUuid,
            pivotSide === 'b' ? metricQueryB : metricQuery,
            pivotField,
            MAX_PIVOT_VALUES,
        );
    const suggestedValues = pivotValueOptions?.values ?? [];
    const effectivePivotValues =
        pivotValues.length > 0 ? pivotValues : suggestedValues;

    const unaccountedTotal = unaccountedA.length + unaccountedB.length;
    // Built here rather than inside the run handler so the same object can be
    // validated while it is being configured. The rules that refuse a merge do
    // not need it to have run.
    const mergeQuery = useMemo<MergeQuery | null>(() => {
        if (!queryB.exploreName || completeParts.length === 0) return null;

        const joinKey = completeParts.map((part, index) => ({
            name: `${JOIN_KEY}_${index}`,
            fieldIdBySourceId: {
                [SOURCE_A]: part.fieldA as string,
                [SOURCE_B]: part.fieldB as string,
            },
        }));

        return {
            sources: [
                {
                    id: SOURCE_A,
                    metricQuery,
                    pivot:
                        pivotSide === 'a' && pivotField
                            ? {
                                  fieldId: pivotField,
                                  values: effectivePivotValues,
                                  includeNulls: false,
                              }
                            : null,
                },
                {
                    id: SOURCE_B,
                    metricQuery: metricQueryB,
                    pivot:
                        pivotSide === 'b' && pivotField
                            ? {
                                  fieldId: pivotField,
                                  values: effectivePivotValues,
                                  includeNulls: false,
                              }
                            : null,
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
    }, [
        queryB,
        completeParts,
        metricQuery,
        metricQueryB,
        pivotSide,
        pivotField,
        effectivePivotValues,
        joinType,
        postPivotIndex,
    ]);

    // The same rules the server refuses on, run here as the merge is built.
    // Whether two fields can be joined depends only on the two fields, so
    // making the user press Run to find out is a round trip for an answer we
    // already have.
    const joinFieldTypes = useMemo<MergeFieldTypes>(() => {
        const collect = (explore: Explore | undefined) =>
            explore
                ? Object.entries(getItemMap(explore)).flatMap(([id, item]) =>
                      isDimension(item)
                          ? [
                                [
                                    id,
                                    {
                                        type: item.type,
                                        timeInterval: item.timeInterval ?? null,
                                    },
                                ] as const,
                            ]
                          : [],
                  )
                : [];
        return Object.fromEntries([...collect(exploreA), ...collect(exploreB)]);
    }, [exploreA, exploreB]);

    const joinKeyErrors = useMemo(
        () =>
            mergeQuery
                ? validateMergeQuery(mergeQuery, joinFieldTypes).filter(
                      (error) =>
                          error.kind ===
                              MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH ||
                          error.kind ===
                              MergeQueryErrorKind.JOIN_KEY_GRANULARITY_MISMATCH,
                  )
                : [],
        [mergeQuery, joinFieldTypes],
    );

    // A merge that is not built yet and a merge that is built but unsafe are
    // different problems. Saying both at once is what makes the panel
    // unreadable: a grain warning means nothing until there is a merge to
    // warn about.
    const setupStep = !queryB.exploreName
        ? 'Pick a table for Query B'
        : queryB.metrics.length === 0
          ? 'Pick at least one metric for Query B'
          : !effectiveParts.every(
                  (part) =>
                      part.fieldA &&
                      part.fieldB &&
                      metricQuery.dimensions.includes(part.fieldA) &&
                      queryB.dimensions.includes(part.fieldB),
              )
            ? 'Pick a field from each query to join on'
            : null;
    const isIncomplete = setupStep !== null;

    const blockingReason =
        setupStep ??
        (joinKeyErrors.length > 0
            ? 'These queries cannot be joined on that field'
            : unaccountedTotal > 0 && pivotSide === null
              ? 'Too many extra fields to merge safely'
              : pivotSide !== null && effectivePivotValues.length === 0
                ? `Choose which ${pivotFieldLabel} values become columns`
                : null);

    const canRun =
        completeParts.length > 0 &&
        completeParts.length === effectiveParts.length &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        joinKeyErrors.length === 0 &&
        (unaccountedTotal === 0 ||
            (pivotSide !== null && effectivePivotValues.length > 0));

    const handleRun = useCallback(() => {
        if (mergeQuery) run?.(mergeQuery);
    }, [mergeQuery, run]);

    const mergeError = mergeResults?.results.error ?? null;

    // A merge that arrived with the chart has to run itself. Without this a
    // saved merged chart opens showing Query A's results — the wrong numbers,
    // presented as the chart that was saved.
    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (!wasRestored || hasAutoRun.current || isRunning) return;
        if (!canRun || mergeResults) return;
        hasAutoRun.current = true;
        handleRun();
    }, [wasRestored, canRun, isRunning, mergeResults, handleRun]);

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
                                    label: labelFor(d),
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
                                    label: labelFor(d),
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
                    {joinKeyErrors.map((error) => (
                        <Group
                            key={error.kind}
                            gap={6}
                            wrap="nowrap"
                            align="flex-start"
                        >
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="red"
                                style={{ marginTop: 3, flex: 'none' }}
                            />
                            <Text size="xs" c="red">
                                {error.message}
                            </Text>
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
                {blockingReason && (
                    <Text size="xs" c="dimmed" ml="auto">
                        {blockingReason}
                    </Text>
                )}
                <Tooltip
                    label={blockingReason ?? 'Compile and run the merged query'}
                >
                    <Button
                        size="compact-sm"
                        ml={blockingReason ? undefined : 'auto'}
                        onClick={handleRun}
                        loading={!!isRunning}
                        disabled={!canRun}
                    >
                        Run merge
                    </Button>
                </Tooltip>
            </Group>

            {unaccountedTotal > 0 && pivotSide === null && !isIncomplete && (
                <Alert
                    color="red"
                    title="This merge would overstate its totals"
                >
                    <Text size="sm">
                        {[
                            unaccountedA.length > 0
                                ? `Query A has one row per ${unaccountedA
                                      .map(labelFor)
                                      .join(' and per ')}`
                                : null,
                            unaccountedB.length > 0
                                ? `Query B has one row per ${unaccountedB
                                      .map(labelFor)
                                      .join(' and per ')}`
                                : null,
                        ]
                            .filter(Boolean)
                            .join(', and ')}
                        , so rows on the other side would be counted several
                        times. One extra field can become columns — remove the
                        rest, or join on them too.
                    </Text>
                </Alert>
            )}

            {pivotSide !== null && pivotField && !isIncomplete && (
                <Alert
                    color="yellow"
                    title={`${pivotQueryLabel} has more than one row per ${joinFieldLabel}`}
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            It has one row per {pivotFieldLabel} as well, so
                            merging would count each {otherQueryLabel} row once
                            per {pivotFieldLabel} and overstate its totals.
                            Choose which {pivotFieldLabel} values to show as
                            their own columns, and {pivotQueryLabel} will have
                            one row per {joinFieldLabel} like {otherQueryLabel}{' '}
                            does.
                        </Text>
                        <MultiSelect
                            label={`${pivotFieldLabel} values to show as columns`}
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
