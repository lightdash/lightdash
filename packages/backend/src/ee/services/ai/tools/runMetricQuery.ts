import {
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    getItemLabelWithoutTableName,
    getTotalFilterRules,
    metricQueryTableViz,
    toolRunMetricQueryArgsSchema,
    toolRunMetricQueryArgsSchemaTransformed,
    ToolRunMetricQueryArgsTransformed,
    toolRunMetricQueryOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetExploreFn,
    RunMiniMetricQueryFn,
} from '../types/aiAgentDependencies';
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
    getExplore: GetExploreFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    maxLimit: number;
};

export const getRunMetricQuery = ({
    getExplore,
    runMiniMetricQuery,
    maxLimit,
}: Dependencies) => {
    const validateVizTool = (
        vizTool: ToolRunMetricQueryArgsTransformed,
        explore: Explore,
    ) => {
        const filterRules = getTotalFilterRules(vizTool.filters);
        validateFieldEntityType(
            explore,
            vizTool.vizConfig.dimensions,
            'dimension',
        );
        validateFieldEntityType(explore, vizTool.vizConfig.metrics, 'metric');
        validateCustomMetricsDefinition(explore, vizTool.customMetrics);
        validateFilterRules(
            explore,
            filterRules,
            vizTool.customMetrics,
            vizTool.tableCalculations,
        );
        validateMetricDimensionFilterPlacement(
            explore,
            vizTool.filters,
            vizTool.customMetrics,
        );
        validateSelectedFieldsExistence(
            explore,
            vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
        );
        validateSortFieldsAreSelected(
            vizTool.vizConfig.sorts,
            vizTool.vizConfig.dimensions,
            vizTool.vizConfig.metrics,
            vizTool.customMetrics,
        );
    };

    return tool({
        description: toolRunMetricQueryArgsSchema.description,
        inputSchema: toolRunMetricQueryArgsSchema,
        outputSchema: toolRunMetricQueryOutputSchema,
        execute: async (toolArgs) => {
            try {
                const vizTool =
                    toolRunMetricQueryArgsSchemaTransformed.parse(toolArgs);

                const explore = await getExplore({
                    exploreName: vizTool.vizConfig.exploreName,
                });

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

                const results = await runMiniMetricQuery(
                    query,
                    maxLimit,
                    populateCustomMetricsSQL(vizTool.customMetrics, explore),
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
        toModelOutput: (output) => toModelOutput(output),
    });
};
