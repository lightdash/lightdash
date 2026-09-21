import {
    getFilterRulesFromGroup,
    getItemMap,
    ParameterError,
    parseVizConfig,
    type AiArtifact,
    type ApiCompiledMergeQueryResults,
    type DataAppVizSchema,
    type MergeQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { buildMergeResultMetricQuery } from '../../../../utils/QueryBuilder/MergeQueryComposer';
import { type GetExploreFn } from '../types/aiAgentDependencies';
import {
    buildAiMergeQuery,
    buildAiMergeSourceConfigs,
} from './buildAiMergeQuery';
import {
    prepareChartAsCode,
    validatePreparedChartAsCode,
    type PreparedChartAsCode,
} from './chartAsCode';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from './populateCustomMetricsSQL';
import { validateSelectedFieldsExistence } from './validators';

export type ArtifactChartExportAccess = {
    list: () => Promise<
        Array<
            Pick<
                AiArtifact,
                'artifactUuid' | 'versionUuid' | 'title' | 'description'
            >
        >
    >;
    prepare: (reference: {
        artifactUuid: string;
        versionUuid: string;
    }) => Promise<PreparedChartAsCode>;
};

/** Metadata-only replay of an already authorized, exact artifact version. */
export const prepareArtifactChartAsCode = async ({
    artifact,
    maxQueryLimit,
    getExplore,
    compileMerge,
    getCustomSchemaFields,
}: {
    artifact: AiArtifact;
    maxQueryLimit: number;
    getExplore: GetExploreFn;
    compileMerge: (
        mergeQuery: MergeQuery,
        parameters: ParametersValuesMap | undefined,
    ) => Promise<ApiCompiledMergeQueryResults>;
    getCustomSchemaFields: (
        uuid: string,
        version: number,
    ) => Promise<DataAppVizSchema['fields'] | null>;
}): Promise<PreparedChartAsCode> => {
    const config = artifact.chartConfig;
    if (
        artifact.artifactType !== 'chart' ||
        !config ||
        !['semantic', 'merge', 'customChartType'].includes(config.source) ||
        !('config' in config)
    ) {
        throw new ParameterError(
            'This artifact does not support chart-as-code export. Use content tools for saved content.',
        );
    }
    if (config.contentAsCode !== undefined) {
        return validatePreparedChartAsCode(config.contentAsCode);
    }
    const parsed = parseVizConfig(config.config, maxQueryLimit);
    if (!parsed)
        throw new ParameterError('The stored chart configuration is invalid.');
    if (
        parsed.vizTool.queryConfig.limit !== null &&
        parsed.vizTool.queryConfig.limit > maxQueryLimit
    ) {
        throw new ParameterError(
            'The stored chart limit exceeds the current agent limit; exporting it would change its scope.',
        );
    }
    const queryTool = {
        ...parsed.vizTool,
        title: artifact.title ?? parsed.vizTool.title,
        description: artifact.description ?? parsed.vizTool.description,
    };
    if (queryTool.mergeConfig) {
        const explores = new Map(
            await Promise.all(
                [
                    ...new Set(
                        buildAiMergeSourceConfigs(queryTool).map(
                            ({ queryConfig }) => queryConfig.exploreName,
                        ),
                    ),
                ].map(
                    async (name) =>
                        [name, await getExplore({ table: name })] as const,
                ),
            ),
        );
        const mergeQuery = buildAiMergeQuery({
            toolArgs: queryTool,
            maxQueryLimit,
            getExplore: (name) => {
                const explore = explores.get(name);
                if (!explore)
                    throw new ParameterError('Merge source is unavailable.');
                return explore;
            },
        });
        const compiled = await compileMerge(
            mergeQuery,
            parsed.parameters ?? undefined,
        );
        if (compiled.errors.length || !compiled.typedColumns) {
            throw new ParameterError(
                'The stored merge is no longer valid against the authorized catalog.',
            );
        }
        return prepareChartAsCode({
            queryTool,
            mergeQuery,
            fields: compiled.itemsMap,
            metricQuery: buildMergeResultMetricQuery({
                itemsMap: compiled.itemsMap,
                columnOrder: compiled.typedColumns.map(
                    ({ reference }) => reference,
                ),
                sorts: compiled.sorts,
                limit: mergeQuery.limit,
            }),
        });
    }
    const explore = await getExplore({ table: parsed.metricQuery.exploreName });
    const additionalMetrics = populateCustomMetricsSQL(
        parsed.metricQuery.customMetrics,
        explore,
    );
    const { customMetrics: _customMetrics, ...metricQuery } =
        parsed.metricQuery;
    const expandedQuery = {
        ...metricQuery,
        metrics: expandMetricsWithPopAdditionalMetrics(
            metricQuery.metrics,
            additionalMetrics,
        ),
        additionalMetrics,
    };
    validateSelectedFieldsExistence(
        explore,
        [
            ...expandedQuery.dimensions,
            ...expandedQuery.metrics,
            ...expandedQuery.sorts.map(({ fieldId }) => fieldId),
            ...Object.values(expandedQuery.filters).flatMap((group) =>
                getFilterRulesFromGroup(group).map(
                    ({ target }) => target.fieldId,
                ),
            ),
        ],
        additionalMetrics,
        expandedQuery.tableCalculations,
    );
    let customChartType;
    if (config.source === 'customChartType') {
        if (config.dataAppVizVersion === undefined) {
            throw new ParameterError(
                'This legacy custom chart has no pinned version. Export cannot choose a newer version implicitly.',
            );
        }
        const fields = await getCustomSchemaFields(
            config.dataAppVizUuid,
            config.dataAppVizVersion,
        );
        if (!fields)
            throw new ParameterError(
                'The pinned custom chart type is unavailable.',
            );
        customChartType = {
            dataAppVizVersion: config.dataAppVizVersion,
            fields,
        };
    }
    return prepareChartAsCode({
        queryTool,
        metricQuery: expandedQuery,
        fields: getItemMap(
            explore,
            additionalMetrics,
            expandedQuery.tableCalculations,
        ),
        customChartType,
    });
};
