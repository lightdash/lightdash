import {
    searchApiToolDefinition,
    type ToolSearchApiStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ApiOperationCatalog } from '../generativeUi/apiOperationCatalog';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';

type Dependencies = {
    catalog: ApiOperationCatalog;
};

const toolDefinition = searchApiToolDefinition.for('agent');

const renderOperations = (
    operations: ToolSearchApiStructuredContent['operations'],
): string =>
    operations.length === 0
        ? 'No matching operations. Try other words, or a different kind.'
        : operations
              .map(
                  ({ operationId, method, pathTemplate, kind, summary }) =>
                      `- ${operationId} (${kind}): ${method} ${pathTemplate}${
                          summary === null ? '' : ` — ${summary}`
                      }`,
              )
              .join('\n');

export const getSearchApi = ({ catalog }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            query,
            kind,
        }): Promise<
            ExecuteStructuredToolResult<ToolSearchApiStructuredContent>
        > => {
            const structuredContent = {
                operations: catalog
                    .search(query, kind)
                    .map(
                        ({
                            operationId,
                            method,
                            pathTemplate,
                            kind: operationKind,
                            summary,
                        }) => ({
                            operationId,
                            method,
                            pathTemplate,
                            kind: operationKind,
                            summary,
                        }),
                    ),
            };
            return {
                result: renderOperations(structuredContent.operations),
                metadata: { status: 'success' },
                structuredContent,
            };
        },
    });
