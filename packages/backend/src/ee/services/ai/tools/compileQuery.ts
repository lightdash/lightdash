import {
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    getTotalFilterRules,
    metricQueryTableViz,
    toolCompileQueryArgsSchema,
    toolCompileQueryArgsSchemaTransformed,
    ToolCompileQueryArgsTransformed,
    toolCompileQueryOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { CompileMiniMetricQueryFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { populateCustomMetricsSQL } from '../utils/populateCustomMetricsSQL';
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
    compileMiniMetricQuery: CompileMiniMetricQueryFn;
};

export const getCompileQuery = ({ compileMiniMetricQuery }: Dependencies) => {
    const validateVizTool = (
        vizTool: ToolCompileQueryArgsTransformed,
        explore: Explore,
    ) => {
        const filterRules = getTotalFilterRules(vizTool.filters);
        validateFieldEntityType(
            explore,
            vizTool.vizConfig.dimensions,
            'dimension',
        );
        validateFieldEntityType(
            explore,
            vizTool.vizConfig.metrics,
            'metric',
            vizTool.customMetrics,
        );
        validateCustomMetricsDefinition(explore, vizTool.customMetrics);
        validateFilterRules(
            explore,
            filterRules,
            vizTool.customMetrics,
            vizTool.tableCalculations,
        );
        validateMetricDimensionFilterPlacement(
            explore,
            vizTool.customMetrics,
            vizTool.tableCalculations,
            vizTool.filters,
        );
        validateSelectedFieldsExistence(
            explore,
            vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
            vizTool.customMetrics,
            vizTool.tableCalculations,
        );
        validateSortFieldsAreSelected(
            vizTool.vizConfig.sorts,
            vizTool.vizConfig.dimensions,
            vizTool.vizConfig.metrics,
            vizTool.customMetrics,
            vizTool.tableCalculations,
        );
    };

    return tool({
        description: toolCompileQueryArgsSchema.description,
        inputSchema: toolCompileQueryArgsSchema,
        outputSchema: toolCompileQueryOutputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                const ctx = AgentContext.from(context);
                const vizTool =
                    toolCompileQueryArgsSchemaTransformed.parse(toolArgs);

                const explore = ctx.getExplore(vizTool.vizConfig.exploreName);

                validateVizTool(vizTool, explore);

                const query = metricQueryTableViz({
                    vizConfig: vizTool.vizConfig,
                    filters: vizTool.filters,
                    maxLimit: 100, // Compilation doesn't strictly need limit, but metricQueryTableViz requires it
                    customMetrics: vizTool.customMetrics,
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        vizTool.tableCalculations,
                    ),
                });

                const result = await compileMiniMetricQuery(
                    query,
                    populateCustomMetricsSQL(vizTool.customMetrics, explore),
                );

                return {
                    result: result.query,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error compiling metric query.',
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
};
