import { generateObject } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const MAX_ANOMALIES = 12;

const AnomalySchema = z.object({
    severity: z
        .enum(['high', 'medium', 'positive', 'info'])
        .describe(
            'high: needs attention now; medium: worth a look; positive: notable improvement; info: context worth knowing',
        ),
    text: z
        .string()
        .min(1)
        .max(400)
        .describe(
            'One or two sentences naming the value, the period or scope, and what it is compared against. Cite figures from the data only.',
        ),
    queryUuid: z.string().describe('The query uuid of the source section'),
    fieldId: z
        .string()
        .describe('The field id (not the label) of the metric this is about'),
    dimensionValues: z
        .record(z.string(), z.string())
        .describe(
            'Field id → value, copied exactly as shown in the data, for every dimension column that identifies the row',
        ),
    expected: z
        .string()
        .nullable()
        .describe(
            'The comparison value or target as shown in the data, if any',
        ),
    actual: z.string().nullable().describe('The observed value as shown'),
});

export const DataAppDetectionSchema = z.object({
    headline: z
        .string()
        .min(1)
        .max(200)
        .describe(
            'One sentence stating the single most important finding, with its figure, period and scope',
        ),
    summary: z
        .string()
        .min(1)
        .max(1200)
        .describe(
            'Two to four sentences an executive can read without the charts. Name the period and scope of every claim.',
        ),
    anomalies: z
        .array(AnomalySchema)
        .max(MAX_ANOMALIES)
        .describe(
            'Notable data points, most important first. Empty when nothing is out of the ordinary.',
        ),
    limitations: z
        .array(z.string().max(300))
        .max(8)
        .describe(
            'What could not be assessed: no comparison period, partial period, truncated data, conflicting scopes',
        ),
    dataAsOf: z
        .string()
        .nullable()
        .describe(
            'The period or snapshot the data covers, as stated in the data, or null if not stated',
        ),
});

export type DataAppDetection = z.infer<typeof DataAppDetectionSchema>;

const SYSTEM_PROMPT = `You are an analyst reading the query results behind a data app the viewer has open.
Find what is out of the ordinary and describe it so an executive understands it without the charts.

Rules:
- Use only the figures in the data. Never invent, extrapolate or round beyond what is shown.
- Every claim names its period and its scope (which region, product, segment, etc.).
- "Notable" means a material change against a comparison in the data, a breach of a target in the data, or an outlier among peers in the same table. Ordinary variation is not notable.
- Do not explain causes. Do not speculate about why. That is a separate step.
- When the data has no comparison period, say so in limitations instead of inferring a trend.
- When nothing is out of the ordinary, return an empty anomalies list and say so in the headline. That is a valid, useful answer.
- Each source section starts with "## <label>", a "Query: <uuid>" line and a "Fields:" legend mapping field ids to labels. Use field ids, not labels, in fieldId and in dimensionValues keys. Copy dimension values exactly as they appear in the rows.
- Sections marked truncated only show part of the rows; say so in limitations and do not claim totals for them.`;

export async function detectDataAppAnomalies(
    modelOptions: GeneratorModelOptions,
    {
        content,
        instructions,
    }: {
        content: string;
        instructions: string | null;
    },
): Promise<DataAppDetection> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'detectDataAppAnomalies',
        'data-app-analysis',
    );
    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: DataAppDetectionSchema,
        experimental_telemetry: telemetry,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    instructions
                        ? `Author instructions:\n${instructions}`
                        : null,
                    `Data:\n${content}`,
                ]
                    .filter((part): part is string => part !== null)
                    .join('\n\n'),
            },
        ],
    });
    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
    return result.object;
}
