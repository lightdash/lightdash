import {
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    filterAggregationCustomMetrics,
    getItemLabelWithoutTableName,
    getTotalFilterRules,
    metricQueryTableViz,
    ToolDefinitions,
    type ToolRunMetricQueryArgsTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type { RunAsyncQueryFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { populateCustomMetricsSQL } from '../utils/populateCustomMetricsSQL';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    validateCustomMetricsDefinition,
    validateFieldEntityType,
    validateFilterRules,
    validateMetricDimensionFilterPlacement,
    validateSelectedFieldsExistence,
    validateSortFieldsAreSelected,
} from '../utils/validators';

type Dependencies = {
    runAsyncQuery: RunAsyncQueryFn;
    maxLimit: number;
};

const mcpTools = ToolDefinitions.for('mcp');

export function validateRunMetricQueryTool(
    vizTool: ToolRunMetricQueryArgsTransformed,
    explore: Explore,
) {
    const filterRules = getTotalFilterRules(vizTool.filters);
    const aggregations = filterAggregationCustomMetrics(vizTool.customMetrics);
    validateFieldEntityType(explore, vizTool.vizConfig.dimensions, 'dimension');
    validateFieldEntityType(
        explore,
        vizTool.vizConfig.metrics,
        'metric',
        aggregations,
    );
    validateCustomMetricsDefinition(explore, aggregations);
    validateFilterRules(
        explore,
        filterRules,
        aggregations,
        vizTool.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        aggregations,
        vizTool.tableCalculations,
        vizTool.filters,
    );
    validateSelectedFieldsExistence(
        explore,
        vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
        aggregations,
        vizTool.tableCalculations,
    );
    validateSortFieldsAreSelected(
        vizTool.vizConfig.sorts,
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        aggregations,
        vizTool.tableCalculations,
    );
}

export const getRunMetricQuery = ({ runAsyncQuery, maxLimit }: Dependencies) =>
    tool({
        description: mcpTools.runMetricQuery.description,
        inputSchema: mcpTools.runMetricQuery.inputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                const ctx = AgentContext.from(context);
                const vizTool = mcpTools.runMetricQuery.parseInput(toolArgs);

                const explore = ctx.getExplore(vizTool.vizConfig.exploreName);

                validateRunMetricQueryTool(vizTool, explore);

                const query = metricQueryTableViz({
                    vizConfig: vizTool.vizConfig,
                    filters: vizTool.filters,
                    maxLimit,
                    customMetrics: vizTool.customMetrics,
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        vizTool.tableCalculations,
                    ),
                });

                const results = await runAsyncQuery(
                    query,
                    populateCustomMetricsSQL(
                        filterAggregationCustomMetrics(vizTool.customMetrics),
                        explore,
                    ),
                );

                if (results.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                const fieldIds = results.rows[0]
                    ? Object.keys(results.rows[0])
                    : [];

                const csvHeaders = fieldIds.map((fieldId) => {
                    const item = results.fields[fieldId];
                    if (!item) {
                        return fieldId;
                    }
                    return getItemLabelWithoutTableName(item);
                });

                const rows = results.rows.map((row) =>
                    CsvService.convertRowToCsv(
                        row,
                        results.fields,
                        true,
                        fieldIds,
                    ),
                );

                const csv = stringify(rows, {
                    header: true,
                    columns: csvHeaders,
                });

                return {
                    result: serializeData(csv, 'csv'),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error running metric query.'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
