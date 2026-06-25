import {
    Explore,
    type AiAgentDocumentStructuredSummary,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import { GeneratorModelOptions } from '../models/types';
import { renderAvailableExplores } from '../prompts/availableExplores';

const DEFINED_TERMS_LIMIT = 30;
const RELATED_EXPLORE_NAMES_LIMIT = 20;

const DocumentSummarySchema = z.object({
    description: z
        .string()
        .min(1)
        .max(600)
        .describe(
            "A short paragraph (max 600 characters) describing what the document is about and the kinds of questions it would help answer. Use the project's own vocabulary (explore names, field labels) where appropriate.",
        ),
    definedTerms: z
        .array(z.string().min(1).max(60))
        .describe(
            `Up to ${DEFINED_TERMS_LIMIT} short, lowercased terms or concepts that this document defines or constrains (e.g. "revenue", "active user", "refund"). Keep only the most important terms if the document defines more. Empty array if the document defines no specific terms.`,
        )
        .transform((terms) => terms.slice(0, DEFINED_TERMS_LIMIT)),
    relatedExploreNames: z
        .array(z.string().min(1))
        .describe(
            `Up to ${RELATED_EXPLORE_NAMES_LIMIT} names of explores (from the provided project context) that this document is most relevant to. Use exact names from the project context. Empty array if no explore is clearly relevant or if no project context was provided.`,
        )
        .transform((names) => names.slice(0, RELATED_EXPLORE_NAMES_LIMIT)),
    useWhen: z
        .string()
        .min(1)
        .max(400)
        .describe(
            'A short instruction in the form "Use when the user asks about X, Y, Z" guiding when the agent should consult this document.',
        ),
    relevance: z
        .enum(['high', 'medium', 'low', 'none'])
        .describe(
            'How relevant this document is to the project\'s data and explores. "high" = directly defines terms used in the explores. "medium" = useful adjacent context. "low" = tangentially related. "none" = unrelated to the project (e.g. a personal note, off-topic content, generic marketing copy).',
        ),
    warning: z
        .string()
        .nullable()
        .describe(
            'If relevance is "low" or "none", a brief human-readable warning the agent should heed (e.g. "This document does not appear to relate to the project\'s data — do not use it to answer data questions."). Null when relevance is "high" or "medium".',
        ),
});

export const createFallbackDocumentSummary = (
    name: string,
): AiAgentDocumentStructuredSummary => ({
    description: `Reference document "${name}". An automatic summary could not be generated.`,
    definedTerms: [],
    relatedExploreNames: [],
    useWhen: `Use when the user asks about topics covered in "${name}".`,
    relevance: 'medium',
    warning: null,
});

const PROJECT_CONTEXT_EXPLORE_LIMIT = 30;

const renderProjectContext = (explores: Explore[]): string => {
    if (explores.length === 0) {
        return "No project context was provided. Assess relevance against the document's self-described purpose only.";
    }
    return renderAvailableExplores(
        explores.slice(0, PROJECT_CONTEXT_EXPLORE_LIMIT),
    ).toString();
};

export async function generateDocumentSummary(
    modelOptions: GeneratorModelOptions,
    args: {
        name: string;
        content: string;
        projectExplores: Explore[];
    },
): Promise<AiAgentDocumentStructuredSummary> {
    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: DocumentSummarySchema,
        messages: [
            {
                role: 'system',
                content: `You produce structured summaries of reference documents that an AI data analyst can consult while answering questions on a Lightdash project.

The summary you produce is what the analyst sees in its system prompt for every conversation, so it must be:
- **Specific to the project's vocabulary.** When you mention a metric, entity, or concept, prefer the exact explore name / field label from the project context below.
- **Honest about relevance.** If the document does not relate to the project's data — for example a personal note, generic marketing copy, an off-topic essay, or something a user uploaded by mistake — say so via the \`relevance\` field and add a \`warning\`. Never invent a connection just to make the summary "useful".
- **Concise and high-signal.** The analyst reads many of these; bullet-list-style precision beats prose.

Available explores in this project (use these names verbatim in \`relatedExploreNames\`):

${renderProjectContext(args.projectExplores)}

Output the structured fields per the schema. Pay attention to the \`relevance\` field: rate based on whether the document defines or constrains terms/metrics/entities that appear in the project's explores or their AI hints.`,
            },
            {
                role: 'user',
                content: `Document name: ${args.name}\n\nDocument content:\n\n${args.content}`,
            },
        ],
    });

    return result.object;
}
