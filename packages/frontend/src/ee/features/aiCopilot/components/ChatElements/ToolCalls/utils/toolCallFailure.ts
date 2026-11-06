import {
    isComposerQueryToolName,
    type AiAgentToolResult,
} from '@lightdash/common';
import { stripMarkdown } from './stripMarkdown';
import { type ToolCallSummary } from './types';

const MAX_ERROR_MESSAGE_LENGTH = 280;
const RETRY_HINT = /\s*Try again if you believe the error can be resolved\.?/i;
// runSql reports approval rejections and timeouts as error statuses too.
const FAILED_STATUSES: ReadonlySet<unknown> = new Set([
    'error',
    'rejected',
    'timeout',
]);

export type ToolCallFailure = {
    toolCallId: string;
    message: string;
};

const readOutput = (
    output: unknown,
): { status: unknown; result: unknown } | null => {
    if (!output || typeof output !== 'object') return null;
    const { metadata, result } = output as {
        metadata?: unknown;
        result?: unknown;
    };
    const status =
        metadata && typeof metadata === 'object' && 'status' in metadata
            ? (metadata as { status?: unknown }).status
            : undefined;
    return { status, result };
};

/** Prefers the fenced warehouse/tool error over the generic wrapper text; empty when there is none. */
export const formatToolErrorMessage = (result: string): string => {
    const fenced = result.match(/```[^\n]*\n([\s\S]*?)```/);
    const source = fenced?.[1]?.trim() || result.replace(RETRY_HINT, '');
    const clean = stripMarkdown(source);
    return clean.length > MAX_ERROR_MESSAGE_LENGTH
        ? `${clean.slice(0, MAX_ERROR_MESSAGE_LENGTH).trimEnd()}…`
        : clean;
};

export const getToolCallFailure = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): ToolCallFailure | null => {
    const persisted = toolResults?.find(
        (result) => result.toolCallId === call.toolCallId,
    );
    const output = persisted
        ? readOutput(persisted)
        : call.isPreliminary === false
          ? readOutput(call.toolOutput)
          : null;
    if (!output || !FAILED_STATUSES.has(output.status)) return null;
    return {
        toolCallId: call.toolCallId,
        message: formatToolErrorMessage(
            typeof output.result === 'string' ? output.result : '',
        ),
    };
};

export const getToolCallFailures = (
    calls: ToolCallSummary[],
    toolResults?: AiAgentToolResult[],
): ToolCallFailure[] =>
    calls.flatMap((call) => {
        const failure = getToolCallFailure(call, toolResults);
        return failure ? [failure] : [];
    });

/** Failures the step list marks; query failures stay quiet since the agent retries them itself. */
export const getStepListFailures = (
    calls: ToolCallSummary[],
    toolResults?: AiAgentToolResult[],
): ToolCallFailure[] =>
    getToolCallFailures(
        calls.filter((call) => !isComposerQueryToolName(call.toolName)),
        toolResults,
    );

/** A call is settled once its final (non-preliminary) output has landed. */
export const isToolCallSettled = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean =>
    (call.isPreliminary === false && call.toolOutput !== undefined) ||
    (toolResults?.some((result) => result.toolCallId === call.toolCallId) ??
        false);
