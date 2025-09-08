import { type MetricQuery } from '@lightdash/common';
import { Box, Button, Code, Group, Paper, Stack, Text } from '@mantine-8/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import {
    executeAsyncQuery,
    useInfiniteQueryResults,
    type QueryResultsProps,
} from '../../hooks/useQueryResults';

const QUERY_A: MetricQuery = {
    exploreName: 'orders',
    metrics: [
        'orders_total_order_amount',
        'orders_unique_order_count',
        'orders_average_order_size',
    ],
    dimensions: ['orders_customer_id'],
    sorts: [
        {
            fieldId: 'orders_total_order_amount',
            descending: true,
        },
    ],
    limit: 10,
    filters: {
        dimensions: {
            id: 'b71e9589-ac9c-4883-a813-83426ee37111',
            and: [],
        },
        metrics: {
            id: '7bdfc0eb-dad2-465d-a9f1-1dda7967c2e6',
            and: [],
        },
    },
    additionalMetrics: [],
    tableCalculations: [],
} as unknown as MetricQuery;

const QUERY_B: MetricQuery = {
    metrics: ['orders_total_order_amount'],
    dimensions: ['orders_shipping_method', 'orders_status'],
    limit: 100,
    sorts: [
        {
            fieldId: 'orders_total_order_amount',
            descending: true,
        },
    ],
    exploreName: 'orders',
    filters: {
        dimensions: {
            id: '5f32eff9-78a0-4642-bd32-f6c7ce5bdfa3',
            and: [
                {
                    id: '81c97c98-b070-4723-b1c0-002a2d92c71e',
                    target: {
                        fieldId: 'orders_status',
                        fieldFilterType: 'string',
                    },
                    operator: 'include',
                    values: ['completed', 'shipped'],
                },
            ],
        },
        metrics: {
            id: 'cf689e04-9689-45c2-9803-0bd9a382fc60',
            and: [],
        },
    },
    additionalMetrics: [],
    tableCalculations: [],
} as unknown as MetricQuery;

export const QueryResultsDemoPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [useQueryA, setUseQueryA] = useState(true);

    const queryArgs: QueryResultsProps | null = useMemo(() => {
        if (!projectUuid) return null;
        return {
            projectUuid,
            tableId: 'orders',
            query: useQueryA ? QUERY_A : QUERY_B,
            invalidateCache: true,
        };
    }, [projectUuid, useQueryA]);

    // No missing parameters in this demo
    const queryExecutionHandle = useQuery({
        queryKey: ['query-execution-handle', queryArgs],
        queryFn: () => executeAsyncQuery(queryArgs),
    });

    const results = useInfiniteQueryResults(
        projectUuid,
        queryExecutionHandle.data?.queryUuid,
    );

    console.log('QueryResultsDemo', {
        activeQuery: useQueryA ? 'A' : 'B',
        queryUuid: queryExecutionHandle.data?.queryUuid,
        resultsQueryStatus: results.queryStatus,
        isFetchingRows: results.isFetchingRows,
        isFetchingFirstPage: results.isFetchingFirstPage,
        isInitialLoading: results.isInitialLoading,
        rowsSample: results.rows?.[0],
    });

    return (
        <Box p="md">
            <Stack gap="md">
                <Text fw={600}>Query Results Demo</Text>
                <Text c="dimmed" size="sm">
                    Toggle between two hard-coded metric queries to generate a
                    new query UUID and observe loading flags/logs.
                </Text>

                <Paper withBorder p="md">
                    <Group>
                        <Button
                            disabled={!projectUuid}
                            onClick={() => setUseQueryA((v) => !v)}
                        >
                            Use Query {useQueryA ? 'B' : 'A'}
                        </Button>
                    </Group>
                </Paper>

                <Paper withBorder p="md">
                    <Stack gap="xs">
                        <Text fw={600}>Status</Text>
                        <Code block>
                            {JSON.stringify(
                                {
                                    activeQuery: useQueryA ? 'A' : 'B',
                                    requestedQueryUuid:
                                        queryExecutionHandle.data?.queryUuid,
                                    queryStatus: results.queryStatus,
                                    isFetchingFirstPage:
                                        results.isFetchingFirstPage,
                                    isFetchingRows: results.isFetchingRows,
                                    isInitialLoading: results.isInitialLoading,
                                    rowsCount: results.rows?.length ?? 0,
                                    sampleRow: results.rows?.[0],
                                },
                                null,
                                2,
                            )}
                        </Code>
                    </Stack>
                </Paper>
            </Stack>
        </Box>
    );
};
