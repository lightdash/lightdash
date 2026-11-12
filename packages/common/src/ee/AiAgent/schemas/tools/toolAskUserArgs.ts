import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_ASK_USER_DESCRIPTION =
    'Ask the user to choose when their request has several reasonable readings that lead to different answers and neither the conversation nor your tools settle it (which date field, which revenue definition, which time period). When one reading is clearly most likely, answer with it and state the assumption instead. The user picks an option or types their own answer. Calling this tool ends your turn: write the question here rather than in your reply, and continue from the answers, which arrive as the next user message.';

const askUserOptionSchema = z.object({
    label: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .describe('The choice in 1-5 words.'),
    description: z.string().describe('What choosing this option means.'),
});

const askUserQuestionSchema = z.object({
    header: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .describe('Short topic label shown above the question, e.g. "Period".'),
    question: z.string().trim().min(1),
    options: z
        .array(askUserOptionSchema)
        .min(2)
        .max(4)
        .describe('2-4 distinct choices, the one you recommend first.'),
    multiSelect: z
        .boolean()
        .describe('True when the user may pick several options.'),
});

export const toolAskUserArgsSchema = z.object({
    questions: z
        .array(askUserQuestionSchema)
        .min(1)
        .max(4)
        .describe('1-4 questions, asked together.'),
});

export type ToolAskUserArgs = z.infer<typeof toolAskUserArgsSchema>;
export type AskUserQuestion = ToolAskUserArgs['questions'][number];

export const ASK_USER_TOOL_NAME = 'askUser';

/** The questions of an askUser call; null for other tools or invalid args. */
export const parseAskUserCall = (
    toolName: string,
    input: unknown,
): ToolAskUserArgs | null => {
    if (toolName !== ASK_USER_TOOL_NAME) return null;
    const parsed = toolAskUserArgsSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
};

export const toolAskUserStructuredContentSchema = z.object({
    questionCount: z.number().describe('How many questions the user sees.'),
});

export type ToolAskUserStructuredContent = z.infer<
    typeof toolAskUserStructuredContentSchema
>;

export const toolAskUserOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolAskUserStructuredContentSchema,
});

export type ToolAskUserOutput = z.infer<typeof toolAskUserOutputSchema>;

/** The reply text a turn that only asked questions persists. */
export const formatAskUserQuestions = (args: ToolAskUserArgs): string =>
    args.questions.map(({ question }) => question).join('\n\n');

export type AskUserAnswer = { header: string; answer: string };

/** The user message that answers a set of questions. */
export const formatAskUserAnswers = (answers: AskUserAnswer[]): string =>
    answers.length === 1
        ? answers[0].answer
        : answers
              .map(({ header, answer }) => `${header}: ${answer}`)
              .join('\n');
