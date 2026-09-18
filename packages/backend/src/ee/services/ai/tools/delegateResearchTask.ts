import {
    aiDeepResearchWorkerTaskInputSchema,
    delegateResearchTaskToolDefinition,
    getErrorMessage,
    type AiDeepResearchWorkerResult,
    type AiDeepResearchWorkerTaskInput,
    type ToolDelegateResearchTaskStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

type DelegateResearchTaskOptions = {
    /** Runs one worker; owns the delegation cap and reports refusals as failures. */
    runTask: (
        input: AiDeepResearchWorkerTaskInput,
    ) => Promise<AiDeepResearchWorkerResult>;
};

const errorOutput = (result: string): ExecuteToolErrorResult => ({
    result,
    metadata: { status: 'error' },
    structuredContent: { error: result },
});

export const getDelegateResearchTask = (options: DelegateResearchTaskOptions) =>
    tool({
        ...delegateResearchTaskToolDefinition.for('agent'),
        execute: async (
            input,
        ): Promise<
            | ExecuteStructuredToolResult<ToolDelegateResearchTaskStructuredContent>
            | ExecuteToolErrorResult
        > => {
            const parsed = aiDeepResearchWorkerTaskInputSchema.safeParse(input);
            if (!parsed.success) {
                return errorOutput(getErrorMessage(parsed.error));
            }

            const outcome = await options.runTask(parsed.data);
            if (!outcome.findings) {
                return errorOutput(
                    outcome.failureReason ??
                        'The delegated task did not return findings',
                );
            }
            const packet: ToolDelegateResearchTaskStructuredContent = {
                taskId: outcome.task.id,
                ...outcome.findings,
            };
            return {
                result: JSON.stringify(packet),
                metadata: { status: 'success' },
                structuredContent: packet,
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
