import { ChartMetadataStyle, Field, Filters } from '@lightdash/common';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const TITLE_MAX_LENGTH_CHARS = 140;
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
    filters?: Filters;
    fieldsContext: FieldInfo[];
    /** Raw chart configuration as JSON string */
    chartConfigJson?: string;
    /** An existing title whose voice and format the new title should follow. */
    styleReferenceTitle?: string;
    /** Naming style to generate in. Defaults to `question`. */
    style?: ChartMetadataStyle;
};

const FILTERS_IN_TITLE_GUIDANCE =
    'Reference filters in the title if there is a maximum of 2 filters applied. For example, date filters are super relevant on chart titles. If there are more than 2 filters, reference them in the description.';

/**
 * Title, description and filter guidance for each naming style. `question` is
 * the original prompt wording, so the default output is unchanged.
 */
const STYLE_GUIDANCE: Record<
    ChartMetadataStyle,
    { title: string; description: string; filters: string }
> = {
    question: {
        title: 'Be specific. Represent the title as a data question that it answers.',
        description:
            'Explain what insights the chart provides in one sentence.',
        filters: FILTERS_IN_TITLE_GUIDANCE,
    },
    compact: {
        title: 'Write a compact heading in Title Case that names what is measured and how it is broken down, e.g. "Unique Accounts by Market Segment". Do not phrase it as a question.',
        description:
            'In one short sentence, state what is measured, how it is broken down and any filters. No commentary.',
        filters: FILTERS_IN_TITLE_GUIDANCE,
    },
    short: {
        title: 'Write a very short label of 2 to 4 words, e.g. "Accounts per Segment". Do not phrase it as a question.',
        description: 'Write a short phrase of no more than 12 words.',
        filters:
            'Leave filters out of the title so it stays short. Mention up to 2 filters in the description.',
    },
};

/**
 * Guidance when rewriting in the voice of an existing title. The reference
 * sets the style, so no style line may pull another way: with the question
 * line in place the model returned a question for statement titles.
 */
const REFERENCE_GUIDANCE = {
    title: 'Be specific. Follow the voice and format of the existing title given below.',
    description: STYLE_GUIDANCE.question.description,
    filters: FILTERS_IN_TITLE_GUIDANCE,
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
    modelOptions: GeneratorModelOptions,
    context: ChartMetadataContext,
): Promise<GeneratedChartMetadata> {
    const fieldLabelMap = buildFieldLabelMap(context.fieldsContext);
    // An explicit style wins over a reference title
    const followsReference = !!context.styleReferenceTitle && !context.style;
    const guidance = followsReference
        ? REFERENCE_GUIDANCE
        : STYLE_GUIDANCE[context.style ?? 'question'];

    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'generateChartMetadata',
        'chart-metadata',
    );
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        output: Output.object({ schema: ChartMetadataSchema }),
        ...telemetry,
        allowSystemInMessages: true,
        messages: [
            {
                role: 'system',
                content: `Generate a concise title (max ${TITLE_MAX_LENGTH_CHARS} chars) and description (max ${DESCRIPTION_MAX_LENGTH_CHARS} chars) for a data chart.

Title: ${guidance.title}
Description: ${guidance.description}

IMPORTANT: Use the human-readable field labels provided, NOT the technical field IDs.
ALWAYS look at the chart type and its configuration so you know how to best represent the title and description.
Be direct - avoid phrases like "This chart shows..." and also avoid mentioning what the chart type is, but what the chart is about.
${guidance.filters}
${
    followsReference
        ? `\nMatch the voice and format of this existing title (statement or question, casing, length), but describe the chart as it is now: ${JSON.stringify(context.styleReferenceTitle)}\n`
        : ''
}`,
            },
            {
                role: 'user',
                content: `Chart type: ${context.chartType}
Data source: "${context.tableName}"
${context.filters ? `Filters: ${JSON.stringify(context.filters)}\n` : ''}
Field labels (use these instead of IDs):
${fieldLabelMap}
${
    context.chartConfigJson
        ? `\nChart configuration:\n${context.chartConfigJson}`
        : ''
}`,
            },
        ],
    });
    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
    return result.output;
}
