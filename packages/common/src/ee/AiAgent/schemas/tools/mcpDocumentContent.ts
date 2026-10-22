import { z } from 'zod';
import type { DocumentChartContent } from '../../../../types/document';
import { type ToolDescriptionContext } from '../defineTool';
import { toolNameFor } from './discoveryToolNames';
import {
    SQL_CHART_CREATE_GUIDANCE,
    toolChartAsCodeMetricQuerySchema,
    toolCreateContentArgsSchema,
} from './toolCreateContentArgs';
import {
    TOOL_EDIT_CONTENT_DESCRIPTION,
    toolEditContentArgsSchema,
} from './toolEditContentArgs';
import {
    READ_CONTENT_SHARED_DESCRIPTION,
    toolReadContentArgsSchema,
} from './toolReadContentArgs';

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

const sqlChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().optional(),
        sql: z.string().min(1),
        limit: z.number().int().positive(),
        chartKind: z.enum([
            'vertical_bar',
            'line',
            'pie',
            'big_number',
            'table',
        ]),
        config: z
            .record(z.string(), z.unknown())
            .describe(
                'SQL Runner chart config, as in SQL chart as code: { type: <chartKind>, metadata: { version: 1 }, fieldConfig: { x, y, groupBy } , display } for charts, or { type: "table", metadata: { version: 1 }, columns, display } for tables.',
            ),
        connection: z
            .string()
            .optional()
            .describe(
                "Warehouse connection name; omit for the project's default connection.",
            ),
    })
    .strict();

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
    z
        .object({
            source: z.literal('sql'),
            chart: sqlChartSchema,
        })
        .strict()
        .describe(
            'A SQL Runner chart owned by the Document. Adding or changing one needs SQL Runner access; anyone who can view the Document runs its SQL.',
        ),
]);

const DOCUMENT_MARKDOWN_DESCRIPTION =
    'Document body in Markdown. H1 headings are the sections of its table of contents; use H2 and H3 below them. Place each chart as its own block: a line with only <document-chart id="KEY">, separated from text by blank lines. KEY is an existing chart id (c1, c2, …) to keep that chart, or a key of `charts` for a new one. Charts not placed are removed.';

const documentChartsSchema = z
    .record(z.string(), mcpDocumentChartSchema)
    .describe(
        'Full chart definitions by key, as chart as code (see the developing-in-lightdash skill): a chart stores its query and visualization, never result rows or query UUIDs. Use a new key (e.g. "revenue") for a new chart; the server assigns it the next cN id. Pass an existing id to replace that chart. Omit charts you keep unchanged. Use {} when there are none.',
    );

const baseVersionUuidSchema = z
    .string()
    .uuid()
    .describe(
        'Version UUID from the latest read of the Document. A stale version fails: read the Document again and reapply the change on top of the newer version.',
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
                'A Space the user named or settled in the conversation: its slug, or its name exactly as the user gave it; a name that matches no Space fails with the closest Spaces listed. Otherwise null, without asking where to save: the Document is personal, visible only to the user and admins until it is saved to a Space. A Space found by search or listing, inferred from the project name, or the only one available is not one the user chose.',
            ),
        schemaVersion: z.literal(2),
        markdown: z.string().describe(DOCUMENT_MARKDOWN_DESCRIPTION),
        charts: documentChartsSchema,
    })
    .strict()
    .describe('Full Document JSON to create.');

export const mcpDocumentEditSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('content'),
            baseVersionUuid: baseVersionUuidSchema,
            markdown: z
                .string()
                .describe(
                    `Complete replacement Markdown. ${DOCUMENT_MARKDOWN_DESCRIPTION}`,
                ),
            charts: documentChartsSchema,
        })
        .strict(),
    z
        .object({
            type: z.literal('chart'),
            baseVersionUuid: baseVersionUuidSchema,
            chartId: z.string().min(1).describe('Stored chart id, e.g. c3.'),
            patch: z
                .array(z.unknown())
                .describe(
                    'RFC6902 operations applied to that chart ({ source, chart }) as read with its chartId, e.g. [{ "op": "replace", "path": "/chart/name", "value": "Revenue" }].',
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

export const MCP_CREATE_CONTENT_DESCRIPTION = ({
    runtime,
}: ToolDescriptionContext): string =>
    `Create a dashboard, chart, SQL chart or Document from its JSON; the developing-in-lightdash skill has the chart and dashboard shapes. ${SQL_CHART_CREATE_GUIDANCE} A Document (schema version 2) is Markdown with chart tags plus the charts they reference; the result shows its charts as short tags. A Document without a spaceSlug is personal until it is saved to a Space with ${toolNameFor('editContent', runtime)}. For a Document from an investigation, default to the research journey: questions explored, evidence and findings, follow-up questions, conclusions and limitations. Draw on the whole conversation and its tool results, not just the last answer, with supporting charts where available. Capture the observable investigation rather than private reasoning or a verbatim transcript, and name missing context rather than inventing findings or steps.`;

export const MCP_READ_CONTENT_DESCRIPTION = `Read a dashboard, chart, SQL chart, data app or Document by its slug. ${READ_CONTENT_SHARED_DESCRIPTION} A Document returns Markdown where each chart is a short tag (id, title, type, explore), plus the latest version UUID that edits need; pass chartId to read one chart in full. A tag marked unsupported is a chart from a newer version: keep its tag unchanged when editing.`;

export const MCP_EDIT_CONTENT_DESCRIPTION = (
    context: ToolDescriptionContext,
): string =>
    `${TOOL_EDIT_CONTENT_DESCRIPTION(context)} For a Document, pass documentEdit instead of patch.`;

export const mcpCreateContentArgsSchema = toolCreateContentArgsSchema.extend({
    type: z.enum(['dashboard', 'chart', 'sql_chart', 'document']),
    content: z.union([
        documentAsCodeSchema,
        toolCreateContentArgsSchema.shape.content,
    ]),
});

export const mcpReadContentArgsSchema = toolReadContentArgsSchema.extend({
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
    type: z.enum(['dashboard', 'chart', 'sql_chart', 'document']),
    patch: toolEditContentArgsSchema.shape.patch.optional(),
    documentEdit: mcpDocumentEditSchema
        .optional()
        .describe(
            'A Document edit: replace the Markdown (content), patch one chart (chart), or update metadata (metadata).',
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
