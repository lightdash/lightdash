import {
    aiDeepResearchWorkerFindingsInputSchema,
    getErrorMessage,
    submitWorkerFindingsToolDefinition,
    type AiDeepResearchWorkerFindings,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';

type SubmitWorkerFindingsOptions = {
    onFindings: (findings: AiDeepResearchWorkerFindings) => void;
};

export const getSubmitWorkerFindings = (options: SubmitWorkerFindingsOptions) =>
    tool({
        ...submitWorkerFindingsToolDefinition.for('agent'),
        execute: async (input) => {
            const parsed =
                aiDeepResearchWorkerFindingsInputSchema.safeParse(input);
            if (!parsed.success) {
                return {
                    result: getErrorMessage(parsed.error),
                    metadata: { status: 'error' as const },
                };
            }
            options.onFindings(parsed.data);
            return {
                result: JSON.stringify({ submitted: true }),
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
