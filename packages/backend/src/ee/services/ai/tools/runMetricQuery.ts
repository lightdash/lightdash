import {
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    filterAggregationCustomMetrics,
    getItemLabelWithoutTableName,
    getTotalFilterRules,
    metricQueryTableViz,
    runMetricQueryToolDefinition,
    toolRunMetricQueryArgsSchema,
    toolRunMetricQueryArgsSchemaTransformed,
    ToolRunMetricQueryArgsTransformed,
    toolRunMetricQueryOutputSchema,
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
import { toolErrorOutput } from '../utils/toolErrorHandler';
import {
    validateCustomMetricsDefinition,
    validateFieldEntityType,
    validateFilterRules,
    validateMetricDimensionFilterPlacement,
    validateSelectedFieldsExistence,
    validateSortFieldsAreSelected,
} from '../utils/validators';

const toolDefinition = runMetricQueryToolDefinition.for('agent');

type Dependencies = {
    runAsyncQuery: RunAsyncQueryFn;
    maxLimit: number;
};

export const getRunMetricQuery = ({
    runAsyncQuery,
    maxLimit,
}: Dependencies) => {
    const validateVizTool = (
        vizTool: ToolRunMetricQueryArgsTransformed,
        explore: Explore,
    ) => {
        const filterRules = getTotalFilterRules(vizTool.filters);
        const aggregations = filterAggregationCustomMetrics(
            vizTool.customMetrics,
        );
        validateFieldEntityType(
            explore,
            vizTool.vizConfig.dimensions,
            'dimension',
        );
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
    };

    return tool({
        ...toolDefinition,
        execute: async (
            toolArgs,
            { experimental_context: context, abortSignal },
        ) => {
            try {
                abortSignal?.throwIfAborted();
                const ctx = AgentContext.from(context);
                const vizTool =
                    toolRunMetricQueryArgsSchemaTransformed.parse(toolArgs);

                const explore = ctx.getExplore(vizTool.vizConfig.exploreName);

                validateVizTool(vizTool, explore);

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
                    undefined,
                    abortSignal,
                );

                if (results.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: {
                            status: 'success',
                        },
                        structuredContent: {
                            columns: [],
                            rows: [],
                            rowCount: 0,
                        },
                    };
                }

                const fieldIds = results.rows[0]
                    ? Object.keys(results.rows[0])
                    : [];

                const columns = fieldIds.map((fieldId) => {
                    const item = results.fields[fieldId];
                    return {
                        fieldId,
                        label: item
                            ? getItemLabelWithoutTableName(item)
                            : fieldId,
                    };
                });

                const csvRows = results.rows.map((row) =>
                    CsvService.convertRowToCsv(
                        row,
                        results.fields,
                        true,
                        fieldIds,
                    ),
                );

                const csv = stringify(csvRows, {
                    header: true,
                    columns: columns.map((column) => column.label),
                });

                const rows = csvRows.map((values) =>
                    Object.fromEntries(
                        fieldIds.map((fieldId, index) => [
                            fieldId,
                            values[index],
                        ]),
                    ),
                );

                return {
                    result: serializeData(csv, 'csv'),
                    metadata: {
                        status: 'success',
                    },
                    structuredContent: {
                        columns,
                        rows,
                        rowCount: rows.length,
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error running metric query.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
