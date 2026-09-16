import { generateText } from 'ai';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const MAX_OUTPUT_TOKENS = 700;

const SYSTEM_PROMPT = `You answer a question from a data app about the query results the viewer has open.
The app author wrote the question; the viewer sees your answer inside the app.

Rules:
- Answer from the data provided only. Never invent, extrapolate or round beyond what is shown. If the data cannot answer the question, say so in one sentence.
- Name the period and scope (region, product, segment, etc.) of every figure you cite.
- Describe what the data shows. Do not claim causes; you may note what a figure coincides with in the same data.
- Each source section starts with "## <label>", a "Query: <uuid>" line and a "Fields:" legend mapping field ids to labels. Use labels, not field ids, in your answer.
- When a "Focus row" is given, the question is about that row; use the rest of the data only as comparison.
- Sections marked truncated show only part of the rows; do not claim totals for them.
- Reply with the answer only, as short plain prose: no headings, no preamble, no description of your process. Bullet points only when listing several figures.`;

export async function answerDataAppPrompt(
    modelOptions: GeneratorModelOptions,
    {
        content,
        prompt,
        focus,
    }: {
        content: string;
        prompt: string;
        focus: Record<string, string> | null;
    },
): Promise<string> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'answerDataAppPrompt',
        'data-app-analysis',
    );
    const focusLine = focus
        ? `Focus row: ${Object.entries(focus)
              .map(([fieldId, value]) => `${fieldId} = ${value}`)
              .join(', ')}`
        : null;
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        experimental_telemetry: telemetry,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    `Question:\n${prompt}`,
                    focusLine,
                    `Data:\n${content}`,
                ]
                    .filter((part): part is string => part !== null)
                    .join('\n\n'),
            },
        ],
    });
    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
    return result.text.trim();
}
