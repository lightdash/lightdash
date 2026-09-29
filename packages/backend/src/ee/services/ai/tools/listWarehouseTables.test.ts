import {
    toolListWarehouseTablesOutputSchema,
    type ToolListWarehouseTablesOutput,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import type { ListWarehouseTablesFn } from '../types/aiAgentDependencies';
import { getListWarehouseTables } from './listWarehouseTables';

const catalog: WarehouseTablesCatalog = {
    analytics: {
        staging: { orders_archive: {} },
        reporting: {
            ...Object.fromEntries(
                Array.from({ length: 60 }, (_, i) => [`unrelated_${i}`, {}]),
            ),
            orders: {},
            order_items: {},
        },
    },
    sandbox: { reporting: { orders: {} } },
};
const run = async (
    scores: Record<string, number | undefined> | null,
    options?: {
        schema?: string;
        search?: string;
        userQuestion?: string;
        limit?: number;
        enabled?: boolean;
        catalog?: WarehouseTablesCatalog;
    },
) => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const evaluate = vi
        .spyOn(decisions, 'evaluate')
        .mockImplementation(async ({ questions }) =>
            scores === null
                ? null
                : Object.fromEntries(
                      Object.keys(questions).map((key) => [
                          key,
                          { type: 'noul' as const, noul: scores[key] ?? 0.1 },
                      ]),
                  ),
        );
    const tool = getListWarehouseTables({
        listWarehouseTables: async () => options?.catalog ?? catalog,
        decisions: options?.enabled === false ? undefined : decisions,
        userQuestion: options?.userQuestion ?? 'Show orders',
    });
    const result = (await tool.execute!(
        {
            schema: options?.schema,
            search: options?.search,
            limit: options?.limit ?? 1,
        },
        { toolCallId: 'test', messages: [], context: {} },
    )) as ToolListWarehouseTablesOutput;
    return { result, evaluate };
};

describe('warehouse table ranking', () => {
    it('preserves relevance order across interleaved schemas in the rendered result', async () => {
        const { result } = await run(
            { fit_0: 0.99, fit_1: 0.86, fit_2: 0.97 },
            {
                limit: 3,
                catalog: {
                    analytics: {
                        reporting: { orders: {}, orders_archive: {} },
                        staging: { orders: {} },
                    },
                },
            },
        );
        expect(
            result.result.split('\n').filter((line) => line.startsWith('  - ')),
        ).toEqual([
            '  - analytics.reporting.orders',
            '  - analytics.staging.orders',
            '  - analytics.reporting.orders_archive',
        ]);
    });

    it('considers relevant tables beyond the output limit in a bounded shortlist', async () => {
        const { result, evaluate } = await run({ fit_1: 0.99 });
        expect(result.result).toContain('analytics.reporting.orders');
        expect(result.result).not.toContain('unrelated_');
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toHaveLength(
            30,
        );
    });

    it('preserves qualified identity, schema and substring search filters', async () => {
        const { result, evaluate } = await run(
            { fit_1: 0.99 },
            { schema: 'reporting', search: 'orders' },
        );
        expect(result.result).toContain('sandbox.reporting.orders');
        expect(evaluate.mock.calls[0][0].state).toEqual({
            query: 'Show orders',
            candidates: [
                {
                    database: 'analytics',
                    schema: 'reporting',
                    table: 'orders',
                    tableType: null,
                },
                {
                    database: 'sandbox',
                    schema: 'reporting',
                    table: 'orders',
                    tableType: null,
                },
            ],
        });
    });

    it.each([null, {}, { fit_0: 0.6 }])(
        'uses deterministic lexical order on outage or low confidence: %j',
        async (scores) => {
            const { result } = await run(scores);
            expect(result.result).toContain('analytics.staging.orders_archive');
        },
    );

    it('keeps strong lexical matches ahead of catalog noise when ranking abstains', async () => {
        const { result } = await run(null, {
            userQuestion: 'Count attempted delivery route stops',
            catalog: {
                noise: {
                    unrelated: Object.fromEntries(
                        Array.from({ length: 60 }, (_, i) => [
                            `unrelated_${i}`,
                            {},
                        ]),
                    ),
                },
                logistics: {
                    ops: {
                        deliveries: {},
                        delivery_route_stops: {},
                        delivery_status_history: {},
                    },
                },
            },
        });
        expect(result.result).toContain('logistics.ops.delivery_route_stops');
    });

    it('keeps flag-off behavior and avoids ranking empty requests', async () => {
        const disabled = await run({ fit_1: 0.99 }, { enabled: false });
        expect(disabled.evaluate).not.toHaveBeenCalled();
        expect(disabled.result.result).toContain(
            'analytics.staging.orders_archive',
        );
        const empty = await run({}, { userQuestion: '' });
        expect(empty.evaluate).not.toHaveBeenCalled();
    });
});

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const structuredCatalog: WarehouseTablesCatalog = {
    analytics: {
        jaffle: { customers: {}, orders: {}, payments: {} },
        raw: { raw_orders: {} },
    },
};

const execute = async (
    listWarehouseTables: ListWarehouseTablesFn,
    args: { schema?: string; search?: string; limit: number },
) => {
    const agentTool = getListWarehouseTables({ listWarehouseTables });
    if (!agentTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await agentTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a single output, got a stream');
    }
    return output;
};

describe('listWarehouseTables tool', () => {
    test('renders matched tables grouped by schema and as structured content', async () => {
        const output = await execute(async () => structuredCatalog, {
            limit: 100,
        });

        expect(output.result).toBe(
            [
                '4 table(s) matched.',
                '',
                'analytics.jaffle:',
                '  - analytics.jaffle.customers',
                '  - analytics.jaffle.orders',
                '  - analytics.jaffle.payments',
                '',
                'analytics.raw:',
                '  - analytics.raw.raw_orders',
            ].join('\n'),
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            matchCount: 4,
            filters: { schema: null, search: null },
            tables: [
                {
                    database: 'analytics',
                    schema: 'jaffle',
                    table: 'customers',
                    qualifiedName: 'analytics.jaffle.customers',
                },
                {
                    database: 'analytics',
                    schema: 'jaffle',
                    table: 'orders',
                    qualifiedName: 'analytics.jaffle.orders',
                },
                {
                    database: 'analytics',
                    schema: 'jaffle',
                    table: 'payments',
                    qualifiedName: 'analytics.jaffle.payments',
                },
                {
                    database: 'analytics',
                    schema: 'raw',
                    table: 'raw_orders',
                    qualifiedName: 'analytics.raw.raw_orders',
                },
            ],
        });
        expect(
            toolListWarehouseTablesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    test('applies schema, search and limit filters to both renderings', async () => {
        const output = await execute(async () => structuredCatalog, {
            schema: 'jaffle',
            search: 'ORDER',
            limit: 1,
        });

        expect(output.result).toBe(
            '1 table(s) matched.\n\nanalytics.jaffle:\n  - analytics.jaffle.orders',
        );
        expect(output.structuredContent).toEqual({
            matchCount: 1,
            filters: { schema: 'jaffle', search: 'ORDER' },
            tables: [
                {
                    database: 'analytics',
                    schema: 'jaffle',
                    table: 'orders',
                    qualifiedName: 'analytics.jaffle.orders',
                },
            ],
        });
    });

    test('reports no matches with the filters it applied', async () => {
        const output = await execute(async () => structuredCatalog, {
            schema: 'missing',
            limit: 100,
        });

        expect(output.result).toBe(
            'No tables matched. Filters: schema=missing, search=(none). Try a broader search.',
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            matchCount: 0,
            filters: { schema: 'missing', search: null },
            tables: [],
        });
        expect(
            toolListWarehouseTablesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    test('mirrors the error text as structured content when the catalog throws', async () => {
        const output = await execute(
            async () => {
                throw new Error('warehouse unreachable');
            },
            { limit: 100 },
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error listing warehouse tables.');
        expect(output.result).toContain('warehouse unreachable');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolListWarehouseTablesOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});
