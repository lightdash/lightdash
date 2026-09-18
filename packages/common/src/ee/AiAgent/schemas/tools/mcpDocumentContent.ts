import { z } from 'zod';
import {
    toolChartAsCodeMetricQuerySchema,
    toolCreateContentArgsSchema,
} from './toolCreateContentArgs';
import { toolEditContentArgsSchema } from './toolEditContentArgs';
import { toolReadContentArgsSchema } from './toolReadContentArgs';

const chartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().optional(),
        tableName: z.string().min(1),
        metricQuery: toolChartAsCodeMetricQuerySchema,
        chartConfig: z.unknown(),
        tableConfig: z.unknown().optional(),
        pivotConfig: z.unknown().optional(),
        parameters: z.unknown().optional(),
    })
    .strict();

const mergeSchema = z
    .object({
        primarySourceId: z.string().min(1),
        sources: z.array(
            z.discriminatedUnion('kind', [
                z.object({ id: z.string(), kind: z.literal('chart') }).strict(),
                z
                    .object({
                        id: z.string(),
                        kind: z.literal('query'),
                        metricQuery: z.record(z.string(), z.unknown()),
                    })
                    .strict(),
            ]),
        ),
        joinKey: z.array(z.unknown()),
        joinType: z.enum(['full', 'left', 'inner']),
        tableCalculations: z.array(z.unknown()),
    })
    .strict()
    .describe(
        'Durable SavedMergeQuery. Query sources contain full metric queries, never query UUIDs or result rows.',
    );

export const mcpDocumentCellSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('markdown'),
            content: z.object({ markdown: z.string() }).strict(),
        })
        .strict(),
    z
        .object({
            type: z.literal('chart'),
            content: z.discriminatedUnion('source', [
                z
                    .object({
                        source: z.literal('semantic'),
                        chart: chartSchema,
                    })
                    .strict(),
                z
                    .object({
                        source: z.literal('merge'),
                        chart: chartSchema.extend({ merge: mergeSchema }),
                    })
                    .strict(),
            ]),
        })
        .strict(),
]);

export const documentAsCodeSchema = z
    .object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string(),
        spaceSlug: z.string().min(1),
        schemaVersion: z.literal(1),
        content: z.object({ cells: z.array(mcpDocumentCellSchema) }).strict(),
    })
    .strict()
    .describe(
        'Document schema version 1. Supply ordered cells without IDs. Headings come from Markdown and chart names.',
    );

export const mcpDocumentEditSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('content'),
            baseVersionUuid: z
                .string()
                .uuid()
                .describe(
                    'Version UUID from read_content. Stale edits fail; reload and retry.',
                ),
            content: documentAsCodeSchema.shape.content.describe(
                'Complete replacement content. Include all cells to keep, including unchanged charts. Omitted cells are removed.',
            ),
        })
        .strict(),
    z
        .object({
            type: z.literal('metadata'),
            name: z.string().min(1).optional(),
            slug: z.string().min(1).optional(),
            description: z.string().optional(),
        })
        .strict(),
]);

export const mcpCreateContentArgsSchema = toolCreateContentArgsSchema.extend({
    type: z.enum(['dashboard', 'chart', 'document']),
    content: z.union([
        documentAsCodeSchema,
        toolCreateContentArgsSchema.shape.content,
    ]),
});

export const mcpReadContentArgsSchema = toolReadContentArgsSchema.extend({
    slug: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Content slug. Required unless reading a Document by documentUuid.',
        ),
    documentUuid: z
        .string()
        .uuid()
        .optional()
        .describe(
            'For Documents only: UUID from a canonical Document URL, instead of slug.',
        ),
    type: z.enum(['dashboard', 'chart', 'data_app', 'document']),
});

export const mcpEditContentArgsSchema = toolEditContentArgsSchema.extend({
    slug: z
        .string()
        .min(1)
        .describe('Exact content slug, as returned by read_content.'),
    type: z.enum(['dashboard', 'chart', 'document']),
    patch: toolEditContentArgsSchema.shape.patch.optional(),
    documentEdit: mcpDocumentEditSchema
        .optional()
        .describe(
            'Required for Documents instead of patch. Replace all content with baseVersionUuid, or update metadata separately.',
        ),
});

export type McpDocumentEdit = z.infer<typeof mcpDocumentEditSchema>;
export type McpDocumentAsCode = z.infer<typeof documentAsCodeSchema>;
