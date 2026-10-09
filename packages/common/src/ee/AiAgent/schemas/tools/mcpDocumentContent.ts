import { z } from 'zod';
import type { DocumentChartContent } from '../../../../types/document';
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
        chartConfig: z
            .unknown()
            .describe(
                'Chart-as-code chartConfig. A custom chart type uses { type: "data_app_viz", config: { dataAppVizSlug, dataAppVizVersion, fieldMapping, optionValues } }: the slug of a chart type installed in this project, an optional pinned version (latest renderable when omitted), its field slots bound to query field IDs, and its options. When editing, keep existing custom chart configs unchanged.',
            ),
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

export const mcpDocumentChartSchema = z.discriminatedUnion('source', [
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
]);

const DOCUMENT_MARKDOWN_DESCRIPTION =
    'Document body in Markdown. Place each chart as its own block: a line with only <document-chart id="KEY">, separated from text by blank lines. KEY is an existing chart id (c1, c2, …) to keep that chart, or a key of `charts` for a new one. Charts not placed are removed.';

const documentChartsSchema = z
    .record(z.string(), mcpDocumentChartSchema)
    .describe(
        'Full chart definitions by key. Use a new key (e.g. "revenue") for a new chart; the server assigns it the next cN id. Pass an existing id to replace that chart. Omit charts you keep unchanged. Use {} when there are none.',
    );

export const documentAsCodeSchema = z
    .object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string(),
        spaceSlug: z
            .string()
            .min(1)
            .nullable()
            .describe(
                'Space slug, or the Space name exactly as the user gave it. null keeps the Document personal: only the user and admins can see it until it is saved to a Space.',
            ),
        schemaVersion: z.literal(2),
        markdown: z.string().describe(DOCUMENT_MARKDOWN_DESCRIPTION),
        charts: documentChartsSchema,
    })
    .strict()
    .describe(
        'Document schema version 2: Markdown with chart tags, plus the charts they reference. Headings come from Markdown.',
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
            markdown: z
                .string()
                .describe(
                    `Complete replacement Markdown. ${DOCUMENT_MARKDOWN_DESCRIPTION} Keep unchanged charts by their tag alone.`,
                ),
            charts: documentChartsSchema,
        })
        .strict(),
    z
        .object({
            type: z.literal('chart'),
            baseVersionUuid: z
                .string()
                .uuid()
                .describe(
                    'Version UUID from read_content. Stale edits fail; reload and retry.',
                ),
            chartId: z.string().min(1).describe('Stored chart id, e.g. c3.'),
            patch: z
                .array(z.unknown())
                .describe(
                    'RFC6902 operations applied to that chart ({ source, chart }), e.g. [{ "op": "replace", "path": "/chart/name", "value": "Revenue" }]. Read the chart first with readContent and chartId.',
                ),
        })
        .strict(),
    z
        .object({
            type: z.literal('metadata'),
            name: z.string().min(1).optional(),
            slug: z.string().min(1).optional(),
            description: z.string().optional(),
            spaceSlug: z
                .string()
                .min(1)
                .optional()
                .describe(
                    'Saves a personal Document into this Space: its slug, or the Space name exactly as the user gave it. Documents already in a Space cannot be moved.',
                ),
        })
        .strict(),
]);

export const mcpCreateContentArgsSchema = toolCreateContentArgsSchema.extend({
    type: z.enum(['dashboard', 'chart', 'sql_chart', 'document']),
    content: z.union([
        documentAsCodeSchema,
        toolCreateContentArgsSchema.shape.content,
    ]),
});

export const mcpReadContentArgsSchema = toolReadContentArgsSchema.extend({
    slug: z
        .string()
        .min(1)
        .nullish()
        .describe(
            'Content slug. Null only when reading a Document by documentUuid.',
        ),
    documentUuid: z
        .string()
        .uuid()
        .nullish()
        .describe(
            'For Documents only: UUID from a canonical Document URL, instead of slug. Null for other content types.',
        ),
    type: z.enum(['dashboard', 'chart', 'sql_chart', 'data_app', 'document']),
    chartId: z
        .string()
        .min(1)
        .nullish()
        .describe(
            'For Documents only: return this chart (e.g. c3) in full instead of the Document. Null for other content types.',
        ),
});

export const mcpEditContentArgsSchema = toolEditContentArgsSchema.extend({
    slug: z
        .string()
        .min(1)
        .describe('Exact content slug, as returned by read_content.'),
    type: z.enum(['dashboard', 'chart', 'sql_chart', 'document']),
    patch: toolEditContentArgsSchema.shape.patch.optional(),
    documentEdit: mcpDocumentEditSchema
        .optional()
        .describe(
            'Required for Documents instead of patch. Replace the Markdown, patch one chart, or update metadata.',
        ),
});

export type McpDocumentEdit = z.infer<typeof mcpDocumentEditSchema>;
export type McpDocumentAsCode = z.infer<typeof documentAsCodeSchema>;

/**
 * A Document as an agent reads it: Markdown whose chart tags are short
 * descriptions, or a single chart in full when one was asked for.
 */
export type McpDocumentRead = Omit<McpDocumentAsCode, 'markdown' | 'charts'> &
    (
        | { markdown: string; chart: null }
        | {
              markdown: null;
              chart: { id: string } & DocumentChartContent;
          }
    );
