import { describeWarehouseTableToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { DescribeWarehouseTableFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    describeWarehouseTable: DescribeWarehouseTableFn;
};

const toolDefinition = describeWarehouseTableToolDefinition.for('agent');

export const getDescribeWarehouseTable = ({
    describeWarehouseTable,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ table, schema, database }) => {
            try {
                const { columns, resolvedSchema, resolvedDatabase } =
                    await describeWarehouseTable({ table, schema, database });

                const qualified = [
                    resolvedDatabase ?? database,
                    resolvedSchema ?? schema ?? '(default schema)',
                    table,
                ]
                    .filter(
                        (part) =>
                            part !== null && part !== undefined && part !== '',
                    )
                    .join('.');

                if (columns.length === 0) {
                    return {
                        result: `No columns found for \`${qualified}\`. The table may not exist or may be empty of metadata. Confirm the name via listWarehouseTables or ask the user.`,
                        metadata: { status: 'not_found' },
                    };
                }

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
