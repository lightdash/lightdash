import { generateObject } from 'ai';
import { z } from 'zod';
import { GeneratorModelOptions } from '../models/types';

const SUMMARY_MAX_LENGTH_CHARS = 500;

const SummarySchema = z.object({
    summary: z
        .string()
        .min(1, 'Summary must not be empty')
        .max(
            SUMMARY_MAX_LENGTH_CHARS,
            `Summary must be ${SUMMARY_MAX_LENGTH_CHARS} characters or less`,
        )
        .describe(
            'A short summary describing what the document contains and the kinds of questions it would help answer.',
        ),
});

export async function generateDocumentSummary(
    modelOptions: GeneratorModelOptions,
    args: { name: string; content: string },
): Promise<string> {
    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: SummarySchema,
        messages: [
            {
                role: 'system',
                content: `You write concise summaries of reference documents that an AI data assistant can use to decide whether to read the full document.

Write a single short paragraph (at most ${SUMMARY_MAX_LENGTH_CHARS} characters) describing what the document is about and what topics or questions it would help answer. Do not invent details that are not in the document. Do not quote large passages.`,
            },
            {
                role: 'user',
                content: `Document name: ${args.name}\n\nDocument content:\n\n${args.content}`,
            },
        ],
    });

    return result.object.summary;
}
