import {
    formatRow,
    type ItemsMap,
    type PivotValuesColumn,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';
import type { ReadyResultsPageEnvelope } from './composeResultsPageBody';

const dimension = (
    name: string,
    type: string,
    extra: Record<string, unknown> = {},
) => ({
    fieldType: 'dimension',
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
    ...extra,
});

export const resultsPageFields = {
    orders_id: dimension('id', 'number'),
    orders_created_date: dimension('created_date', 'date', {
        timeInterval: 'DAY',
    }),
    orders_created_at: dimension('created_at', 'timestamp', {
        timeInterval: 'RAW',
    }),
    orders_status: dimension('status', 'string'),
    orders_nested: dimension('nested', 'string'),
    orders_missing: dimension('missing', 'string'),
    orders_amount: {
        ...dimension('amount', 'sum'),
        fieldType: 'metric',
        round: 2,
    },
} as unknown as ItemsMap;

export const resultsPagePivotValuesColumns = {
    orders_amount_any_completed: {
        referenceField: 'orders_amount',
        pivotColumnName: 'orders_amount_any_completed',
        aggregation: 'any',
        pivotValues: [
            {
                referenceField: 'orders_status',
                value: 'completed',
                formatted: 'Completed',
            },
        ],
    },
} as unknown as Record<string, PivotValuesColumn>;

export const resultsPageRawRows: Record<string, unknown>[] = [
    {
        orders_id: 1,
        orders_created_date: '2024-01-05',
        orders_created_at: '2024-01-05T23:30:00.000Z',
        orders_status: 'line\u2028separator and \u2029 paragraph',
        orders_nested: { a: [1, { b: null }], c: 'd' },
        orders_missing: null,
        orders_amount: 12.345,
        orders_amount_any_completed: 99.999,
    },
    {
        orders_id: 2,
        orders_created_date: null,
        orders_created_at: '2023-12-31T03:00:00.000Z',
        orders_status: 'quote " and backslash \\ and emoji 🚀',
        orders_nested: [1, 2, 3],
        orders_missing: null,
        orders_amount: -0.5,
        orders_amount_any_completed: null,
    },
    {
        orders_id: 3,
        orders_created_date: '2024-02-29',
        orders_created_at: null,
        orders_status: '',
        orders_nested: null,
        orders_missing: null,
        orders_amount: 1e21,
        orders_amount_any_completed: 0,
    },
];

export const resultsPageLines = resultsPageRawRows.map((row) =>
    JSON.stringify(row),
);

export const formatCases: Array<[string, ResultsPageFormatInputs]> = [
    [
        'plain rows',
        { fields: resultsPageFields, pivotValuesColumns: null, timezone: null },
    ],
    [
        'pivoted rows',
        {
            fields: resultsPageFields,
            pivotValuesColumns: resultsPagePivotValuesColumns,
            timezone: null,
        },
    ],
    [
        'dates with a display timezone',
        {
            fields: resultsPageFields,
            pivotValuesColumns: null,
            timezone: 'America/New_York',
        },
    ],
    [
        'pivoted dates with a display timezone',
        {
            fields: resultsPageFields,
            pivotValuesColumns: resultsPagePivotValuesColumns,
            timezone: 'Asia/Kolkata',
        },
    ],
];

export const formatInline = (
    lines: readonly string[],
    { fields, pivotValuesColumns, timezone }: ResultsPageFormatInputs,
) =>
    lines.map((line) =>
        formatRow(
            JSON.parse(line),
            fields,
            pivotValuesColumns,
            undefined,
            timezone ?? undefined,
        ),
    );

export const buildResultsPageEnvelope = (
    rowCount: number,
    timezone: string | null,
): ReadyResultsPageEnvelope =>
    ({
        columns: {
            orders_id: { reference: 'orders_id', type: 'number' },
        },
        resolvedTimezone: timezone,
        totalPageCount: 4,
        totalResults: 10,
        queryUuid: 'query-uuid',
        pageSize: rowCount,
        page: 2,
        nextPage: 3,
        previousPage: 1,
        metadata: {
            performance: {
                initialQueryExecutionMs: 1500,
                resultsPageExecutionMs: 42,
                queueTimeMs: null,
            },
            preAggregate: null,
        },
        status: 'ready',
        pivotDetails: null,
    }) as unknown as ReadyResultsPageEnvelope;

export const todaysResponseBytes = (
    rows: ReadyQueryResultsPage['rows'],
    envelope: ReadyResultsPageEnvelope,
) =>
    Buffer.from(
        JSON.stringify({ status: 'ok', results: { rows, ...envelope } }),
    );
