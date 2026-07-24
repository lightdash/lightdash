import {
    aiDeepResearchReportSchema,
    getErrorMessage,
    submitResearchReportToolDefinition,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';

export const getSubmitResearchReport = () =>
    tool({
        ...submitResearchReportToolDefinition.for('agent'),
        execute: async (input) => {
            const report = aiDeepResearchReportSchema.safeParse(input);
            return report.success
                ? {
                      result: JSON.stringify({ submitted: true }),
                      metadata: { status: 'success' as const },
                  }
                : {
                      result: getErrorMessage(report.error),
                      metadata: { status: 'error' as const },
                  };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
