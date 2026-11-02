import { describe, expect, it } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import { compose, validateComposerDefinition } from './compose';
import { query } from './query';
import { savedChart } from './savedChart';

const pipeline = () =>
    compose('revenue-forecast')
        .title('Revenue forecast')
        .description('Projects revenue.')
        .semantic(
            'orders',
            query('orders')
                .dimensions(['order_date_month'])
                .metrics(['total_revenue']),
            { title: 'Monthly orders', description: 'Revenue by month.' },
        )
        .python('fc', 'def run(inputs, params):\n    return inputs["orders"]', {
            reads: ['orders'],
            title: 'Forecast',
        })
        .terminal('fc');

describe('compose builder', () => {
    it('is immutable', () => {
        const base = compose('p');
        const titled = base.title('T');
        expect(base.build().title).toBeNull();
        expect(titled.build().title).toBe('T');
        expect(base.build().nodes).toHaveLength(0);
    });

    it('builds a plain JSON definition', () => {
        const definition = pipeline().parameters({ region: 'US' }).build();
        expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
        expect(definition).toMatchObject({
            kind: 'composer',
            id: 'revenue-forecast',
            title: 'Revenue forecast',
            description: 'Projects revenue.',
            terminal: 'fc',
            parameters: { region: 'US' },
        });
        expect(definition.nodes.map((n) => [n.kind, n.nodeId])).toEqual([
            ['semantic', 'orders'],
            ['python', 'fc'],
        ]);
        expect(definition.nodes[1]).toMatchObject({
            reads: ['orders'],
            title: 'Forecast',
            description: null,
            limit: null,
        });
    });

    it('captures saved-chart sources as plain data', () => {
        const node = compose('p')
            .semantic('top', savedChart('chart-1').label('Top').limit(5))
            .build().nodes[0];
        expect(node).toMatchObject({
            kind: 'semantic',
            source: {
                kind: 'savedChart',
                chartUuid: 'chart-1',
                label: 'Top',
                limit: 5,
                parameters: {},
                filters: [],
            },
        });
    });
});

describe('validateComposerDefinition', () => {
    it('accepts a complete pipeline', () => {
        expect(() =>
            validateComposerDefinition(pipeline().build()),
        ).not.toThrow();
    });

    it('requires a terminal', () => {
        const definition = compose('p')
            .semantic('orders', query('orders').metrics(['n']))
            .build();
        expect(() => validateComposerDefinition(definition)).toThrow(
            /\.terminal\(nodeId\)/,
        );
    });

    it('rejects an unknown terminal', () => {
        expect(() =>
            validateComposerDefinition(pipeline().terminal('nope').build()),
        ).toThrow(/terminal "nope"/);
    });

    it('rejects reads of unknown nodes', () => {
        const definition = compose('p')
            .semantic('orders', query('orders').metrics(['n']))
            .duckdb('d', 'select 1', { reads: ['missing'] })
            .terminal('d')
            .build();
        expect(() => validateComposerDefinition(definition)).toThrow(
            /reads "missing"/,
        );
    });

    it('rejects duplicate node ids', () => {
        const definition = compose('p')
            .semantic('orders', query('orders').metrics(['n']))
            .semantic('orders', query('orders').metrics(['m']))
            .terminal('orders')
            .build();
        expect(() => validateComposerDefinition(definition)).toThrow(
            /used twice/,
        );
    });

    it('rejects bad pipeline and node ids', () => {
        expect(() =>
            validateComposerDefinition(
                compose('-bad')
                    .semantic('orders', query('orders'))
                    .terminal('orders')
                    .build(),
            ),
        ).toThrow(/pipeline id/);
        expect(() =>
            validateComposerDefinition(
                compose('ok')
                    .semantic('my-orders', query('orders'))
                    .terminal('my-orders')
                    .build(),
            ),
        ).toThrow(/node id "my-orders"/);
    });
});

type Call = {
    method: string;
    path: string;
    body?: unknown;
    metadata?: Record<string, unknown>;
};

const readyPage = (
    columns: Record<
        string,
        { reference: string; type: string; label?: string }
    >,
    rows: Record<string, { value: { raw: unknown; formatted: string } }>[],
) => ({
    status: 'ready',
    columns,
    rows,
    totalResults: rows.length,
    nextPage: undefined,
});

const makeTransport = (
    projectUuid: string,
    respond: (call: Call) => unknown,
) => {
    const calls: Call[] = [];
    const adapter: FetchAdapter = async <T>(
        method: string,
        path: string,
        body?: unknown,
        metadata?: Record<string, unknown>,
    ): Promise<T> => {
        const call = { method, path, body, metadata };
        calls.push(call);
        return respond(call) as T;
    };
    const transport = createApiTransport(
        { apiKey: '', baseUrl: '', projectUuid },
        adapter,
        { resolveExploreBaseTable: null },
    );
    return { transport, calls };
};

describe('executeComposer transport', () => {
    it('runs saved-chart sources first, submits the rest, and polls the terminal', async () => {
        const { transport, calls } = makeTransport('p-compose-1', (call) => {
            if (call.path.endsWith('/query/chart')) {
                return { queryUuid: 'chart-q', metricQuery: {}, fields: {} };
            }
            if (call.path.endsWith('/query-sources/queries')) {
                return {
                    queries: [
                        {
                            nodeId: 'orders',
                            sourceType: 'semanticLayer',
                            queryUuid: 'orders-q',
                        },
                        {
                            nodeId: 'joined',
                            sourceType: 'duckdb',
                            queryUuid: 'joined-q',
                        },
                    ],
                };
            }
            if (call.path.includes('/query/chart-q')) return readyPage({}, []);
            return readyPage(
                { month: { reference: 'month', type: 'date', label: 'Month' } },
                [
                    {
                        month: {
                            value: { raw: '2024-01-01', formatted: 'Jan 2024' },
                        },
                    },
                ],
            );
        });

        const definition = compose('revenue')
            .title('Revenue')
            .description('Joined revenue.')
            .parameters({ region: 'US' })
            .semantic('orders', query('orders').metrics(['total']).limit(10), {
                title: 'Orders',
            })
            .semantic('top', savedChart('chart-1'), {
                title: 'Top customers',
                description: 'Saved chart.',
            })
            .duckdb('joined', 'select * from orders, top', {
                reads: ['orders', 'top'],
                limit: 50,
            })
            .terminal('joined')
            .build();

        const result = await transport.executeComposer!(definition, {
            refresh: false,
        });

        const submit = calls.find((c) =>
            c.path.endsWith('/query-sources/queries'),
        )!;
        expect(submit.path).toBe(
            '/api/v2/projects/p-compose-1/query-sources/queries',
        );
        expect(submit.body).toEqual({
            parameters: { region: 'US' },
            queries: [
                expect.objectContaining({
                    sourceType: 'semanticLayer',
                    nodeId: 'orders',
                    title: 'Orders',
                    exploreName: 'orders',
                    metrics: ['orders_total'],
                    limit: 10,
                }),
                {
                    sourceType: 'duckdb',
                    nodeId: 'joined',
                    sql: 'select * from orders, top',
                    limit: 50,
                    references: { orders: 'orders', top: 'chart-q' },
                },
            ],
        });
        expect(submit.metadata).toEqual({
            kind: 'composer',
            queryId: 'revenue',
            label: 'Revenue',
            description: 'Joined revenue.',
            terminalNodeId: 'joined',
            savedChartNodes: [
                {
                    nodeId: 'top',
                    chartUuid: 'chart-1',
                    queryUuid: 'chart-q',
                    title: 'Top customers',
                    description: 'Saved chart.',
                },
            ],
        });
        // Saved chart is submitted and ready before the pipeline POST.
        expect(
            calls.findIndex((c) => c.path.endsWith('/query/chart')),
        ).toBeLessThan(calls.indexOf(submit));

        expect(result.queryUuid).toBe('joined-q');
        expect(result.rows).toEqual([{ month: '2024-01-01' }]);
        expect(result.columns).toEqual([
            { name: 'month', label: 'Month', type: 'date', fieldId: 'month' },
        ]);
        expect(result.format(result.rows[0], 'month')).toBe('Jan 2024');
        await expect(
            result.getUnderlyingData!({ row: result.rows[0], metric: 'x' }),
        ).rejects.toThrow(/not available for composer pipelines/);
    });

    it('maps a semantic terminal to short field names', async () => {
        const { transport } = makeTransport('p-compose-2', (call) => {
            if (call.method === 'POST') {
                return {
                    queries: [
                        {
                            nodeId: 'orders',
                            sourceType: 'semanticLayer',
                            queryUuid: 'o-q',
                        },
                    ],
                };
            }
            return readyPage(
                { orders_total: { reference: 'orders_total', type: 'number' } },
                [{ orders_total: { value: { raw: 3, formatted: '3' } } }],
            );
        });
        const result = await transport.executeComposer!(
            compose('p')
                .semantic('orders', query('orders').metrics(['total']))
                .terminal('orders')
                .build(),
            { refresh: false },
        );
        expect(result.rows).toEqual([{ total: 3 }]);
    });

    it('caches runs per definition, evicts on error, and refreshes on demand', async () => {
        let submits = 0;
        let fail = true;
        const { transport } = makeTransport('p-compose-3', (call) => {
            if (call.method === 'POST') {
                submits += 1;
                if (fail) throw new Error('boom');
                return {
                    queries: [
                        {
                            nodeId: 'o',
                            sourceType: 'semanticLayer',
                            queryUuid: 'q',
                        },
                    ],
                };
            }
            return readyPage({}, []);
        });
        const definition = compose('p')
            .semantic('o', query('orders').metrics(['n']))
            .terminal('o')
            .build();

        await expect(
            transport.executeComposer!(definition, { refresh: false }),
        ).rejects.toThrow('boom');
        fail = false;
        await transport.executeComposer!(definition, { refresh: false });
        await transport.executeComposer!(
            JSON.parse(JSON.stringify(definition)),
            { refresh: false },
        );
        expect(submits).toBe(2);
        await transport.executeComposer!(definition, { refresh: true });
        expect(submits).toBe(3);
    });

    it('rejects an invalid pipeline without calling the API', async () => {
        const { transport, calls } = makeTransport('p-compose-4', () => ({}));
        await expect(
            transport.executeComposer!(
                compose('p').semantic('o', query('orders')).build(),
                { refresh: false },
            ),
        ).rejects.toThrow(/\.terminal\(nodeId\)/);
        expect(calls).toHaveLength(0);
    });
});
