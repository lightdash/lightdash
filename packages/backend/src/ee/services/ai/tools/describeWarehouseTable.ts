import {
    describeWarehouseTableToolDefinition,
    type ToolDescribeWarehouseTableStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { DescribeWarehouseTableFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    describeWarehouseTable: DescribeWarehouseTableFn;
};

type ExecuteResult =
    | ExecuteStructuredToolResult<
          ToolDescribeWarehouseTableStructuredContent,
          { status: 'success' | 'not_found' }
      >
    | ExecuteToolErrorResult;

const toolDefinition = describeWarehouseTableToolDefinition.for('agent');

export const getDescribeWarehouseTable = ({
    describeWarehouseTable,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            table,
            schema,
            database,
        }): Promise<ExecuteResult> => {
            try {
                const { columns, resolvedSchema, resolvedDatabase } =
                    await describeWarehouseTable({ table, schema, database });

                const qualifiedName = [
                    resolvedDatabase ?? database,
                    resolvedSchema ?? schema ?? '(default schema)',
                    table,
                ]
                    .filter(
                        (part) =>
                            part !== null && part !== undefined && part !== '',
                    )
                    .join('.');

                const structuredContent: ToolDescribeWarehouseTableStructuredContent =
                    {
                        qualifiedName,
                        columnCount: columns.length,
                        columns: columns.map(({ name, type }) => ({
                            name,
                            type,
                        })),
                    };

                if (structuredContent.columnCount === 0) {
                    return {
                        result: `No columns found for \`${qualifiedName}\`. The table may not exist or may be empty of metadata. Confirm the name via listWarehouseTables or ask the user.`,
                        metadata: { status: 'not_found' },
                        structuredContent,
                    };
                }

                const columnLines = structuredContent.columns
                    .map((c) => `  - ${c.name}: ${c.type}`)
                    .join('\n');

                return {
                    result: `Columns for \`${qualifiedName}\` (${structuredContent.columnCount}):\n${columnLines}`,
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error describing warehouse table.');
            }
        },
    });
