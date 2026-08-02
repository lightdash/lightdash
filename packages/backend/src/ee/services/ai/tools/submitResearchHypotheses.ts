import {
    aiDeepResearchHypothesesInputSchema,
    getErrorMessage,
    submitResearchHypothesesToolDefinition,
    toAiDeepResearchHypotheses,
    type AiDeepResearchHypothesis,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';

type SubmitResearchHypothesesOptions = {
    maxHypotheses: number;
    onHypotheses: (hypotheses: AiDeepResearchHypothesis[]) => void;
};

export const getSubmitResearchHypotheses = (
    options: SubmitResearchHypothesesOptions,
) =>
    tool({
        ...submitResearchHypothesesToolDefinition.for('agent'),
        execute: async (input) => {
            const parsed = aiDeepResearchHypothesesInputSchema.safeParse(input);
            if (!parsed.success) {
                return {
                    result: getErrorMessage(parsed.error),
                    metadata: { status: 'error' as const },
                };
            }
            if (parsed.data.hypotheses.length !== options.maxHypotheses) {
                return {
                    result: `Submit exactly ${options.maxHypotheses} hypotheses (received ${parsed.data.hypotheses.length}). Call the tool again with the corrected set.`,
                    metadata: { status: 'error' as const },
                };
            }
            options.onHypotheses(toAiDeepResearchHypotheses(parsed.data));
            return {
                result: JSON.stringify({ submitted: true }),
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
