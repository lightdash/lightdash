import {
    getValidAiQueryLimit,
    ParameterError,
    type Explore,
    type MetricSourcedMergeQuery,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from './populateCustomMetricsSQL';

type AiMergeSourceConfig = {
    id: string;
    queryConfig: ToolRunQueryArgsTransformed['queryConfig'];
};

// Every query in the merge, primary first; additional sources inherit the
// primary's limit and parameter values (the tool schema omits them on purpose).
export const buildAiMergeSourceConfigs = (
    toolArgs: ToolRunQueryArgsTransformed,
): AiMergeSourceConfig[] => {
    const { mergeConfig } = toolArgs;
    if (!mergeConfig) {
        throw new ParameterError('Merge config not found');
    }
    return [
        {
            id: mergeConfig.primarySourceId,
            queryConfig: toolArgs.queryConfig,
        },
        ...mergeConfig.additionalSources.map((source) => ({
            id: source.id,
            queryConfig: {
                ...source.queryConfig,
                limit: toolArgs.queryConfig.limit,
                parameters: toolArgs.queryConfig.parameters,
                tableCalculations: [],
            },
        })),
    ];
};

// Single authority for converting the AI tool's merge shape into the core
// MergeQuery: tool run and artifact replay must describe the same merge.
export const buildAiMergeQuery = ({
    toolArgs,
    getExplore,
    maxQueryLimit,
}: {
    toolArgs: ToolRunQueryArgsTransformed;
    getExplore: (exploreName: string) => Explore;
    maxQueryLimit: number;
}): MetricSourcedMergeQuery => {
    const { mergeConfig } = toolArgs;
    if (!mergeConfig) {
        throw new ParameterError('Merge config not found');
    }
    const effectiveLimit = getValidAiQueryLimit(
        toolArgs.queryConfig.limit,
        maxQueryLimit,
    );
    const sources = buildAiMergeSourceConfigs(toolArgs).map(
        ({ id, queryConfig }) => {
            const explore = getExplore(queryConfig.exploreName);
            const additionalMetrics = populateCustomMetricsSQL(
                queryConfig.customMetrics,
                explore,
            );
            return {
                id,
                metricQuery: {
                    exploreName: queryConfig.exploreName,
                    dimensions: queryConfig.dimensions,
                    metrics: expandMetricsWithPopAdditionalMetrics(
                        queryConfig.metrics,
                        additionalMetrics,
                    ),
                    sorts: queryConfig.sorts.map((sort) => ({
                        ...sort,
                        nullsFirst: sort.nullsFirst ?? undefined,
                    })),
                    limit: effectiveLimit,
                    filters: queryConfig.filters,
                    additionalMetrics,
                    tableCalculations: [],
                },
            };
        },
    );
    return {
        sources,
        joinKey: mergeConfig.joinKey.map((part) => ({
            name: part.name,
            fieldIdBySourceId: Object.fromEntries(
                part.fields.map((field) => [field.sourceId, field.fieldId]),
            ),
        })),
        joinType: mergeConfig.joinType,
        tableCalculations: [],
        limit: effectiveLimit,
    };
};
