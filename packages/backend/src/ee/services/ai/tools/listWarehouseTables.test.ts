import {
    toolListWarehouseTablesOutputSchema,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { ListWarehouseTablesFn } from '../types/aiAgentDependencies';
import { getListWarehouseTables } from './listWarehouseTables';

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

const catalog: WarehouseTablesCatalog = {
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
        const output = await execute(async () => catalog, { limit: 100 });

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
        const output = await execute(async () => catalog, {
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
        const output = await execute(async () => catalog, {
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
