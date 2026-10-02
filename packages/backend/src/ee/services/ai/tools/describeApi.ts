import {
    describeApiToolDefinition,
    type ToolDescribeApiStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ApiOperationCatalog } from '../generativeUi/apiOperationCatalog';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';

type Dependencies = {
    catalog: ApiOperationCatalog;
};

const toolDefinition = describeApiToolDefinition.for('agent');

export const getDescribeApi = ({ catalog }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            operationId,
        }): Promise<
            | ExecuteStructuredToolResult<ToolDescribeApiStructuredContent>
            | ExecuteToolErrorResult
        > => {
            const description = catalog.describe(operationId);
            if (description === null) {
                const error = `Unknown operation "${operationId}". Find one with searchApi.`;
                return {
                    result: error,
                    metadata: { status: 'error' },
                    structuredContent: { error },
                };
            }
            const { entry, pathParams, autoFilledPathParams, signature } =
                description;
            return {
                result: signature,
                metadata: { status: 'success' },
                structuredContent: {
                    operationId: entry.operationId,
                    method: entry.method,
                    pathTemplate: entry.pathTemplate,
                    kind: entry.kind,
                    summary: entry.summary,
                    pathParams,
                    autoFilledPathParams,
                    signature,
                },
            };
        },
    });
