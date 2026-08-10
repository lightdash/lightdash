import {
    getItemId,
    getUnaccountedDimensions,
    isDimension,
    MergeJoinType,
    type Explore,
    type MergeQuery,
    type MergeQuerySource,
    type MetricQuery,
    type ResultRow,
} from '@lightdash/common';
import {
    Alert,
    Badge,
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
} from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useMergeQueryRun } from '../hooks/useMergeQuery';

const SOURCE_A = 'a';
const SOURCE_B = 'b';
const JOIN_KEY = 'join_key';

const getDimensionOptions = (explore: Explore | undefined) => {
    if (!explore) return [];
    return Object.values(explore.tables).flatMap((table) =>
        Object.values(table.dimensions)
            .filter(isDimension)
            .map((dimension) => ({
                value: getItemId(dimension),
                label: `${table.label} · ${dimension.label}`,
            })),
    );
};

const getMetricOptions = (explore: Explore | undefined) => {
    if (!explore) return [];
    return Object.values(explore.tables).flatMap((table) =>
        Object.values(table.metrics).map((metric) => ({
            value: getItemId(metric),
            label: `${table.label} · ${metric.label}`,
        })),
    );
};

type Props = {
    /** The explorer's current query. Becomes the first side of the merge. */
    metricQuery: MetricQuery;
    tableName: string;
    /** Rows the explorer has already fetched, used to suggest pivot values. */
    rows: ResultRow[];
};

/**
 * Merges the explorer's current query with a second one (#295).
 *
 * The panel's shape mirrors the pipeline it compiles to: each query row owns
 * its own pre-pivot, the join-on pill names the shared key, and the include
 * chip is the join type. A query still carrying a dimension that is neither
 * joined on nor pivoted is shown as incomplete rather than run, because that
 * merge repeats the other query's rows once per value and every total over it
 * is silently wrong.
 */
export const MergePanel: FC<Props> = ({ metricQuery, tableName, rows }) => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid);

    const [exploreB, setExploreB] = useState<string | null>(null);
    const [joinFieldA, setJoinFieldA] = useState<string | null>(
        metricQuery.dimensions[0] ?? null,
    );
    const [joinFieldB, setJoinFieldB] = useState<string | null>(null);
    const [metricB, setMetricB] = useState<string | null>(null);
    const [joinType, setJoinType] = useState<MergeJoinType>(MergeJoinType.FULL);
    const [pivotValues, setPivotValues] = useState<string[]>([]);

    const { data: exploreBData } = useExplore(exploreB ?? undefined);

    const mergeRun = useMergeQueryRun(projectUuid);

    // Dimensions of the current query that the join key does not account for.
    // Exactly one can be pivoted into columns; the rest have to be dropped.
    const unaccounted = useMemo(() => {
        if (!joinFieldA) return metricQuery.dimensions;
        const source: MergeQuerySource = {
            id: SOURCE_A,
            metricQuery,
            pivot: null,
        };
        return getUnaccountedDimensions(source, [
            {
                name: JOIN_KEY,
                fieldIdBySourceId: { [SOURCE_A]: joinFieldA },
            },
        ]);
    }, [metricQuery, joinFieldA]);

    const pivotField = unaccounted[0] ?? null;

    // Values the explorer has already fetched for the pivot dimension. SQL has
    // to name one column per value, so the set is bounded and explicit.
    const suggestedValues = useMemo(() => {
        if (!pivotField) return [];
        const values = new Set<string>();
        rows.forEach((row) => {
            const cell = row[pivotField]?.value?.raw;
            if (cell !== null && cell !== undefined) {
                values.add(String(cell));
            }
        });
        return [...values];
    }, [rows, pivotField]);

    const effectivePivotValues =
        pivotValues.length > 0 ? pivotValues : suggestedValues;

    const canRun =
        !!joinFieldA &&
        !!joinFieldB &&
        !!metricB &&
        !!exploreB &&
        (unaccounted.length === 0 ||
            (unaccounted.length === 1 && effectivePivotValues.length > 0));

    const handleRun = () => {
        if (!joinFieldA || !joinFieldB || !metricB || !exploreB) return;

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
                        exploreName: exploreB,
                        dimensions: [joinFieldB],
                        metrics: [metricB],
                        filters: {},
                        sorts: [],
                        limit: metricQuery.limit,
                        tableCalculations: [],
                    },
                },
            ],
            joinKey: [
                {
                    name: JOIN_KEY,
                    fieldIdBySourceId: {
                        [SOURCE_A]: joinFieldA,
                        [SOURCE_B]: joinFieldB,
                    },
                },
            ],
            joinType,
            postPivot: null,
            limit: metricQuery.limit,
        };

        mergeRun.mutate(mergeQuery);
    };

    const result = mergeRun.data;
    const columns = useMemo(() => {
        if (!result?.rows.length) return [];
        return Object.keys(result.rows[0]);
    }, [result]);

    return (
        <Stack gap="sm">
            <Group gap="xs" align="flex-end">
                <Badge color="blue" variant="light">
                    Query A
                </Badge>
                <Text size="sm" fw={500}>
                    {tableName}
                </Text>
                <Text size="xs" c="dimmed">
                    {metricQuery.metrics.length} metric(s),{' '}
                    {metricQuery.dimensions.length} dimension(s)
                </Text>
            </Group>

            <Group grow align="flex-start">
                <Select
                    label="Join A on"
                    placeholder="Pick a field"
                    data={metricQuery.dimensions.map((dimension) => ({
                        value: dimension,
                        label: dimension,
                    }))}
                    value={joinFieldA}
                    onChange={setJoinFieldA}
                    searchable
                />
                <Select
                    label="Query B explore"
                    placeholder="Pick an explore"
                    data={(explores ?? []).map((explore) => ({
                        value: explore.name,
                        label: explore.label,
                    }))}
                    value={exploreB}
                    onChange={(value) => {
                        setExploreB(value);
                        setJoinFieldB(null);
                        setMetricB(null);
                    }}
                    searchable
                />
            </Group>

            <Group grow align="flex-start">
                <Select
                    label="Join B on"
                    placeholder={
                        exploreB ? 'Pick a field' : 'Pick an explore first'
                    }
                    data={getDimensionOptions(exploreBData)}
                    value={joinFieldB}
                    onChange={setJoinFieldB}
                    disabled={!exploreB}
                    searchable
                />
                <Select
                    label="Query B metric"
                    placeholder={
                        exploreB ? 'Pick a metric' : 'Pick an explore first'
                    }
                    data={getMetricOptions(exploreBData)}
                    value={metricB}
                    onChange={setMetricB}
                    disabled={!exploreB}
                    searchable
                />
            </Group>

            <Group gap="xs" align="center">
                <Text size="sm" fw={500}>
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
            </Group>

            {unaccounted.length > 1 && (
                <Alert color="red" title="This merge would double-count">
                    <Text size="sm">
                        Query A still carries {unaccounted.join(', ')}. Only one
                        extra dimension can become columns — drop the others
                        from the query, or join on them too.
                    </Text>
                </Alert>
            )}

            {unaccounted.length === 1 && pivotField && (
                <Alert color="yellow" title={`Pivot by ${pivotField}`}>
                    <Stack gap="xs">
                        <Text size="sm">
                            Query A is finer-grained than the join key, so
                            merging as-is would repeat query B's rows once per{' '}
                            {pivotField}. Spreading it into columns brings A to
                            the join grain.
                        </Text>
                        <MultiSelect
                            label="Values to spread into columns"
                            description="One column per value. Taken from the rows already loaded."
                            data={suggestedValues}
                            value={effectivePivotValues}
                            onChange={setPivotValues}
                            searchable
                        />
                    </Stack>
                </Alert>
            )}

            <Group>
                <Button
                    onClick={handleRun}
                    loading={mergeRun.isLoading}
                    disabled={!canRun}
                >
                    Run merge
                </Button>
                {mergeRun.error && (
                    <Text size="sm" c="red">
                        {mergeRun.error.error?.message ?? 'Merge failed'}
                    </Text>
                )}
            </Group>

            {result?.compiled.errors.map((error) => (
                <Alert
                    key={`${error.kind}-${error.sourceId ?? 'merge'}`}
                    color="red"
                    title="Merge refused"
                >
                    <Text size="sm">{error.message}</Text>
                </Alert>
            ))}

            {result && result.rows.length > 0 && (
                <Paper withBorder p={0}>
                    <ScrollArea.Autosize mah={320}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    {columns.map((column) => (
                                        <Table.Th key={column}>
                                            {column}
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
