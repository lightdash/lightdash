import {
    buildSavedMergeDefinition,
    canonicalizeAiMerge,
    ChartType,
    ContentAsCodeType,
    currentVersion,
    deriveDataAppVizPivotConfig,
    getRunQueryChartConfig,
    isCustomChartTypeSlugChartConfig,
    ParameterError,
    remapFieldIdsDeep,
    type ChartAsCode,
    type DataAppVizSchema,
    type ItemsMap,
    type MergeQuery,
    type MetricQuery,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import { stringify } from 'yaml';
import { AiAgentContentValidation } from './AiAgentContentValidation';

export type PreparedChartAsCode = Omit<ChartAsCode, 'slug' | 'spaceSlug'>;

export type ChartExportSource = {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    mergeQuery?: MergeQuery;
    customChartType?: {
        dataAppVizVersion: number;
        fields: DataAppVizSchema['fields'];
    };
};

const validation = new AiAgentContentValidation();

export const validatePreparedChartAsCode = (
    candidate: unknown,
): PreparedChartAsCode => {
    if (!candidate || typeof candidate !== 'object') {
        throw new ParameterError(
            'The stored chart-as-code snapshot is invalid.',
        );
    }
    const content = {
        ...structuredClone(candidate),
        slug: 'chart',
        spaceSlug: 'space',
    } as ChartAsCode;
    validation.validateContent('chart', content);
    const { slug: _slug, spaceSlug: _spaceSlug, ...prepared } = content;
    return prepared;
};

const portableMetricQuery = ({
    additionalMetrics,
    ...query
}: MetricQuery): MetricQuery => ({
    ...query,
    additionalMetrics: additionalMetrics?.map(
        ({ uuid: _uuid, ...metric }) => metric,
    ),
});

export const prepareChartAsCode = ({
    queryTool,
    metricQuery,
    fields,
    mergeQuery,
    customChartType,
}: ChartExportSource): PreparedChartAsCode => {
    const customConfig = isCustomChartTypeSlugChartConfig(queryTool.chartConfig)
        ? queryTool.chartConfig
        : null;
    if (
        customConfig &&
        (!customChartType || queryTool.mergeConfig || mergeQuery)
    ) {
        throw new ParameterError(
            'Custom chart export requires its resolved version and schema, without a merge.',
        );
    }
    const canonicalMerge = mergeQuery ? canonicalizeAiMerge(mergeQuery) : null;
    if (queryTool.mergeConfig && !canonicalMerge) {
        throw new ParameterError(
            'Merged chart export requires both executed source queries.',
        );
    }
    if (mergeQuery && !queryTool.mergeConfig) {
        throw new ParameterError(
            'Merged chart export requires its merge configuration.',
        );
    }
    const groupBy =
        queryTool.chartConfig &&
        !isCustomChartTypeSlugChartConfig(queryTool.chartConfig)
            ? (queryTool.chartConfig.groupBy ?? [])
            : [];
    const persistedQuery =
        canonicalMerge?.mergeQuery.sources[0].metricQuery ?? metricQuery;
    const builtinPivotConfig = groupBy.length
        ? { columns: [...groupBy] }
        : undefined;
    const content: PreparedChartAsCode = {
        version: currentVersion,
        contentType: ContentAsCodeType.CHART,
        name: queryTool.title,
        description: queryTool.description,
        tableName: persistedQuery.exploreName,
        metricQuery: portableMetricQuery(persistedQuery),
        chartConfig:
            customConfig && customChartType
                ? {
                      type: ChartType.DATA_APP_VIZ,
                      config: {
                          dataAppVizSlug: customConfig.customChartTypeSlug,
                          dataAppVizVersion: customChartType.dataAppVizVersion,
                          fieldMapping: structuredClone(
                              customConfig.fieldMapping,
                          ),
                          optionValues: customConfig.options ?? undefined,
                      },
                  }
                : getRunQueryChartConfig({
                      queryTool,
                      metricQuery,
                      fieldsMap: fields,
                  }),
        tableConfig: {
            columnOrder: [
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
            ],
        },
        pivotConfig:
            customConfig && customChartType
                ? deriveDataAppVizPivotConfig(
                      customChartType.fields,
                      customConfig.fieldMapping,
                  )
                : builtinPivotConfig,
        parameters: queryTool.queryConfig.parameters ?? undefined,
        dashboardSlug: undefined,
    };
    if (canonicalMerge) {
        content.chartConfig = remapFieldIdsDeep(
            content.chartConfig,
            canonicalMerge.fieldIdByAiFieldId,
        );
        content.tableConfig = remapFieldIdsDeep(
            content.tableConfig,
            canonicalMerge.fieldIdByAiFieldId,
        );
        content.pivotConfig = remapFieldIdsDeep(
            content.pivotConfig,
            canonicalMerge.fieldIdByAiFieldId,
        );
        content.merge = buildSavedMergeDefinition({
            chartSourceId: canonicalMerge.mergeQuery.sources[0].id,
            mergeQuery: {
                ...canonicalMerge.mergeQuery,
                sources: canonicalMerge.mergeQuery.sources.map((source) => ({
                    ...source,
                    metricQuery: portableMetricQuery(source.metricQuery),
                })),
            },
        });
    }
    validation.validateContent('chart', {
        ...content,
        slug: 'chart',
        spaceSlug: 'space',
    });
    return content;
};

export const serializeChartAsCode = (
    prepared: PreparedChartAsCode,
    destination: { slug: string; spaceSlug: string },
): { content: ChartAsCode; yaml: string } => {
    const content: ChartAsCode = {
        ...structuredClone(prepared),
        ...destination,
    };
    validation.validateContent('chart', content);
    return {
        content,
        yaml: stringify(content, {
            aliasDuplicateObjects: false,
            compat: 'yaml-1.1',
        }),
    };
};
