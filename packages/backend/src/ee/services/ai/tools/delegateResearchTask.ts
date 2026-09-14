import {
    aiDeepResearchWorkerTaskInputSchema,
    delegateResearchTaskToolDefinition,
    getErrorMessage,
    type AiDeepResearchWorkerResult,
    type AiDeepResearchWorkerTaskInput,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';

type DelegateResearchTaskOptions = {
    /** Runs one worker; owns the delegation cap and reports refusals as failures. */
    runTask: (
        input: AiDeepResearchWorkerTaskInput,
    ) => Promise<AiDeepResearchWorkerResult>;
};

export const getDelegateResearchTask = (options: DelegateResearchTaskOptions) =>
    tool({
        ...delegateResearchTaskToolDefinition.for('agent'),
        execute: async (input) => {
            const parsed = aiDeepResearchWorkerTaskInputSchema.safeParse(input);
            if (!parsed.success) {
                return {
                    result: getErrorMessage(parsed.error),
                    metadata: { status: 'error' as const },
                };
            }

            const outcome = await options.runTask(parsed.data);
            if (!outcome.findings) {
                return {
                    result:
                        outcome.failureReason ??
                        'The delegated task did not return findings',
                    metadata: { status: 'error' as const },
                };
            }
            return {
                result: JSON.stringify({
                    taskId: outcome.task.id,
                    ...outcome.findings,
                }),
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
