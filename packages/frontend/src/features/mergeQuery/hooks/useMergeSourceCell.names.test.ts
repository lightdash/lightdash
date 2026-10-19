import {
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type Explore,
    type ItemsMap,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { useMergeSourceCell } from './useMergeSourceCell';

const explore = (name: string): Explore => ({
    name,
    label: name,
    baseTable: name,
    joinedTables: [],
    tags: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        [name]: {
            name,
            label: name,
            database: '',
            schema: '',
            sqlTable: name,
            lineageGraph: {},
            dimensions: {},
            metrics: {
                total: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'total',
                    label: 'Total',
                    table: name,
                    tableLabel: name,
                    sql: '',
                    hidden: false,
                    compiledSql: '',
                    tablesReferences: [name],
                },
            },
        },
    },
});

const source = (id: string, exploreName: string, name?: string) => ({
    id,
    ...(name ? { name } : {}),
    exploreName,
    dimensions: [],
    metrics: [`${exploreName}_total`],
    filters: {},
});

vi.mock('../context/useMerge', () => ({
    // A middle source changed to refunds; the last kept its stable name
    useMergeSafe: () => ({
        primarySourceName: null,
        additionalSources: [
            source('b', 'refunds'),
            source('c', 'payments', 'payments_3'),
        ],
        mergeResults: {
            fieldOrigins: {
                payments_3_payments_total: {
                    kind: 'source',
                    sourceId: 'payments_3',
                    sourceFieldId: 'payments_total',
                },
                refunds_refunds_total: {
                    kind: 'source',
                    sourceId: 'refunds',
                    sourceFieldId: 'refunds_total',
                },
            },
        },
    }),
}));
vi.mock(
    '../../../components/MetricQueryData/useMetricQueryDataContext',
    () => ({
        useMetricQueryDataContext: () => ({
            tableName: 'payments',
            metricQuery: {
                exploreName: 'payments',
                dimensions: [],
                metrics: ['payments_total'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        }),
    }),
);
vi.mock('../../../hooks/useExplore', () => ({
    useExploreQueries: (names: (string | undefined)[]) =>
        names.map((name) => (name ? explore(name) : undefined)),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));

const mergedItem = (table: string, name: string) =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name,
        label: 'Total',
        table,
        tableLabel: table,
        sql: '',
        hidden: false,
    }) as ItemsMap[string];

describe('useMergeSourceCell', () => {
    it('routes a column to the source holding its stable name', () => {
        const { result } = renderHook(() => useMergeSourceCell());

        expect(
            result.current.resolve(
                mergedItem('payments_3', 'payments_total'),
                {},
            )?.source.metricQuery.exploreName,
        ).toBe('payments');
        expect(
            result.current.resolve(mergedItem('refunds', 'refunds_total'), {})
                ?.source.metricQuery.exploreName,
        ).toBe('refunds');
    });
});
