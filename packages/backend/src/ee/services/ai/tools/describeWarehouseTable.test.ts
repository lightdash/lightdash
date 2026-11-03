import {
    toolDescribeWarehouseTableOutputSchema,
    type ToolDescribeWarehouseTableOutput,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDescribeWarehouseTable } from './describeWarehouseTable';

describe('describeWarehouseTable', () => {
    it('shows the native type next to columns whose type it disambiguates', async () => {
        const tool = getDescribeWarehouseTable({
            describeWarehouseTable: async () => ({
                columns: [
                    {
                        name: 'created_at_local',
                        type: 'timestamp',
                        nativeType: 'DATETIME',
                    },
                    {
                        name: 'departure_at',
                        type: 'timestamp',
                        nativeType: 'TIMESTAMP',
                    },
                    {
                        name: 'pickup_time',
                        type: 'timestamp',
                        nativeType: 'TIME',
                    },
                    { name: 'name', type: 'string', nativeType: null },
                ],
                resolvedSchema: 'travel',
                resolvedDatabase: 'analytics',
            }),
        });

        const output = (await tool.execute!(
            { table: 'trips' },
            { toolCallId: 'test', messages: [], context: {} },
        )) as ToolDescribeWarehouseTableOutput;

        expect(output.result).toBe(
            [
                'Columns for `analytics.travel.trips` (4):',
                '  - created_at_local: timestamp (DATETIME)',
                '  - departure_at: timestamp (TIMESTAMP)',
                '  - pickup_time: timestamp (TIME)',
                '  - name: string',
            ].join('\n'),
        );
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('returns a schema-valid error when the lookup fails', async () => {
        const tool = getDescribeWarehouseTable({
            describeWarehouseTable: async () => {
                throw new Error('table not found');
            },
        });

        const output = (await tool.execute!(
            { table: 'trips' },
            { toolCallId: 'test', messages: [], context: {} },
        )) as ToolDescribeWarehouseTableOutput;

        expect(output.metadata.status).toBe('error');
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});
