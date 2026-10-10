import {
    aiDeepResearchWorkerFindingsInputSchema,
    getErrorMessage,
    submitWorkerFindingsToolDefinition,
    type AiDeepResearchWorkerFindings,
    type ToolSubmitWorkerFindingsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';

type SubmitWorkerFindingsOptions = {
    onFindings: (findings: AiDeepResearchWorkerFindings) => void;
};

export const getSubmitWorkerFindings = (options: SubmitWorkerFindingsOptions) =>
    tool({
        ...submitWorkerFindingsToolDefinition.for('agent'),
        execute: async (
            input,
        ): Promise<
            | ExecuteStructuredToolResult<ToolSubmitWorkerFindingsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            const parsed =
                aiDeepResearchWorkerFindingsInputSchema.safeParse(input);
            if (!parsed.success) {
                const result = getErrorMessage(parsed.error);
                return {
                    result,
                    metadata: { status: 'error' },
                    structuredContent: { error: result },
                };
            }
            options.onFindings(parsed.data);
            const receipt: ToolSubmitWorkerFindingsStructuredContent = {
                submitted: true,
            };
            return {
                result: JSON.stringify(receipt),
                metadata: { status: 'success' },
                structuredContent: receipt,
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
