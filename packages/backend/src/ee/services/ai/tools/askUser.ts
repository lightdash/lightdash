import {
    askUserToolDefinition,
    formatAskUserQuestions,
    isSlackPrompt,
    parseAskUserCall,
    type AiPrompt,
    type ToolAskUserStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { AiAgentExecutionConfig } from '../types/aiAgent';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

type Step = {
    toolCalls: ReadonlyArray<{
        toolCallId: string;
        toolName: string;
        input: unknown;
    }>;
    toolResults: ReadonlyArray<{ toolCallId: string }>;
};

/**
 * Only the web app thread view renders the questions; Slack, Battle panes and
 * unattended runs would show the text without options.
 */
export const canOfferAskUser = (
    prompt: AiPrompt,
    executionMode: AiAgentExecutionConfig['mode'],
): boolean =>
    prompt.threadCreatedFrom === 'web_app' &&
    !isSlackPrompt(prompt) &&
    prompt.battleProfile === null &&
    executionMode === 'standard';

/**
 * The text of the turn's last executed askUser call, or null. A call the SDK
 * rejected (tool not offered, bad args) has no result and asks nothing.
 */
export const getAskUserResponse = (
    steps: ReadonlyArray<Step>,
): string | null => {
    const executed = new Set(
        steps.flatMap((step) => step.toolResults.map((r) => r.toolCallId)),
    );
    const args = steps
        .flatMap((step) => step.toolCalls)
        .filter(({ toolCallId }) => executed.has(toolCallId))
        .map(({ toolName, input }) => parseAskUserCall(toolName, input))
        .findLast((parsed) => parsed !== null);
    return args ? formatAskUserQuestions(args) : null;
};

/** Keeps the asked questions in the reply, after any text the model wrote. */
export const withAskUserQuestions = (
    reply: string,
    steps: ReadonlyArray<Step>,
): string => {
    const questions = getAskUserResponse(steps);
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
