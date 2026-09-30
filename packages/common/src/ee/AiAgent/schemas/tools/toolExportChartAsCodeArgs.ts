import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_EXPORT_CHART_AS_CODE_DESCRIPTION =
    'Export a chart as schema-validated chart-as-code YAML without running queries, saving or publishing content. Always call this tool for chart YAML; never reconstruct YAML yourself. For charts generated in this turn pass queryUuid from generateVisualization and null artifact identifiers. For an existing chart in this conversation, use its exact artifactUuid and versionUuid with null queryUuid. If these identifiers are unknown, pass null for all three source identifiers to list available artifacts first; never regenerate the chart just to export it. Never invent or use placeholder UUIDs. Supports built-in semantic, merged and pinned custom charts; use content tools for other sources. Pass null for an unspecified destination slug or spaceSlug: the tool will report exactly what is missing so you can ask the user. Never search content to infer a destination.';

export const toolExportChartAsCodeArgsSchema = z.object({
    queryUuid: z.string().uuid().nullable().optional(),
    artifactUuid: z.string().uuid().nullable().optional(),
    versionUuid: z.string().uuid().nullable().optional(),
    slug: z.string().min(1).max(255).nullable().optional(),
    spaceSlug: z.string().min(1).max(1024).nullable().optional(),
});

const artifactsSchema = z.array(
    z.object({
        artifactUuid: z.string(),
        versionUuid: z.string(),
        title: z.string().nullable(),
        description: z.string().nullable(),
    }),
);

export const toolExportChartAsCodeStructuredContentSchema = z.union([
    z.object({
        missingDestination: z.array(z.enum(['slug', 'spaceSlug'])),
        artifacts: artifactsSchema.optional(),
    }),
    z.object({ artifacts: artifactsSchema }),
    z.object({
        exportReady: z.literal(true),
        deliveryToken: z.string(),
        insertsValidatedYamlAtToken: z.literal(true),
        contentSaved: z.literal(false),
    }),
]);

export const toolExportChartAsCodeOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        deliveryToken: z.string().optional(),
    }),
    structuredContent: toolExportChartAsCodeStructuredContentSchema,
});

export type ToolExportChartAsCodeArgs = z.infer<
    typeof toolExportChartAsCodeArgsSchema
>;

export type ToolExportChartAsCodeStructuredContent = z.infer<
    typeof toolExportChartAsCodeStructuredContentSchema
>;

export type ToolExportChartAsCodeOutput = z.infer<
    typeof toolExportChartAsCodeOutputSchema
>;
