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
This tool reports field REFERENCES, not field VALUES. It cannot detect silent value-drift — a field whose id stays the same but whose underlying SQL/aggregation changes (so numbers move without breaking anything), nor whether a value-affecting change preserves the numbers it claims to (merging onto another field, splitting a metric into parts, replacing or refactoring a definition). A "safe" reference result does NOT prove a change is value-correct. When a change rests on a value claim — fields are equivalent, a split reconstructs the original, a refactor leaves results unchanged — prove it separately before calling the change safe: by construction (the same aggregation/column/model, a uniqueness guarantee such as a row_number() = 1 dedup or a primary key, or a true partition) or by data (run the relevant fields at a total grain and across a time dimension and confirm the expected relationship). Surface any divergence instead of asserting safety.
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
