import {
    askUserToolDefinition,
    formatAskUserQuestions,
    toolAskUserArgsSchema,
    type ToolAskUserStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

const toolDefinition = askUserToolDefinition.for('agent');

export const ASK_USER_TOOL_NAME = toolDefinition.name;

/** The asked questions as the turn's reply; null when no askUser call is valid. */
export const getAskUserResponse = (
    toolCalls: ReadonlyArray<{ toolName: string; input: unknown }>,
): string | null => {
    const call = toolCalls.findLast(
        ({ toolName }) => toolName === ASK_USER_TOOL_NAME,
    );
    const parsed = toolAskUserArgsSchema.safeParse(call?.input);
    return parsed.success ? formatAskUserQuestions(parsed.data) : null;
};

// The UI renders the questions from the call; the turn ends after this step.
export const getAskUser = () =>
    tool({
        ...toolDefinition,
        execute: async ({
            questions,
        }): Promise<
            ExecuteStructuredToolResult<ToolAskUserStructuredContent>
        > => ({
            result: 'The user sees your questions. Their answers arrive as the next user message.',
            metadata: { status: 'success' },
            structuredContent: { questionCount: questions.length },
        }),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
