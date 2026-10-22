import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION = `List the physical tables in the connected data warehouse as qualified database.schema.table names. Use it before writing raw SQL to find a raw, staging or seed table that no explore exposes, and its exact schema, so the first query names the table correctly. It reads a cached catalog, so it is fast and needs no approval.

For explore-backed tables use grepFields; for a raw table's columns use describeWarehouseTable.`;

export const toolListWarehouseTablesArgsSchema = createToolSchema()
    .extend({
        schema: z
            .string()
            .optional()
            .describe(
                'Schema to list, e.g. "jaffle", "public" or "raw". Omit to list every schema.',
            ),
        search: z
            .string()
            .optional()
            .describe(
                'Case-insensitive substring of the table name, e.g. "work_order".',
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

const tableSchema = z.object({
    database: z.string(),
    schema: z.string(),
    table: z.string(),
    qualifiedName: z
        .string()
        .describe('"database.schema.table", ready to use in SQL.'),
});

export const toolListWarehouseTablesStructuredContentSchema = z.union([
    z.object({
        matchCount: z
            .literal(0)
            .describe('Number of tables matched; 0 when nothing matched.'),
        filters: z
            .object({
                schema: z.string().nullable(),
                search: z.string().nullable(),
            })
            .describe('Filters applied to the catalog; null when not given.'),
        tables: z
            .array(tableSchema)
            .length(0)
            .describe(
                'Matched tables, in the same order as the text; empty when none matched.',
            ),
    }),
    z.object({
        matchCount: z
            .number()
            .int()
            .positive()
            .describe('Number of tables matched; 0 when nothing matched.'),
        tables: z
            .array(tableSchema)
            .describe(
                'Matched tables, in the same order as the text; empty when none matched.',
            ),
    }),
]);

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
