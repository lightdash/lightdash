import { z } from 'zod';
import {
    AI_DEEP_RESEARCH_CONFIDENCE_LEVELS,
    type AiDeepResearchWorkerFindings,
    type AiDeepResearchWorkerTask,
} from './types';

// Upper bounds keep a worker's packet from overflowing the coordinator's
// context; they are far above what a useful packet needs.
const MAX_FIELD_CHARS = 2_000;
const MAX_LIST_ITEMS = 10;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_REFS = 20;

export const aiDeepResearchWorkerTaskInputSchema = z.object({
    question: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('The single narrow question this worker must answer'),
    focus: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe(
            'The data to look at and what to leave out, so the worker stays inside its task',
        ),
});

export type AiDeepResearchWorkerTaskInput = z.infer<
    typeof aiDeepResearchWorkerTaskInputSchema
>;

export const aiDeepResearchWorkerFindingsInputSchema = z.object({
    summary: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('What this task established, in a few sentences'),
    evidence: z
        .array(
            z.object({
                finding: z.string().min(1).max(MAX_FIELD_CHARS),
                queryUuids: z
                    .array(z.string().max(100))
                    .max(MAX_EVIDENCE_REFS)
                    .describe(
                        'queryUuid values from warehouse query results produced during this task',
                    ),
                sources: z
                    .array(z.string().max(500))
                    .max(MAX_EVIDENCE_REFS)
                    .describe(
                        'Non-warehouse references such as documents or URLs',
                    ),
            }),
        )
        .max(MAX_EVIDENCE_ITEMS),
    limitations: z
        .array(z.string().max(MAX_FIELD_CHARS))
        .max(MAX_LIST_ITEMS)
        .describe(
            'What the evidence does not establish, including correlation the coordinator must not read as causation',
        ),
    confidence: z.enum(AI_DEEP_RESEARCH_CONFIDENCE_LEVELS),
}) satisfies z.ZodType<AiDeepResearchWorkerFindings>;

export type AiDeepResearchWorkerFindingsInput = z.infer<
    typeof aiDeepResearchWorkerFindingsInputSchema
>;

/** Stamps a coordinator-delegated task with a stable ordinal id. */
export const toAiDeepResearchWorkerTask = (
    input: AiDeepResearchWorkerTaskInput,
    index: number,
): AiDeepResearchWorkerTask => ({ id: `task-${index + 1}`, ...input });
