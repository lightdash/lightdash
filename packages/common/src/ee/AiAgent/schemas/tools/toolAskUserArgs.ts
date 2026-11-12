import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_ASK_USER_DESCRIPTION =
    'Ask the user a question with clickable options. Every question you ask the user that has 2-4 likely answers goes through this tool, including the ones your instructions tell you to ask (which explore, which definition, which time period). Calling it ends your turn: put each question here, and continue from the answers, which arrive as the next user message. List only real choices; the user can always type their own answer.';

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
