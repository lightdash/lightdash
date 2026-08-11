import { FeatureFlags, MergeJoinType } from '@lightdash/common';
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
import { useEffect, useRef, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';

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
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const mergeContext = useMergeSafe();
    const {
        isMerging,
        wasRestored,
        focus,
        queryB,
        joinType,
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

    const { isRunning, runErrors, mergeResults } = mergeContext ?? {};

    const {
        effectiveParts,
        labelFor,
        unaccountedA,
        unaccountedB,
        unaccountedTotal,
        pivotSide,
        pivotField,
        pivotFieldLabel,
        pivotQueryLabel,
        otherQueryLabel,
        joinFieldLabel,
        suggestedValues,
        isLoadingValues,
        pivotValueOptions,
        effectivePivotValues,
        joinKeyErrors,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
    } = useMergeSetup();

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
