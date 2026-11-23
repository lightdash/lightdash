import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_GREP_WAREHOUSE_COLUMNS_DESCRIPTION = `Search the columns of the warehouse's physical tables by name or type, to find which tables hold a column: a key to join on, a date, an amount. It reads column metadata, kept for a while after the first read, so it runs no query on table data and needs no approval. The first search of a large schema is slower while its columns are read.

The pattern is case-insensitive. Words separated by spaces must all match one column, and | separates alternatives, e.g. "<entity> id|<entity>_id". It is matched against each column's name and type, so "timestamp" finds every timestamp column.

For every column of one table use describeWarehouseTable; for fields already in the semantic layer use grepFields.`;

export const toolGrepWarehouseColumnsArgsSchema = createToolSchema()
    .extend({
        pattern: z
            .string()
            .min(1)
            .describe(
                'What to look for in column names and types, e.g. "customer id", "amount|total" or "timestamp".',
            ),
        schema: z
            .string()
            .nullish()
            .describe(
                'Schema to search, e.g. "raw". Omit to search every schema; name one when the warehouse is large.',
            ),
        limit: z.coerce
            .number()
            .int()
            .positive()
            .max(200)
            .default(50)
            .describe(
                'Maximum number of tables to return (default 50, max 200).',
            ),
    })
    .build();

export type ToolGrepWarehouseColumnsArgs = z.infer<
    typeof toolGrepWarehouseColumnsArgsSchema
>;

export const toolGrepWarehouseColumnsStructuredContentSchema = z.object({
    matchCount: z
        .number()
        .int()
        .describe('Number of tables with a matching column, before the limit.'),
    searchedTableCount: z
        .number()
        .int()
        .describe('Number of tables whose columns were searched.'),
    unreadTableCount: z
        .number()
        .int()
        .describe(
            'Tables left out because one search reads a bounded number of them; name a schema to reach these.',
        ),
    tables: z
        .array(
            z.object({
                qualifiedName: z
                    .string()
                    .describe('"database.schema.table", ready to use in SQL.'),
                columns: z
                    .array(z.object({ name: z.string(), type: z.string() }))
                    .describe('The columns of this table that matched.'),
            }),
        )
        .describe('Matched tables, in the same order as the text.'),
});

export type ToolGrepWarehouseColumnsStructuredContent = z.infer<
    typeof toolGrepWarehouseColumnsStructuredContentSchema
>;

export const toolGrepWarehouseColumnsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGrepWarehouseColumnsStructuredContentSchema,
});

export type ToolGrepWarehouseColumnsOutput = z.infer<
    typeof toolGrepWarehouseColumnsOutputSchema
>;
