import { toActiveMaterializationDetails } from './PreAggregateModel';

type ActiveMaterializationRow = NonNullable<
    Parameters<typeof toActiveMaterializationDetails>[0]
>;

const materializationMetricQuery = (
    resolvedMaxRows: number | null,
): ActiveMaterializationRow['materialization_metric_query'] => ({
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 100,
        tableCalculations: [],
    },
    metricComponents: {},
    timeDimensionFieldId: null,
    resolvedMaxRows,
});

const activeRow = (
    overrides: Partial<ActiveMaterializationRow> = {},
): ActiveMaterializationRow => ({
    pre_aggregate_materialization_uuid: 'mat-1',
    query_uuid: 'query-1',
    materialization_uri: 's3://bucket/query-1.parquet',
    columns: null,
    materialized_at: new Date('2024-02-01T10:00:00.000Z'),
    total_bytes: 456789,
    row_count: null,
    materialization_metric_query: materializationMetricQuery(100),
    ...overrides,
});

describe('toActiveMaterializationDetails', () => {
    test('returns details when the row count is strictly below the persisted cap', () => {
        expect(
            toActiveMaterializationDetails(activeRow({ row_count: 99 })),
        ).toEqual({
            materializationUuid: 'mat-1',
            queryUuid: 'query-1',
            materializationUri: 's3://bucket/query-1.parquet',
            format: 'parquet',
            columns: null,
            materializedAt: new Date('2024-02-01T10:00:00.000Z'),
            totalBytes: 456789,
            rowCount: 99,
            resolvedMaxRows: 100,
        });
    });

    test('rejects details when the row count reached the persisted cap', () => {
        expect(
            toActiveMaterializationDetails(activeRow({ row_count: 100 })),
        ).toBeUndefined();
    });

    test('returns details when the row has no row count', () => {
        expect(
            toActiveMaterializationDetails(activeRow({ row_count: null })),
        ).toEqual(
            expect.objectContaining({
                materializationUuid: 'mat-1',
                rowCount: null,
                resolvedMaxRows: 100,
            }),
        );
    });

    test('returns details when the persisted payload has no cap', () => {
        expect(
            toActiveMaterializationDetails(
                activeRow({
                    row_count: 10_000_000,
                    materialization_metric_query: null,
                }),
            ),
        ).toEqual(
            expect.objectContaining({
                materializationUuid: 'mat-1',
                rowCount: 10_000_000,
                resolvedMaxRows: null,
            }),
        );
    });
});
