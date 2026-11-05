import { z } from 'zod';
import { DBFieldTypes } from '../../../../types/api';
import { FieldImpactSeverity } from '../../../../types/fieldImpact';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION = `Tool: analyzeFieldImpact

Purpose:
Compute the exact impact of changing or removing one semantic-layer field (a metric or dimension) before the change is made. It is a deterministic lookup over saved content, not a fuzzy search, so use it rather than findContent or searchSemanticLayer for a field's blast radius. It returns:
- the saved charts that directly reference the field
- the dashboards that embed those charts
- dashboards whose filters target the field
- other metrics built on this metric
- scheduled deliveries and alerts on the affected charts or dashboards
- a severity: "breaking" if anything references the field, otherwise "safe"

It reports references, not values: when a field keeps its id but its SQL or aggregation changes, numbers move without anything breaking, so "safe" does not prove a change keeps the numbers. When a change rests on a value claim (two fields are equivalent, a split reconstructs the original, a refactor leaves results unchanged), prove it before calling the change safe, by construction (the same model, column and aggregation, a uniqueness guarantee such as a primary key or a row_number() = 1 dedup, a true partition) or by data (query the fields at a total grain and across a time dimension), and report any divergence.
`;

export const toolAnalyzeFieldImpactArgsSchema = createToolSchema()
    .extend({
        fieldId: z
            .string()
            .describe(
                'The exact field id to analyze, formatted as "<table>_<fieldName>" (e.g. "orders_total_revenue"): the id used in chart definitions, not the label. When you only have the label, resolve the id first with grepFields or searchSemanticLayer.',
            ),
    })
    .build();

export const toolAnalyzeFieldImpactStructuredContentSchema = z.object({
    fieldId: z
        .string()
        .describe('The analyzed field id ("<table>_<fieldName>").'),
    fieldType: z
        .nativeEnum(DBFieldTypes)
        .nullable()
        .describe(
            'Inferred from the content referencing the field; null when nothing references it.',
        ),
    severity: z
        .nativeEnum(FieldImpactSeverity)
        .describe(
            '"breaking" when at least one chart, dependent metric or dashboard filter references the field; otherwise "safe". Does not detect silent value-drift.',
        ),
    summary: z
        .object({
            charts: z.number(),
            dashboards: z.number(),
            dashboardFilterTargets: z.number(),
            metricTreeDependents: z.number(),
            scheduledDeliveries: z.number(),
        })
        .describe('Count of each referencing item type.'),
    charts: z
        .array(
            z.object({
                uuid: z.string(),
                name: z.string(),
                spaceName: z.string(),
                dashboardName: z
                    .string()
                    .nullable()
                    .describe(
                        'Set when the chart lives inside a dashboard rather than a space.',
                    ),
                viewsCount: z.number(),
            }),
        )
        .describe('Saved charts that directly reference the field.'),
    dashboards: z
        .array(
            z.object({
                uuid: z.string(),
                name: z.string(),
                viaChartName: z
                    .string()
                    .describe(
                        'Name of an impacted chart that places this dashboard in the blast radius.',
                    ),
            }),
        )
        .describe('Dashboards that embed an impacted chart.'),
    dashboardFilterTargets: z
        .array(z.object({ uuid: z.string(), name: z.string() }))
        .describe('Dashboards whose filters target the field.'),
    metricTreeDependents: z
        .array(z.object({ fieldId: z.string() }))
        .describe(
            'Metrics built on this metric; they break with no chart between them.',
        ),
    scheduledDeliveries: z
        .array(
            z.object({
                name: z.string(),
                savedChartUuid: z.string().nullable(),
                dashboardUuid: z.string().nullable(),
            }),
        )
        .describe(
            'Scheduled deliveries and alerts on the affected charts or dashboards.',
        ),
});

export const toolAnalyzeFieldImpactOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolAnalyzeFieldImpactStructuredContentSchema,
});

export type ToolAnalyzeFieldImpactArgs = z.infer<
    typeof toolAnalyzeFieldImpactArgsSchema
>;
export type ToolAnalyzeFieldImpactArgsTransformed = ToolAnalyzeFieldImpactArgs;
export type ToolAnalyzeFieldImpactStructuredContent = z.infer<
    typeof toolAnalyzeFieldImpactStructuredContentSchema
>;
export type ToolAnalyzeFieldImpactOutput = z.infer<
    typeof toolAnalyzeFieldImpactOutputSchema
>;
