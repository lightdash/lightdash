import {
    askUserToolDefinition,
    formatAskUserQuestions,
    parseAskUserCall,
    type ToolAskUserStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

type ToolCall = { toolName: string; input: unknown };

/** The text of the turn's last valid askUser call, or null. */
export const getAskUserResponse = (
    toolCalls: ReadonlyArray<ToolCall>,
): string | null => {
    const args = toolCalls
        .map(({ toolName, input }) => parseAskUserCall(toolName, input))
        .findLast((parsed) => parsed !== null);
    return args ? formatAskUserQuestions(args) : null;
};

/** Keeps the asked questions in the reply, after any text the model wrote. */
export const withAskUserQuestions = (
    reply: string,
    toolCalls: ReadonlyArray<ToolCall>,
): string => {
    const questions = getAskUserResponse(toolCalls);
    if (questions === null || reply.includes(questions)) return reply;
    return reply.trim() ? `${reply.trimEnd()}\n\n${questions}` : questions;
};

// The UI renders the questions from the call; the turn ends after this step.
export const getAskUser = () =>
    tool({
        ...askUserToolDefinition.for('agent'),
        execute: async ({
            questions,
        }): Promise<
            ExecuteStructuredToolResult<ToolAskUserStructuredContent>
        > => ({
            result: 'The user sees your questions.',
            metadata: { status: 'success' },
            structuredContent: { questionCount: questions.length },
        }),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
