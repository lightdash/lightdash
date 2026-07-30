import {
    aiDeepResearchReportSchema,
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
                      result: JSON.stringify({
                          submitted: false,
                          errors: report.error.issues.map((issue) => ({
                              field:
                                  issue.path.length > 0
                                      ? issue.path.join('.')
                                      : 'report',
                              message: issue.message,
                          })),
                      }),
                      metadata: { status: 'error' as const },
                  };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
