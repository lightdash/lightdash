import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolDescribeWarehouseTableDescription = ({
    name,
    findFieldsName,
    listWarehouseTablesName,
    runSqlName,
}: {
    name: string;
    findFieldsName: string;
    listWarehouseTablesName: string;
    runSqlName: string;
}) => `Tool: ${name}

Purpose:
Return the column names + types of a single raw warehouse table. Use this to learn the exact schema of a raw / staging / seed table that is NOT exposed via an explore, so you can write correct runSql on the first attempt.

Returns: { columns: [{ name, type }, ...] }. Pulled from cached metadata, fast, NO user approval required.

When to use:
- You're about to write ${runSqlName} against a raw table and need its columns (e.g. to confirm a join key exists).
- A previous ${runSqlName} failed with "column does not exist" or similar. Use this to recover, then retry the SQL ONCE.
- The user asked about a raw table that isn't part of any explore.

Do NOT use:
- For columns of explore-backed tables — use ${findFieldsName} instead.
- As a substitute for ${runSqlName} — this returns schema only, not data.
- For schema-wide listings — use ${listWarehouseTablesName} to find table names first.

Parameters:
- table: Required. The unqualified table name (e.g. "raw_parts", not "jaffle.raw_parts").
- schema: Optional. The schema name (e.g. "jaffle"). If omitted, the project's default schema is used.
`;

const toolDescribeWarehouseTableOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error', 'not_found']),
    }),
});

export const describeWarehouseTableTool = defineTool({
    canonicalName: 'describeWarehouseTable',
    title: 'Describe Warehouse Table',
    contexts: ['agent'] as const,
    description: {
        agent: ({ name }) =>
            getToolDescribeWarehouseTableDescription({
                findFieldsName: 'findFields',
                listWarehouseTablesName: 'listWarehouseTables',
                name,
                runSqlName: 'runSql',
            }),
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
                .extend({
                    table: z
                        .string()
                        .min(1)
                        .describe(
                            'The unqualified table name (e.g. "raw_parts"). Do not include schema/database here — use the schema parameter instead.',
                        ),
                    schema: z
                        .string()
                        .optional()
                        .describe(
                            "Optional schema name. Defaults to the project's default schema if omitted.",
                        ),
                })
                .build(),
    },
    outputSchema: toolDescribeWarehouseTableOutputSchema,
});

export type ToolDescribeWarehouseTableArgs = ToolInput<
    typeof describeWarehouseTableTool,
    'agent'
>;
export type ToolDescribeWarehouseTableOutput = ToolOutput<
    typeof describeWarehouseTableTool
>;
