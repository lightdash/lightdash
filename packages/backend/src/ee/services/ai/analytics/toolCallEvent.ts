import { z } from 'zod';
import Logger from '../../../../logging/logger';
import type { ToolStage } from '../agents/turnTiming';
import { isErrorToolResult } from '../utils/toolSummaries';
import {
    opaqueIdField,
    uuidField,
    versionField,
    type IsMetadataOnly,
} from './metadataOnly';

/** `ai_agent.tool_call_completed`: ids, enums, counts and booleans only; never tool input or output. */
export const aiAgentToolCallCompletedPropertiesSchema = z
    .object({
        organizationId: uuidField,
        projectId: uuidField,
        aiAgentId: uuidField,
        threadId: uuidField,
        promptId: uuidField,
        toolCallId: opaqueIdField,
        toolName: opaqueIdField,
        model: opaqueIdField,
        serverVersion: versionField,
        stepIndex: z.number().int().nonnegative(),
        durationMs: z.number().nonnegative(),
        stage: z.enum(['query', 'api', 'render']),
        queryCacheHit: z.boolean().nullable(),
        queryReuseHit: z.boolean().nullable(),
        status: z.enum(['success', 'error']),
        attempt: z.number().int().positive(),
    })
    .strict();

export type AiAgentToolCallCompletedProperties = z.infer<
    typeof aiAgentToolCallCompletedPropertiesSchema
>;

const metadataOnly: IsMetadataOnly<AiAgentToolCallCompletedProperties> = true;
void metadataOnly;

export type ToolCallEventContext = {
    organizationId: string;
    projectId: string;
    aiAgentId: string;
    threadId: string;
    promptId: string;
    model: string;
    serverVersion: string;
};

export type ToolCallResult =
    | { type: 'tool-result'; output: unknown }
    | { type: 'tool-error'; error: unknown };

export type ToolCallEventInput = {
    toolCallId: string;
    toolName: string;
    result: ToolCallResult;
    stepIndex: number;
    durationMs: number;
    stage: ToolStage;
    queryCacheHit: boolean | null;
    queryReuseHit: boolean | null;
    attempt: number;
};

/** Null when the payload fails the metadata-only schema; the event is dropped rather than leak. */
export const buildToolCallCompletedProperties = (
    context: ToolCallEventContext,
    { result, ...call }: ToolCallEventInput,
): AiAgentToolCallCompletedProperties | null => {
    const parsed = aiAgentToolCallCompletedPropertiesSchema.safeParse({
        ...context,
        ...call,
        status:
            result.type === 'tool-error' || isErrorToolResult(result.output)
                ? 'error'
                : 'success',
    });
    if (parsed.success) return parsed.data;
    Logger.warn(
        `[AiAgent] Dropped tool call event: ${parsed.error.issues
            .map((issue) => issue.path.join('.'))
            .join(', ')}`,
    );
    return null;
};

export const createToolCallEventTracker = (
    context: ToolCallEventContext,
    emit: (properties: AiAgentToolCallCompletedProperties) => void,
) => {
    const attemptsByTool = new Map<string, number>();
    const attemptsByCall = new Map<string, number>();
    const tracked = new Set<string>();
    // Numbered when the call starts, so concurrent calls finishing out of order keep their order
    const assignAttempt = (toolCallId: string, toolName: string): number => {
        const assigned = attemptsByCall.get(toolCallId);
        if (assigned !== undefined) return assigned;
        const attempt = (attemptsByTool.get(toolName) ?? 0) + 1;
        attemptsByTool.set(toolName, attempt);
        attemptsByCall.set(toolCallId, attempt);
        return attempt;
    };
    return {
        start: (toolCallId: string, toolName: string) => {
            assignAttempt(toolCallId, toolName);
        },
        track: (call: Omit<ToolCallEventInput, 'attempt'>) => {
            if (tracked.has(call.toolCallId)) return;
            tracked.add(call.toolCallId);
            const properties = buildToolCallCompletedProperties(context, {
                ...call,
                attempt: assignAttempt(call.toolCallId, call.toolName),
            });
            if (properties !== null) emit(properties);
        },
        isTracked: (toolCallId: string): boolean => tracked.has(toolCallId),
    };
};
