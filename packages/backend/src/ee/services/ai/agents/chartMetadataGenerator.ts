import { Field } from '@lightdash/common';
import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';

const TITLE_MAX_LENGTH_CHARS = 120;
const DESCRIPTION_MAX_LENGTH_CHARS = 500;

const ChartMetadataSchema = z.object({
    title: z
        .string()
        .min(1, 'Title must not be empty')
        .max(
            TITLE_MAX_LENGTH_CHARS,
            `Title must be ${TITLE_MAX_LENGTH_CHARS} characters or less`,
        )
        .describe('A concise, descriptive title for the chart'),
    description: z
        .string()
        .max(
            DESCRIPTION_MAX_LENGTH_CHARS,
            `Description must be ${DESCRIPTION_MAX_LENGTH_CHARS} characters or less`,
        )
        .describe(
            'A brief description explaining what insights this chart provides',
        ),
});

export type GeneratedChartMetadata = z.infer<typeof ChartMetadataSchema>;

type FieldInfo = Pick<Field, 'name' | 'label' | 'description' | 'type'>;

export type ChartMetadataContext = {
    tableName: string;
    chartType: string;
    dimensions: string[];
    metrics: string[];
    filters?: string;
    fieldsContext: FieldInfo[];
    /** Raw chart configuration as JSON string */
    chartConfigJson?: string;
};

/**
 * Build a field ID to label mapping for the prompt
 */
function buildFieldLabelMap(fieldsContext: FieldInfo[]): string {
    if (fieldsContext.length === 0) return 'No field information available.';
    return fieldsContext
        .map(
            (f) =>
                `${f.name} = "${f.label}"${
                    f.description ? ` (${f.description})` : ''
                }`,
        )
        .join('\n');
}

export async function generateChartMetadata(
    model: LanguageModel,
    context: ChartMetadataContext,
): Promise<GeneratedChartMetadata> {
    const fieldLabelMap = buildFieldLabelMap(context.fieldsContext);

    const result = await generateObject({
        model,
        schema: ChartMetadataSchema,
        messages: [
            {
                role: 'system',
                content: `Generate a concise title (max ${TITLE_MAX_LENGTH_CHARS} chars) and description (max ${DESCRIPTION_MAX_LENGTH_CHARS} chars) for a data chart.

Title: Be specific. Represent the title as a data question that it answers. 
Description: Explain what insights the chart provides in one sentence.

IMPORTANT: Use the human-readable field labels provided, NOT the technical field IDs.
ALWAYS look at the chart type and its configuration so you know how to best represent the title and description.
Be direct - avoid phrases like "This chart shows..." and also avoid mentioning what the chart type is, but what what the chart is about.`,
            },
            {
                role: 'user',
                content: `Chart type: ${context.chartType}
Data source: "${context.tableName}"
${context.filters ? `Filters: ${context.filters}\n` : ''}
Field labels (use these instead of IDs):
${fieldLabelMap}
${
    context.chartConfigJson
        ? `\nChart configuration:\n${context.chartConfigJson}`
        : ''
}`,
            },
        ],
        temperature: 0.3,
    });

    return result.object;
}
