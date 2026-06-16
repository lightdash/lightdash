import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION = `Tool: analyzeFieldImpact

Purpose:
Compute the EXACT impact of changing or removing a single semantic-layer field (a metric or dimension) BEFORE the change is made. Use this whenever the user is about to remove, rename, deduplicate or otherwise alter a field and asks "what uses this?", "what will this break?", or "what's the impact?".

This is a deterministic lookup over saved content — NOT a fuzzy search. Prefer it over findContent/searchSemanticLayer when you already know the exact field id and need a reliable blast radius. It returns:
- the saved charts that directly reference the field
- the dashboards that embed those charts
- dashboards whose filters target the field
- other metrics built on this metric (metric-on-metric dependencies that break with no chart between them)
- scheduled deliveries / alerts on the affected charts or dashboards
- a severity: "breaking" if anything references the field, otherwise "safe"

Parameters:
- fieldId: The exact field id to analyze, formatted as "<table>_<fieldName>" (e.g. "orders_total_revenue"). This is the id used in chart definitions, not the human label. Use findFields / searchSemanticLayer first if you only have a label and need the id.

Output:
- A structured impact report with counts plus the named charts, dashboards, dependent metrics and scheduled deliveries.

Important:
This tool reports field REFERENCES. It cannot detect silent value-drift — a field whose id stays the same but whose underlying SQL/aggregation changes (so numbers move without breaking anything). Call that out separately when relevant.
`;

export const toolAnalyzeFieldImpactArgsSchema = createToolSchema()
    .extend({
        fieldId: z
            .string()
            .describe(
                'The exact field id to analyze, formatted as "<table>_<fieldName>" (e.g. "orders_total_revenue"). This is the id used in chart definitions, not the human-readable label.',
            ),
    })
    .build();

export const toolAnalyzeFieldImpactOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolAnalyzeFieldImpactArgs = z.infer<
    typeof toolAnalyzeFieldImpactArgsSchema
>;
export type ToolAnalyzeFieldImpactArgsTransformed = ToolAnalyzeFieldImpactArgs;
export type ToolAnalyzeFieldImpactOutput = z.infer<
    typeof toolAnalyzeFieldImpactOutputSchema
>;
