import {
    searchFieldValuesFilterExpressionToolDefinition,
    searchFieldValuesToolDefinition,
    toolSearchFieldValuesArgsSchemaTransformed,
    toolSearchFieldValuesExpressionArgsSchema,
    type ToolSearchFieldValuesArgs,
    type ToolSearchFieldValuesExpressionArgs,
    type ToolSearchFieldValuesStructuredContent,
} from '@lightdash/common';
import { tool, type Schema } from 'ai';
import type {
    GetExploreFn,
    SearchFieldValuesFn,
} from '../types/aiAgentDependencies';
import {
    formatFilterExpressionError,
    resolveSearchFieldValuesFilterExpression,
} from '../utils/filterExpressions';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
    getExplore: GetExploreFn;
    enableFilterExpressions: boolean;
};

type SearchFieldValuesToolInput =
    | ToolSearchFieldValuesArgs
    | ToolSearchFieldValuesExpressionArgs;

type SearchFieldValuesExecuteResult =
    | ExecuteStructuredToolResult<ToolSearchFieldValuesStructuredContent>
    | ExecuteToolErrorResult;

// The search returns either bare values or values with a note; the text keeps
// that raw shape while the structured form is normalised.
const toStructuredContent = (
    results: Awaited<ReturnType<SearchFieldValuesFn>>,
): ToolSearchFieldValuesStructuredContent =>
    Array.isArray(results)
        ? { results, note: null }
        : { results: results.results, note: results.note };

export const getSearchFieldValues = ({
    searchFieldValues,
    getExplore,
    enableFilterExpressions,
}: Dependencies) => {
    const toolView = enableFilterExpressions
        ? searchFieldValuesFilterExpressionToolDefinition.for('agent')
        : searchFieldValuesToolDefinition.for('agent');
    const inputSchema: Schema<SearchFieldValuesToolInput> =
        toolView.inputSchema;

    return tool({
        ...toolView,
        inputSchema,
        execute: async (toolArgs): Promise<SearchFieldValuesExecuteResult> => {
            try {
                let args: Parameters<SearchFieldValuesFn>[0];
                if (enableFilterExpressions) {
                    const expressionArgs =
                        toolSearchFieldValuesExpressionArgsSchema.parse(
                            toolArgs,
                        );
                    let filters: Parameters<SearchFieldValuesFn>[0]['filters'];
                    if (expressionArgs.filters === null) {
                        filters = undefined;
                    } else {
                        const explore = await getExplore({
                            table: expressionArgs.table,
                        });
                        const resolution =
                            resolveSearchFieldValuesFilterExpression({
                                expressionInput: expressionArgs.filters,
                                explore,
                            });
                        if (!resolution.success) {
                            const result = formatFilterExpressionError(
                                resolution.error,
                            );
                            return {
                                result,
                                metadata: { status: 'error' },
                                structuredContent: { error: result },
                            };
                        }
                        filters = resolution.data;
                    }
                    args = {
                        ...expressionArgs,
                        query: expressionArgs.query ?? '',
                        filters,
                    };
                } else {
                    args =
                        toolSearchFieldValuesArgsSchemaTransformed.parse(
                            toolArgs,
                        );
                }

                const results = await searchFieldValues(args);

                return {
                    result: serializeData(results, 'json'),
                    metadata: { status: 'success' },
                    structuredContent: toStructuredContent(results),
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error searching field values.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
