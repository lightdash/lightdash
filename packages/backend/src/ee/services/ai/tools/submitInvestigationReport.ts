import {
    aiDeepResearchInvestigationReportInputSchema,
    getErrorMessage,
    submitInvestigationReportToolDefinition,
    type AiDeepResearchInvestigationReport,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';

type SubmitInvestigationReportOptions = {
    onReport: (report: AiDeepResearchInvestigationReport) => void;
};

export const getSubmitInvestigationReport = (
    options: SubmitInvestigationReportOptions,
) =>
    tool({
        ...submitInvestigationReportToolDefinition.for('agent'),
        execute: async (input) => {
            const parsed =
                aiDeepResearchInvestigationReportInputSchema.safeParse(input);
            if (!parsed.success) {
                return {
                    result: getErrorMessage(parsed.error),
                    metadata: { status: 'error' as const },
                };
            }
            options.onReport(parsed.data);
            return {
                result: JSON.stringify({ submitted: true }),
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
