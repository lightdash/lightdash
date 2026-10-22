import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION = `Return the column names and types of one raw, staging or seed table that no explore exposes. It reads cached metadata, so it is fast and needs no approval, and returns schema only, not data.

For explore-backed tables use grepFields and getMetadata; to find a table's name use listWarehouseTables.`;

export const toolDescribeWarehouseTableArgsSchema = createToolSchema()
    .extend({
        table: z
            .string()
            .min(1)
            .describe(
                'Unqualified table name, e.g. "raw_parts", not "jaffle.raw_parts"; pass the schema and database in their own parameters.',
            ),
        schema: z
            .string()
            .optional()
            .describe(
                'Schema name, e.g. "jaffle". Omit for the project\'s default schema.',
            ),
        database: z
            .string()
            .optional()
            .describe(
                "Database or catalog from listWarehouseTables, for a table outside the default database. Omit for the project's default database.",
            ),
    })
    .build();

export type ToolDescribeWarehouseTableArgs = z.infer<
    typeof toolDescribeWarehouseTableArgsSchema
>;

export const toolDescribeWarehouseTableStructuredContentSchema = z.object({
    qualifiedName: z
        .string()
        .describe(
            'Table name as resolved in the warehouse, e.g. "database.schema.table"; the schema part is "(default schema)" when none was given or resolved.',
        ),
    columnCount: z.number().int().describe('Number of columns returned.'),
    columns: z
        .array(z.object({ name: z.string(), type: z.string() }))
        .describe(
            'Column names and warehouse types; empty when the table was not found or has no cached metadata.',
        ),
});

export type ToolDescribeWarehouseTableStructuredContent = z.infer<
    typeof toolDescribeWarehouseTableStructuredContentSchema
>;

export const toolDescribeWarehouseTableOutputSchema =
    structuredToolOutputSchema({
        metadata: z.object({
            status: z.enum(['success', 'not_found', 'error']),
        }),
        structuredContent: toolDescribeWarehouseTableStructuredContentSchema,
        // A missing table is a real answer, not a failure: the tool returns an
        // empty column list, so not_found carries content rather than an error.
        contentStatuses: z.enum(['success', 'not_found']),
    });

export type ToolDescribeWarehouseTableOutput = z.infer<
    typeof toolDescribeWarehouseTableOutputSchema
>;
