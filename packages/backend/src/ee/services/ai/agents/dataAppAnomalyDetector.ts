import { generateText, Output } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
    type AiUsageTokens,
} from '../../../../analytics/aiUsage';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

// Length and count limits are stated to the model in the descriptions and
// enforced after parsing. Zod .max() would make the SDK reject an otherwise
// valid response because one string ran a few characters over.
const LIMITS = {
    anomalyText: 400,
    headline: 200,
    summary: 1200,
    anomalies: 12,
    limitation: 300,
    limitations: 8,
} as const;

const AnomalySchema = z.object({
    severity: z
        .enum(['high', 'medium', 'positive', 'info'])
        .describe(
            'high: needs attention now; medium: worth a look; positive: notable improvement; info: context that changes how the other findings read (a gap, a partial period). Never info for "X is the largest share".',
        ),
    text: z
        .string()
        .min(1)
        .describe(
            `One or two sentences naming the value, the period or scope, and what it is compared against. Cite figures from the data only. At most ${LIMITS.anomalyText} characters.`,
        ),
    queryUuid: z.string().describe('The query uuid of the source section'),
    fieldId: z
        .string()
        .describe('The field id (not the label) of the metric this is about'),
    rowIdentity: z
        .array(
            z.object({
                fieldId: z
                    .string()
                    .describe('A dimension field id from the Fields legend'),
                value: z
                    .string()
                    .describe("That column's value, copied exactly as shown"),
            }),
        )
        .describe(
            'Every dimension column of the row this finding is about, for example [{ "fieldId": "orders_order_date_day", "value": "2025-01-03" }]. Required whenever the finding names a specific date, category, region or other row. Empty only for a finding about the table as a whole.',
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
        .describe(
            `One sentence stating the single most important finding, with its figure, period and scope. At most ${LIMITS.headline} characters.`,
        ),
    summary: z
        .string()
        .min(1)
        .describe(
            `Two to four sentences an executive can read without the charts. Name the period and scope of every claim. At most ${LIMITS.summary} characters.`,
        ),
    anomalies: z
        .array(AnomalySchema)
        .describe(
            `Notable data points, most important first. Empty when nothing is out of the ordinary. At most ${LIMITS.anomalies} items.`,
        ),
    limitations: z
        .array(z.string())
        .describe(
            `What could not be assessed: no comparison period, partial period, truncated data, conflicting scopes. At most ${LIMITS.limitations} items of at most ${LIMITS.limitation} characters each.`,
        ),
    dataAsOf: z
        .string()
        .nullable()
        .describe(
            'The period or snapshot the data covers, as stated in the data, or null if not stated',
        ),
});

type RawDataAppDetection = z.infer<typeof DataAppDetectionSchema>;

export type DataAppDetectionAnomaly = Omit<
    RawDataAppDetection['anomalies'][number],
    'rowIdentity'
> & { dimensionValues: Record<string, string> };

export type DataAppDetection = Omit<RawDataAppDetection, 'anomalies'> & {
    anomalies: DataAppDetectionAnomaly[];
};

/** Cuts text to `max` characters at a word boundary, ending with an ellipsis. */
export const truncateText = (text: string, max: number): string => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    const base = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
    return `${base.trimEnd()}…`;
};

// The model fills an explicit list far more reliably than a dynamic-key
// record; the rest of the system keys on the record shape.
const toDimensionValues = (
    rowIdentity: RawDataAppDetection['anomalies'][number]['rowIdentity'],
): Record<string, string> =>
    Object.fromEntries(
        rowIdentity.map(({ fieldId, value }) => [fieldId, value]),
    );

const SYSTEM_PROMPT = `You are an analyst reading the query results behind a page of charts the viewer has open.
Find what is out of the ordinary and describe it so an executive understands it without the charts.

Rules:
- Use only the figures in the data. Never invent, extrapolate or round beyond what is shown.
- Every claim names its period and its scope (which region, product, segment, etc.).
- "Notable" means a material change against a comparison in the data, a breach of a target in the data, or an outlier among peers in the same table. Ordinary variation is not notable.
- Assess each source section on its own before writing the summary. A row several times its peers in the same section, or a period several times its neighbouring periods, is notable even when every other section looks ordinary.
- Respect periodicity. On daily data, compare a day against the same weekday in prior weeks, not against its calendar neighbours. A pattern that repeats every week — weekend spikes or dips, quiet Mondays — is the baseline, not an anomaly. Flag such a day only when it breaks its own like-for-like baseline (this Saturday far above or below recent Saturdays). The same applies to any recurring cycle visible in the data, such as month-end or quarter-end peaks.
- Some sections carry a "Seasonality" note: weekday deviations were pre-computed deterministically. In those sections, do not judge daily rows yourself: only rows marked in the Seasonality column qualify as date-row anomalies. For a marked row, use the stated median as the finding's expected value and the row's own value as actual. Trust the absence of a marker only as far as the note states: when it says all measurements were assessed, unmarked rows are within their normal weekly pattern; when it reports unassessed measurements or deviations omitted by the marker cap, unmarked rows are unverified — do not flag them yourself and do not describe them as normal.
- The largest category, the dominant share or the top of a ranking is not a finding by itself. Report it only when the data shows it changed or breaches a comparison.
- Do not explain causes. Do not speculate about why. That is a separate step.
- When the data has no comparison period, say so in limitations instead of inferring a trend.
- When nothing is out of the ordinary, return an empty anomalies list and say so in the headline. That is a valid, useful answer.
- Each source section starts with "## <label>", a "Query: <uuid>" line and a "Fields:" legend mapping field ids to labels. Use field ids, not labels, in fieldId and in rowIdentity. Copy dimension values exactly as they appear in the rows.
- A finding about a specific row (a date, a category, a region) must carry that row's rowIdentity so it can be checked against the data and highlighted on the chart. One finding per row; do not merge several rows into one finding.
- Figures in the headline and summary must match the figures in the anomalies. Never state a number in prose that you have not put in a finding.
- Sections marked truncated only show part of the rows; say so in limitations and do not claim totals for them.`;

export async function detectDataAppAnomalies(
    modelOptions: GeneratorModelOptions,
    {
        content,
        instructions,
        today,
    }: {
        content: string;
        instructions: string | null;
        /** Calendar date the run happens on; the model has no clock. */
        today: string;
    },
): Promise<{ detection: DataAppDetection; usage: AiUsageTokens }> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'detectDataAppAnomalies',
        'data-app-analysis',
    );
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        output: Output.object({ schema: DataAppDetectionSchema }),
        ...telemetry,
        allowSystemInMessages: true,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    `Today is ${today}. Dates up to today are past, not forecasts.`,
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
    const usage = languageModelUsageToTokens(result.usage);
    emitAiUsage(telemetry, usage);
    const { headline, summary, anomalies, limitations, dataAsOf } =
        result.output;
    return {
        detection: {
            headline: truncateText(headline, LIMITS.headline),
            summary: truncateText(summary, LIMITS.summary),
            anomalies: anomalies
                .slice(0, LIMITS.anomalies)
                .map(({ rowIdentity, text, ...anomaly }) => ({
                    ...anomaly,
                    text: truncateText(text, LIMITS.anomalyText),
                    dimensionValues: toDimensionValues(rowIdentity),
                })),
            limitations: limitations
                .slice(0, LIMITS.limitations)
                .map((limitation) =>
                    truncateText(limitation, LIMITS.limitation),
                ),
            dataAsOf,
        },
        usage,
    };
}
