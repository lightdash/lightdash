import {
    type ToolListWarehouseTablesOutput,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
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
        { toolCallId: 'test', messages: [] },
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
