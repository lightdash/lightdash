import type {
    RunAsyncQueryFn,
    RunSqlJobFn,
} from '../types/aiAgentDependencies';
import { checkMetricViewImport } from './metricViewCheck';

const MODEL_YAML = [
    'type: model',
    'name: orders',
    'sql_from: catalog.analytics.order_metrics',
    'dimensions:',
    '  - name: order_date',
    '    type: date',
    '    sql: ${TABLE}.`Order Date`',
    '  - name: region',
    '    type: string',
    '    sql: ${TABLE}.region',
    'metrics:',
    '  revenue:',
    '    type: number',
    '    sql: MEASURE(`Revenue`)',
    '  active_accounts_end:',
    '    type: number',
    '    sql: MEASURE(`Active Accounts End`)',
    '',
].join('\n');

type Month = [month: string, revenue: number, activeAccountsEnd: number];

/** A fake warehouse: the draft and the view each return these months, latest first. */
const fakeWarehouse = (draftMonths: Month[], viewMonths: Month[]) => {
    const runDraftQuery = vi.fn<RunAsyncQueryFn>(async () => ({
        queryUuid: 'draft-query',
        rows: draftMonths.map(([month, revenue, accounts]) => ({
            orders_order_date_month: `${month}-01`,
            orders_revenue: revenue,
            orders_active_accounts_end: accounts,
        })),
        cacheMetadata: { cacheHit: false },
        fields: {},
        executionStats: null,
    }));
    const runSqlJob = vi.fn<RunSqlJobFn>(async () => ({
        queryUuid: 'view-query',
        rows: viewMonths.map(([month, revenue, accounts]) => ({
            period: new Date(`${month}-01T00:00:00Z`),
            m0: String(revenue),
            m1: accounts,
        })),
        columns: ['period', 'm0', 'm1'],
        rowCount: viewMonths.length,
        executionStats: null,
    }));
    return { runDraftQuery, runSqlJob };
};

const MONTHS: Month[] = [
    ['2026-10', 1200, 40],
    ['2026-09', 1100, 38],
    ['2026-08', 900, 35],
];

const check = (warehouse: ReturnType<typeof fakeWarehouse>, today: string) =>
    checkMetricViewImport(warehouse, {
        model: 'orders',
        modelYaml: MODEL_YAML,
        today: new Date(today),
    });

describe('checkMetricViewImport', () => {
    it('passes quietly when the draft matches the view month by month', async () => {
        const warehouse = fakeWarehouse(MONTHS, MONTHS);

        const result = await check(warehouse, '2026-11-01T00:00:00Z');

        expect(result?.mismatched).toBe(false);
        expect(result?.lines).toContain(
            '  2026-10: revenue 1200 = 1200, active_accounts_end 40 = 40',
        );
        expect(result?.lines.at(-1)).toBe(
            '  Every number matches the metric view.',
        );
        expect(warehouse.runDraftQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_revenue', 'orders_active_accounts_end'],
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: true },
                ],
                filters: {
                    dimensions: {
                        id: 'check-window',
                        and: [
                            expect.objectContaining({
                                target: { fieldId: 'orders_order_date' },
                                operator: 'greaterThanOrEqual',
                                values: ['2026-08-01'],
                            }),
                        ],
                    },
                },
            }),
        );
        expect(warehouse.runSqlJob.mock.calls[0][0].sql).toBe(
            [
                "SELECT DATE_TRUNC('MONTH', `Order Date`) AS period,",
                '  MEASURE(`Revenue`) AS m0,',
                '  MEASURE(`Active Accounts End`) AS m1',
                'FROM catalog.analytics.order_metrics',
                "WHERE `Order Date` >= DATE'2026-08-01'",
                'GROUP BY 1 ORDER BY 1 DESC LIMIT 4',
            ].join('\n'),
        );
    });

    it('surfaces a month where the draft and the view differ', async () => {
        const result = await check(
            fakeWarehouse(MONTHS, [
                ['2026-10', 1200, 40],
                ['2026-09', 1100, 113],
                ['2026-08', 900, 35],
            ]),
            '2026-11-01T00:00:00Z',
        );

        expect(result?.mismatched).toBe(true);
        expect(result?.lines).toContain(
            '  2026-09: revenue 1100 = 1100, active_accounts_end 38 ≠ 113',
        );
        expect(result?.lines.at(-1)).toContain('say plainly which differ');
    });

    it('leaves out the current month, which is not over', async () => {
        const withCurrent: Month[] = [['2026-11', 300, 41], ...MONTHS];

        const result = await check(
            fakeWarehouse(withCurrent, withCurrent),
            '2026-11-20T00:00:00Z',
        );

        expect(
            result?.lines.some((line) => line.startsWith('  2026-11:')),
        ).toBe(false);
        expect(result?.lines).toContain(
            '  2026-11 is left out: the month is not over.',
        );
        expect(
            result?.lines.filter((line) => /^ {2}\d{4}-\d{2}:/.test(line)),
        ).toHaveLength(3);
    });

    it('reports a query that fails rather than guessing', async () => {
        const warehouse = fakeWarehouse(MONTHS, MONTHS);
        warehouse.runSqlJob.mockRejectedValue(new Error('view not found'));

        const result = await check(warehouse, '2026-11-01T00:00:00Z');

        expect(result?.mismatched).toBe(true);
        expect(result?.lines[0]).toContain('view not found');
    });

    it('leaves a model with no date to the usual check', async () => {
        const result = await checkMetricViewImport(fakeWarehouse([], []), {
            model: 'orders',
            modelYaml: MODEL_YAML.replace('type: date', 'type: string'),
            today: new Date('2026-11-01T00:00:00Z'),
        });

        expect(result).toBeNull();
    });
});
