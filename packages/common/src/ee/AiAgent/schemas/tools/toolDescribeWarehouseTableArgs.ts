import { z } from 'zod';
import { DimensionType } from '../../../../types/field';
import {
    METRIC_VIEW_TABLE_TYPE,
    PartitionGranularity,
    PartitionType,
    WarehouseTableType,
} from '../../../../types/warehouse';
import { structuredToolOutputSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION = `Return the column names and types of one raw, staging or seed table that no explore exposes. Where the warehouse reports them, it also returns the table type (table, view, metric view), the table and column comments, a view's definition, and each metric view measure's expression, synonyms and window. It reads metadata only, so it is fast and needs no approval, and returns schema only, not data.

For explore-backed tables use grepFields and getMetadata; to find a table's name use listWarehouseTables.`;

export const toolDescribeWarehouseTableArgsSchema = createToolSchema()
    .extend({
        table: z
            .string()
            .min(1)
            .describe(
                'Unqualified table name, e.g. "<table>", not "<schema>.<table>"; pass the schema and database in their own parameters.',
            ),
        schema: z
            .string()
            .nullish()
            .describe(
                'Schema name, e.g. "<schema>". Omit for the project\'s default schema.',
            ),
        database: z
            .string()
            .nullish()
            .describe(
                "Database or catalog from listWarehouseTables, for a table outside the default database. Omit for the project's default database.",
            ),
    })
    .build();

export type ToolDescribeWarehouseTableArgs = z.infer<
    typeof toolDescribeWarehouseTableArgsSchema
>;

const metricViewFieldSchema = z.object({
    name: z.string(),
    expr: z.string(),
    label: z.string().nullable(),
    comment: z.string().nullable(),
    synonyms: z.array(z.string()),
});

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
    partitioning: z
        .object({
            partitionColumn: z.object({
                field: z.string(),
                partitionType: z.nativeEnum(PartitionType),
            }),
            granularity: z.nativeEnum(PartitionGranularity).nullable(),
            requiresPartitionFilter: z.boolean(),
        })
        .nullable()
        .describe(
            'Partition column of the table; null when it has none or the warehouse does not report one.',
        ),
    metadata: z
        .object({
            tableType: z.union([
                z.nativeEnum(WarehouseTableType),
                z.literal(METRIC_VIEW_TABLE_TYPE),
            ]),
            comment: z.string().nullable(),
            columns: z.array(
                z.object({
                    name: z.string(),
                    type: z.nativeEnum(DimensionType),
                    comment: z.string().nullable(),
                    isMeasure: z.boolean(),
                }),
            ),
            definition: z
                .object({ text: z.string(), truncated: z.boolean() })
                .nullable(),
            metricView: z
                .object({
                    source: z.string().nullable(),
                    filter: z.string().nullable(),
                    parameterized: z.boolean(),
                    dimensions: z.array(metricViewFieldSchema),
                    measures: z.array(
                        metricViewFieldSchema.extend({
                            window: z.array(
                                z.object({
                                    order: z.string(),
                                    range: z.string(),
                                    semiAdditive: z
                                        .enum(['first', 'last'])
                                        .nullable(),
                                    offset: z.string().nullable(),
                                }),
                            ),
                        }),
                    ),
                    joins: z.array(
                        z.object({
                            name: z.string(),
                            source: z.string(),
                            on: z.string().nullable(),
                            using: z.array(z.string()),
                        }),
                    ),
                })
                .nullable(),
        })
        .nullable()
        .describe(
            "Table type, table and column comments, the view or metric-view definition (truncated with a marker past a size cap), and a metric view's dimensions, measures and joins as data; null where the warehouse does not describe tables this way.",
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
