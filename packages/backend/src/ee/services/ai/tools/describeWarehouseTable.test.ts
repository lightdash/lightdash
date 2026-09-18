import { toolDescribeWarehouseTableOutputSchema } from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { DescribeWarehouseTableFn } from '../types/aiAgentDependencies';
import { getDescribeWarehouseTable } from './describeWarehouseTable';

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

const execute = async (
    describeWarehouseTable: DescribeWarehouseTableFn,
    args: { table: string; schema?: string; database?: string },
) => {
    const agentTool = getDescribeWarehouseTable({ describeWarehouseTable });
    if (!agentTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await agentTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a single output, got a stream');
    }
    return output;
};

describe('describeWarehouseTable tool', () => {
    test('renders columns as text and as structured content from one computation', async () => {
        const columns = [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'varchar' },
        ];
        const describeWarehouseTable = vi.fn<DescribeWarehouseTableFn>(
            async () => ({
                columns,
                resolvedSchema: 'jaffle',
                resolvedDatabase: 'analytics',
            }),
        );

        const output = await execute(describeWarehouseTable, {
            table: 'raw_parts',
        });

        expect(describeWarehouseTable).toHaveBeenCalledWith({
            table: 'raw_parts',
            schema: undefined,
            database: undefined,
        });
        expect(output.result).toBe(
            'Columns for `analytics.jaffle.raw_parts` (2):\n  - id: integer\n  - name: varchar',
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            qualifiedName: 'analytics.jaffle.raw_parts',
            columnCount: 2,
            columns,
        });
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    test('falls back to the requested schema and database when nothing resolves', async () => {
        const output = await execute(
            async () => ({
                columns: [{ name: 'id', type: 'integer' }],
                resolvedSchema: null,
                resolvedDatabase: null,
            }),
            { table: 'raw_parts', schema: 'staging', database: 'warehouse' },
        );

        expect(output.result).toBe(
            'Columns for `warehouse.staging.raw_parts` (1):\n  - id: integer',
        );
        expect(output.structuredContent).toMatchObject({
            qualifiedName: 'warehouse.staging.raw_parts',
        });
    });

    test('reports a missing table as not_found with an empty column list', async () => {
        const output = await execute(
            async () => ({
                columns: [],
                resolvedSchema: null,
                resolvedDatabase: null,
            }),
            { table: 'ghost' },
        );

        expect(output.result).toBe(
            'No columns found for `(default schema).ghost`. The table may not exist or may be empty of metadata. Confirm the name via listWarehouseTables or ask the user.',
        );
        expect(output.metadata).toEqual({ status: 'not_found' });
        expect(output.structuredContent).toEqual({
            qualifiedName: '(default schema).ghost',
            columnCount: 0,
            columns: [],
        });
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    test('mirrors the error text as structured content when the lookup throws', async () => {
        const output = await execute(
            async () => {
                throw new Error('warehouse unreachable');
            },
            { table: 'raw_parts' },
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error describing warehouse table.');
        expect(output.result).toContain('warehouse unreachable');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});
