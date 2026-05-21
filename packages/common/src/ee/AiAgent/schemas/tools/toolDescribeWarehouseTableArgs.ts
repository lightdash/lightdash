import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

const TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION = `Tool: describe_warehouse_table

Purpose:
Return the column names + types of a single raw warehouse table. Use this to learn the exact schema of a raw / staging / seed table that is NOT exposed via an explore, so you can write correct runSql on the first attempt.

Returns: { columns: [{ name, type }, ...] }. Pulled from cached metadata, fast, NO user approval required.

When to use:
- You're about to write runSql against a raw table and need its columns (e.g. to confirm a join key exists).
- A previous runSql failed with "column does not exist" or similar. Use this to recover, then retry the SQL ONCE.
- The user asked about a raw table that isn't part of any explore.

Do NOT use:
- For columns of explore-backed tables — use findFields instead.
- As a substitute for runSql — this returns schema only, not data.
- For schema-wide listings — use listWarehouseTables to find table names first.

Parameters:
- table: Required. The unqualified table name (e.g. "raw_parts", not "jaffle.raw_parts").
- schema: Optional. The schema name (e.g. "jaffle"). If omitted, the project's default schema is used.
`;

export const toolDescribeWarehouseTableArgsSchema = createToolSchema({
    description: TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
})
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
    .build();

export type ToolDescribeWarehouseTableArgs = z.infer<
    typeof toolDescribeWarehouseTableArgsSchema
>;
