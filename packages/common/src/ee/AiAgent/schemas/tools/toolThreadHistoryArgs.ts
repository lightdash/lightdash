import { z } from 'zod';
import {
    type AiAgentRootCause,
    type AiAgentTurnSignal,
} from '../../aiAgentReviewClassifierTypes';
import { AI_USER_THREAD_CREATED_FROM } from '../../requestTypes';
import { type AiAgentThreadHistoryFilters } from '../../threadHistoryTypes';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const TURN_SIGNALS = [
    'normal_refinement',
    'implicit_correction',
    'explicit_dispute',
    'retry_after_failure',
    'output_shape_correction',
    'new_question',
    'acceptance_or_continuation',
    'product_capability_request',
    'human_intervention',
    'standing_instruction',
    'ambiguous',
] as const satisfies readonly AiAgentTurnSignal[];

// `product_capability` is left out: it is never surfaced.
const ROOT_CAUSES = [
    'semantic_layer',
    'project_context',
    'agent_configuration',
    'runtime_reliability',
    'feedback_quality',
    'not_a_failure',
    'ambiguous',
] as const satisfies readonly AiAgentRootCause[];

const SCOPE_DESCRIPTION =
    '`mine`: your own conversations in the project. `all`: every conversation in the projects where you administer AI agents; it is refused without that role.';

const threadFilterFields = {
    scope: z.enum(['mine', 'all']).describe(SCOPE_DESCRIPTION),
    agentUuid: z
        .string()
        .uuid()
        .nullable()
        .describe('Only conversations with this agent; null for all agents.'),
    userUuid: z
        .string()
        .uuid()
        .nullable()
        .describe(
            'Only conversations started by this user. `all` scope only; null otherwise.',
        ),
    createdFrom: z
        .enum(AI_USER_THREAD_CREATED_FROM)
        .nullable()
        .describe('Only conversations started from this surface.'),
    dateFrom: z
        .string()
        .nullable()
        .describe(
            'Only conversations started on or after this ISO date, e.g. 2026-01-31.',
        ),
    dateTo: z
        .string()
        .nullable()
        .describe('Only conversations started on or before this ISO date.'),
    hasError: z
        .boolean()
        .nullable()
        .describe(
            'true: only conversations where a turn failed with an error. false: only conversations without one.',
        ),
    feedback: z
        .enum(['thumbs_down', 'thumbs_up'])
        .nullable()
        .describe('Only conversations where a turn got this rating.'),
    signal: z
        .enum(TURN_SIGNALS)
        .nullable()
        .describe(
            'Only conversations with a turn the review classifier gave this signal. `all` scope and organization AI admins only.',
        ),
    rootCause: z
        .enum(ROOT_CAUSES)
        .nullable()
        .describe(
            'Only conversations with a turn the review classifier gave this root cause, e.g. semantic_layer. `all` scope and organization AI admins only.',
        ),
    cursor: z
        .string()
        .nullable()
        .describe(
            '`nextCursor` of the previous page; null for the first page.',
        ),
};

const threadFilterArgsSchema = z.object(threadFilterFields);

/**
 * The service filters for a tool call. The project comes from the runtime,
 * never from these arguments.
 */
export const getThreadHistoryToolFilters = (
    args: Omit<z.infer<typeof threadFilterArgsSchema>, 'scope' | 'cursor'>,
): Omit<AiAgentThreadHistoryFilters, 'projectUuid'> => ({
    agentUuid: args.agentUuid ?? undefined,
    userUuid: args.userUuid ?? undefined,
    createdFrom: args.createdFrom ?? undefined,
    dateFrom: args.dateFrom ?? undefined,
    dateTo: args.dateTo ?? undefined,
    hasError: args.hasError ?? undefined,
    humanScore:
        args.feedback === null
            ? undefined
            : { thumbs_down: -1, thumbs_up: 1 }[args.feedback],
    signal: args.signal ?? undefined,
    rootCause: args.rootCause ?? undefined,
});

export const TOOL_LIST_THREADS_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

List past agent conversations, newest first, with counts of turns, errors and ratings for each.

Use the filters to find conversations that went wrong: \`hasError\`, \`feedback\`, and for organization AI admins the review classifier's \`signal\` and \`rootCause\`. A \`classification\` of \`not_classified\` means the classifier has not judged the conversation, not that it went well; null means you cannot read classifier results.
`;

export const toolListThreadsArgsSchema = createToolSchema()
    .extend({
        ...threadFilterFields,
        limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .nullable()
            .describe('Conversations per page; null for 25.'),
    })
    .build();

export const TOOL_SEARCH_THREADS_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Full-text search over what was asked and answered in past agent conversations: prompts, responses, feedback comments, error messages and titles. Best match first, with snippets of the matching turns.

Every word must match unless joined with \`or\`; quote a phrase to match it exactly; prefix a word with \`-\` to exclude it. Words match by stem, so "orders" finds "order". When a query matches more than 1,000 turns, only the newest 1,000 are ranked, so narrow a broad query with the filters.
`;

export const toolSearchThreadsArgsSchema = createToolSchema()
    .extend({
        query: z
            .string()
            .min(1)
            .max(500)
            .describe('Words or quoted phrases to find.'),
        ...threadFilterFields,
        limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .nullable()
            .describe('Conversations per page; null for 10.'),
    })
    .build();

export const TOOL_GET_THREAD_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Read the transcript of one past agent conversation, a page of turns at a time. Each turn has the prompt, the response, any error, and the user's rating and comment.

Long messages are cut and \`truncated\` is set on the turn. When \`nextTurnOffset\` is not null, call again with it as \`turnOffset\` to read on. Tool call results never include query rows or field values.
`;

export const toolGetThreadArgsSchema = createToolSchema()
    .extend({
        threadUuid: z
            .string()
            .uuid()
            .describe('`threadUuid` of the conversation to read.'),
        turnOffset: z
            .number()
            .int()
            .min(0)
            .nullable()
            .describe(
                'Zero-based turn to start from; null for the first turn.',
            ),
        turnLimit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .nullable()
            .describe('Turns to return; null for 10.'),
        includeToolCalls: z
            .boolean()
            .nullable()
            .describe(
                'true to include the tools the agent called in each turn, with their arguments and sanitized results.',
            ),
    })
    .build();

const turnClassificationSchema = z.object({
    promptUuid: z.string(),
    signal: z.string().describe('What the turn was, e.g. explicit_dispute.'),
    rootCause: z
        .string()
        .nullable()
        .describe('Why it went wrong, e.g. semantic_layer; null when none.'),
    confidence: z.string().describe('low, medium or high.'),
});

const classificationSchema = z
    .discriminatedUnion('status', [
        z.object({ status: z.literal('not_classified') }),
        z.object({
            status: z.literal('classified'),
            turns: z.array(turnClassificationSchema),
        }),
    ])
    .nullable()
    .describe(
        'Review classifier result. `not_classified`: not judged yet. null: you cannot read classifier results.',
    );

const threadSummaryShape = {
    threadUuid: z.string(),
    projectUuid: z.string(),
    agentUuid: z.string(),
    agentName: z.string(),
    title: z.string().nullable(),
    createdAt: z.string().describe('ISO timestamp.'),
    createdFrom: z.string(),
    user: z.object({ uuid: z.string(), name: z.string() }).nullable(),
    firstPrompt: z
        .string()
        .nullable()
        .describe('Start of the first prompt of the conversation.'),
    turnCount: z.number().int(),
    errorCount: z.number().int(),
    upvoteCount: z.number().int(),
    downvoteCount: z.number().int(),
    classification: classificationSchema,
};

const nextCursorSchema = z
    .string()
    .nullable()
    .describe('Pass as `cursor` for the next page; null on the last page.');

export const toolListThreadsStructuredContentSchema = z.object({
    threads: z.array(z.object(threadSummaryShape)),
    nextCursor: nextCursorSchema,
});

export const toolSearchThreadsStructuredContentSchema = z.object({
    threads: z.array(
        z.object({
            ...threadSummaryShape,
            rank: z.number(),
            matchedTurnCount: z.number().int(),
            matches: z
                .array(
                    z.object({
                        promptUuid: z
                            .string()
                            .nullable()
                            .describe('null when the title matched.'),
                        createdAt: z.string().nullable(),
                        matchedIn: z.array(
                            z.enum([
                                'title',
                                'prompt',
                                'response',
                                'feedback',
                                'error',
                            ]),
                        ),
                        snippet: z
                            .string()
                            .describe('Matched words are wrapped in `**`.'),
                    }),
                )
                .describe('Best matching turns first.'),
        }),
    ),
    nextCursor: nextCursorSchema,
});

export const toolGetThreadStructuredContentSchema = z.object({
    thread: z.object(threadSummaryShape),
    turns: z.array(
        z.object({
            index: z.number().int().describe('Zero-based turn position.'),
            promptUuid: z.string(),
            createdAt: z.string(),
            prompt: z.string(),
            response: z.string().nullable(),
            errorMessage: z.string().nullable(),
            humanScore: z
                .number()
                .int()
                .nullable()
                .describe('-1 thumbs down, 1 thumbs up, null not rated.'),
            humanFeedback: z.string().nullable(),
            truncated: z.boolean(),
            classification: classificationSchema,
            toolCalls: z
                .array(
                    z.object({
                        toolCallId: z.string(),
                        name: z.string(),
                        args: z.string(),
                        result: z.string().nullable(),
                        resultOmitted: z.string().nullable(),
                        isError: z.boolean(),
                    }),
                )
                .optional(),
        }),
    ),
    nextTurnOffset: z
        .number()
        .int()
        .nullable()
        .describe('Pass as `turnOffset` to read on; null after the last turn.'),
});

export const toolListThreadsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListThreadsStructuredContentSchema,
});

export const toolSearchThreadsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolSearchThreadsStructuredContentSchema,
});

export const toolGetThreadOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGetThreadStructuredContentSchema,
});

export type ToolListThreadsOutput = z.infer<typeof toolListThreadsOutputSchema>;
export type ToolSearchThreadsOutput = z.infer<
    typeof toolSearchThreadsOutputSchema
>;
export type ToolGetThreadOutput = z.infer<typeof toolGetThreadOutputSchema>;
export type ToolListThreadsArgs = z.infer<typeof toolListThreadsArgsSchema>;
export type ToolSearchThreadsArgs = z.infer<typeof toolSearchThreadsArgsSchema>;
export type ToolGetThreadArgs = z.infer<typeof toolGetThreadArgsSchema>;
