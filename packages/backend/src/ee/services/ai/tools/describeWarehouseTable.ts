import { toolDescribeWarehouseTableArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import type { DescribeWarehouseTableFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    describeWarehouseTable: DescribeWarehouseTableFn;
};

export const getDescribeWarehouseTable = ({
    describeWarehouseTable,
}: Dependencies) =>
    tool({
        description: toolDescribeWarehouseTableArgsSchema.description,
        inputSchema: toolDescribeWarehouseTableArgsSchema,
        execute: async ({ table, schema }) => {
            try {
                const { columns, resolvedSchema } =
                    await describeWarehouseTable({ table, schema });

                if (columns.length === 0) {
                    return {
                        result: `No columns found for \`${
                            resolvedSchema ?? schema ?? '(default schema)'
                        }.${table}\`. The table may not exist or may be empty of metadata. Confirm the name via listWarehouseTables or ask the user.`,
                        metadata: { status: 'not_found' },
                    };
                }

                const qualified = `${
                    resolvedSchema ?? schema ?? '(default schema)'
                }.${table}`;
                const columnLines = columns
                    .map((c) => `  - ${c.name}: ${c.type}`)
                    .join('\n');

                return {
                    result: `Columns for \`${qualified}\` (${columns.length}):\n${columnLines}`,
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error describing warehouse table.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
