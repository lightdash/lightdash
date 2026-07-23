import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    aiDeepResearchReportSchema,
    type AiDeepResearchSubmittedReport,
} from '@lightdash/common';

export { AI_DEEP_RESEARCH_REPORT_TOOL_NAME };

export const parseAiDeepResearchReport = (
    input: unknown,
): AiDeepResearchSubmittedReport => aiDeepResearchReportSchema.parse(input);
