import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Purpose:
List physical tables available in the connected data warehouse. Use this BEFORE writing a runSql call when you need to discover the correct schema or table name for a table that isn't already exposed via an explore.

Returns a list of fully-qualified tables (database, schema, table). Results come from a cached metadata catalog, so this is fast and does NOT require user approval.

When to use:
- You want to write raw SQL and need the qualified table name (database.schema.table) on the first try.
- You're looking for a raw / staging / seed table that isn't surfaced by findExplores.
- You're trying to confirm a schema name before writing SQL.

Do NOT use:
- For column/field discovery — use findFields on the relevant explore instead.
- To run ad-hoc queries — use runSql.

Parameters:
- schema: Optional. Filter results to a specific schema name (e.g. "jaffle", "public", "raw").
- search: Optional. Case-insensitive substring filter on table name (e.g. "work_order").
- limit: Optional. Maximum number of tables to return. Defaults to 100.
`;

export const toolListWarehouseTablesArgsSchema = createToolSchema()
    .extend({
        schema: z
            .string()
            .optional()
            .describe('Optional schema name to filter results.'),
        search: z
            .string()
            .optional()
            .describe(
                'Optional case-insensitive substring filter on table name.',
            ),
        limit: z.coerce
            .number()
            .int()
            .positive()
            .max(500)
            .default(100)
            .describe(
                'Maximum number of tables to return (default 100, max 500).',
            ),
    })
    .build();

export type ToolListWarehouseTablesArgs = z.infer<
    typeof toolListWarehouseTablesArgsSchema
>;

export const toolListWarehouseTablesStructuredContentSchema = z.object({
    matchCount: z
        .number()
        .int()
        .describe('Number of tables matched; 0 when nothing matched.'),
    filters: z
        .object({
            schema: z.string().nullable(),
            search: z.string().nullable(),
        })
        .describe('Filters applied to the catalog; null when not given.'),
    tables: z
        .array(
            z.object({
                database: z.string(),
                schema: z.string(),
                table: z.string(),
                qualifiedName: z
                    .string()
                    .describe('"database.schema.table", ready to use in SQL.'),
            }),
        )
        .describe('Matched tables, in catalog order; empty when none matched.'),
});

export type ToolListWarehouseTablesStructuredContent = z.infer<
    typeof toolListWarehouseTablesStructuredContentSchema
>;

export const toolListWarehouseTablesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListWarehouseTablesStructuredContentSchema,
});

export type ToolListWarehouseTablesOutput = z.infer<
    typeof toolListWarehouseTablesOutputSchema
>;
