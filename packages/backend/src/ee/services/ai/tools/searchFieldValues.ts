import {
    searchFieldValuesFilterExpressionToolDefinition,
    searchFieldValuesToolDefinition,
    toolSearchFieldValuesArgsSchemaTransformed,
    toolSearchFieldValuesExpressionArgsSchema,
    type ToolSearchFieldValuesArgs,
    type ToolSearchFieldValuesExpressionArgs,
} from '@lightdash/common';
import { tool, type Schema } from 'ai';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import { resolveFieldValue } from '../decisions/fieldValues';
import type {
    GetExploreFn,
    SearchFieldValuesFn,
} from '../types/aiAgentDependencies';
import {
    formatFilterExpressionError,
    resolveSearchFieldValuesFilterExpression,
} from '../utils/filterExpressions';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    decisions?: AiDecisionClient;
    searchFieldValues: SearchFieldValuesFn;
    getExplore: GetExploreFn;
    enableFilterExpressions: boolean;
};

type SearchFieldValuesToolInput =
    | ToolSearchFieldValuesArgs
    | ToolSearchFieldValuesExpressionArgs;

export const getSearchFieldValues = ({
    searchFieldValues,
    getExplore,
    enableFilterExpressions,
    decisions,
}: Dependencies) => {
    const toolView = enableFilterExpressions
        ? searchFieldValuesFilterExpressionToolDefinition.for('agent')
        : searchFieldValuesToolDefinition.for('agent');
    const inputSchema: Schema<SearchFieldValuesToolInput> =
        toolView.inputSchema;

    return tool({
        ...toolView,
        inputSchema,
        execute: async (toolArgs) => {
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
                            return {
                                result: formatFilterExpressionError(
                                    resolution.error,
                                ),
                                metadata: { status: 'error' as const },
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
                const values = Array.isArray(results)
                    ? results
                    : results.results;
                const resolved = decisions
                    ? await resolveFieldValue({
                          decisions,
                          fieldId: args.fieldId,
                          requested: args.query,
                          values,
                      })
                    : null;

                return {
                    result:
                        serializeData(results, 'json') +
                        (resolved === null
                            ? ''
                            : `\nMatching value for ${JSON.stringify(args.query)}: ${JSON.stringify(resolved)}. Use the original field and filter operator.`) +
                        (decisions && values.length === 0 && args.query.trim()
                            ? '\nNo matching values were observed. This does not restrict permitted filter literals. Preserve an explicitly requested literal exclusion even when it currently removes no rows; do not drop it or substitute other categories. Clarify unresolved meaning instead of guessing.'
                            : ''),
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error searching field values.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
