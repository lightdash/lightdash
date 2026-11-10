import { aiToolErrorCodeSchema, type AiToolErrorCode } from '@lightdash/common';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import {
    opaqueIdField,
    uuidField,
    versionField,
    type IsMetadataOnly,
} from './metadataOnly';
import type {
    AiAgentToolCallCompletedProperties,
    ToolCallEventContext,
} from './toolCallEvent';

/** A code seen this many times in a thread counts as a repeated mistake. */
const REPEATED_ERROR_THRESHOLD = 3;

export const aiAgentPromptOutcomePropertiesSchema = z
    .object({
        organizationId: uuidField,
        projectId: uuidField,
        aiAgentId: uuidField,
        threadId: uuidField,
        promptId: uuidField,
        model: opaqueIdField,
        serverVersion: versionField,
        toolCalls: z.number().int().nonnegative(),
        failedToolCalls: z.number().int().nonnegative(),
        errorCodes: z.array(aiToolErrorCodeSchema),
        // Null when nothing failed.
        recovered: z.boolean().nullable(),
        gaveUp: z.boolean(),
        repeatedErrorCode: aiToolErrorCodeSchema.nullable(),
        repeatedErrorCount: z.number().int().nonnegative(),
        detourCalls: z.number().int().nonnegative(),
        zeroRowQueries: z.number().int().nonnegative(),
    })
    .strict();

export type AiAgentPromptOutcomeProperties = z.output<
    typeof aiAgentPromptOutcomePropertiesSchema
>;

export const promptOutcomePayloadIsMetadataOnly: IsMetadataOnly<AiAgentPromptOutcomeProperties> = true;

export type PromptToolCall = Pick<
    AiAgentToolCallCompletedProperties,
    'outcome' | 'errorCode' | 'rowCount' | 'detour'
> & { toolName: string };

export type PromptOutcome = Omit<
    AiAgentPromptOutcomeProperties,
    keyof ToolCallEventContext
>;

const mostRepeatedCode = (
    codes: readonly AiToolErrorCode[],
): { code: AiToolErrorCode | null; count: number } => {
    const counts = new Map<AiToolErrorCode, number>();
    codes.forEach((code) => counts.set(code, (counts.get(code) ?? 0) + 1));
    const [top] = [...counts.entries()].sort(
        ([codeA, countA], [codeB, countB]) =>
            countB - countA || codeA.localeCompare(codeB),
    );
    return top && top[1] >= REPEATED_ERROR_THRESHOLD
        ? { code: top[0], count: top[1] }
        : { code: null, count: 0 };
};

/** Reduces a prompt's ordered tool calls to how the turn went; prior thread codes make repeats thread-wide. */
export const summarizePromptOutcome = (
    calls: readonly PromptToolCall[],
    priorThreadErrorCodes: readonly AiToolErrorCode[],
): PromptOutcome => {
    const failedIndexes = calls.flatMap((call, index) =>
        call.outcome === 'error' ? [index] : [],
    );
    const promptErrorCodes = calls.flatMap((call) =>
        call.errorCode === null ? [] : [call.errorCode],
    );
    const repeated = mostRepeatedCode([
        ...priorThreadErrorCodes,
        ...promptErrorCodes,
    ]);
    const lastCall = calls.at(-1);
    return {
        toolCalls: calls.length,
        failedToolCalls: failedIndexes.length,
        errorCodes: [...new Set(promptErrorCodes)].sort(),
        recovered:
            failedIndexes.length === 0
                ? null
                : failedIndexes.every((failedIndex) =>
                      calls
                          .slice(failedIndex + 1)
                          .some(
                              (later) =>
                                  later.toolName ===
                                      calls[failedIndex].toolName &&
                                  later.outcome !== 'error',
                          ),
                  ),
        gaveUp: lastCall?.outcome === 'error',
        repeatedErrorCode: repeated.code,
        repeatedErrorCount: repeated.count,
        detourCalls: calls.filter((call) => call.detour).length,
        zeroRowQueries: calls.filter((call) => call.rowCount === 0).length,
    };
};

export const buildPromptOutcomeProperties = (
    context: ToolCallEventContext,
    outcome: PromptOutcome,
): AiAgentPromptOutcomeProperties | null => {
    const parsed = aiAgentPromptOutcomePropertiesSchema.safeParse({
        ...context,
        ...outcome,
    } satisfies Record<keyof AiAgentPromptOutcomeProperties, unknown>);
    if (parsed.success) return parsed.data;
    Logger.warn(
        `[AiAgent] Dropped prompt outcome event; invalid fields: ${parsed.error.issues
            .map((issue) => issue.path.join('.'))
            .join(', ')}`,
    );
    return null;
};
