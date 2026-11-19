import { type AiAgentToolResult } from '@lightdash/common';
import { type ToolCallSummary } from './types';

// The user declined, or never answered, the SQL approval: not a failure.
const UNAPPROVED_STATUSES: ReadonlySet<unknown> = new Set([
    'rejected',
    'timeout',
]);

const readStatus = (output: unknown): unknown => {
    if (!output || typeof output !== 'object') return undefined;
    const { metadata } = output as { metadata?: unknown };
    return metadata && typeof metadata === 'object' && 'status' in metadata
        ? (metadata as { status?: unknown }).status
        : undefined;
};

const readCallStatus = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): unknown => {
    const persisted = toolResults?.find(
        (result) => result.toolCallId === call.toolCallId,
    );
    if (persisted) return readStatus(persisted);
    return call.isPreliminary === false
        ? readStatus(call.toolOutput)
        : undefined;
};

export const isToolCallFailed = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean => readCallStatus(call, toolResults) === 'error';

export const isToolCallUnapproved = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean => UNAPPROVED_STATUSES.has(readCallStatus(call, toolResults));

/** A call is settled once its final (non-preliminary) output has landed. */
export const isToolCallSettled = (
    call: ToolCallSummary,
    toolResults?: AiAgentToolResult[],
): boolean =>
    (call.isPreliminary === false && call.toolOutput !== undefined) ||
    (toolResults?.some((result) => result.toolCallId === call.toolCallId) ??
        false);
