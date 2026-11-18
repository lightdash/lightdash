import { type AiAgentToolResult } from '@lightdash/common';
import { stripMarkdown } from './stripMarkdown';
import { type ToolCallSummary } from './types';

const MAX_ERROR_MESSAGE_LENGTH = 280;
const RETRY_HINT = /\s*Try again if you believe the error can be resolved\.?/i;
// The user declined, or never answered, the SQL approval: not a failure.
const UNAPPROVED_STATUSES: ReadonlySet<unknown> = new Set([
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

const readCallOutput = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
) => {
    const persisted = toolResults?.find(
        (result) => result.toolCallId === call.toolCallId,
    );
    if (persisted) return readOutput(persisted);
    return call.isPreliminary === false ? readOutput(call.toolOutput) : null;
};

export const getToolCallFailure = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): ToolCallFailure | null => {
    const output = readCallOutput(call, toolResults);
    if (output?.status !== 'error') return null;
    return {
        toolCallId: call.toolCallId,
        message: formatToolErrorMessage(
            typeof output.result === 'string' ? output.result : '',
        ),
    };
};

export const isToolCallFailedOrUnapproved = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean => {
    const status = readCallOutput(call, toolResults)?.status;
    return status === 'error' || UNAPPROVED_STATUSES.has(status);
};

export const getToolCallFailures = (
    calls: ToolCallSummary[],
    toolResults?: AiAgentToolResult[],
): ToolCallFailure[] =>
    calls.flatMap((call) => {
        const failure = getToolCallFailure(call, toolResults);
        return failure ? [failure] : [];
    });

/** A call is settled once its final (non-preliminary) output has landed. */
export const isToolCallSettled = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean =>
    (call.isPreliminary === false && call.toolOutput !== undefined) ||
    (toolResults?.some((result) => result.toolCallId === call.toolCallId) ??
        false);
