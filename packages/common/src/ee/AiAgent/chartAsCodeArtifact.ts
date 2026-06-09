import {
    ContentAsCodeType,
    currentVersion,
    type ChartAsCode,
} from '../../types/coder';
import { normalizeFilterIds } from '../../utils/filters';
import { generateSlug } from '../../utils/slugs';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import { type AiMetricQueryWithFilters } from './types';
import { getValidAiQueryLimit } from './validators';

export const isChartAsCodeArtifactConfig = (
    vizConfigUnknown: object | null,
): vizConfigUnknown is ChartAsCode => {
    if (!vizConfigUnknown || typeof vizConfigUnknown !== 'object') {
        return false;
    }

    const { tableName, metricQuery, chartConfig } =
        vizConfigUnknown as Partial<ChartAsCode>;
    return (
        typeof tableName === 'string' &&
        !!metricQuery &&
        typeof metricQuery === 'object' &&
        !!chartConfig &&
        typeof chartConfig === 'object' &&
        typeof chartConfig.type === 'string'
    );
};

export const getChartAsCodeMetricQuery = (
    chartAsCode: ChartAsCode,
    maxLimit?: number,
): AiMetricQueryWithFilters => ({
    ...chartAsCode.metricQuery,
    exploreName: chartAsCode.metricQuery.exploreName ?? chartAsCode.tableName,
    dimensions: chartAsCode.metricQuery.dimensions ?? [],
    metrics: chartAsCode.metricQuery.metrics ?? [],
    sorts: chartAsCode.metricQuery.sorts ?? [],
    limit: getValidAiQueryLimit(
        chartAsCode.metricQuery.limit ?? null,
        maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
    ),
    filters: normalizeFilterIds(chartAsCode.metricQuery.filters),
    additionalMetrics: chartAsCode.metricQuery.additionalMetrics ?? [],
    tableCalculations: chartAsCode.metricQuery.tableCalculations ?? [],
});

type BuildChartAsCodeArtifactArgs = {
    name: string;
    description?: string | null;
    tableName: string;
    metricQuery: unknown;
    chartConfig: unknown;
    pivotConfig?: ChartAsCode['pivotConfig'] | null;
    tableConfig?: ChartAsCode['tableConfig'] | null;
    maxLimit?: number;
    spaceSlug?: string;
};

const getTableConfig = (
    tableConfig: ChartAsCode['tableConfig'] | null | undefined,
    metricQuery: AiMetricQueryWithFilters,
): ChartAsCode['tableConfig'] => {
    if (tableConfig) {
        return tableConfig;
    }

    return {
        columnOrder: [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(
                (calculation) => calculation.name,
            ),
        ],
    };
};

export const buildChartAsCodeArtifact = ({
    name,
    description,
    tableName,
    metricQuery,
    chartConfig,
    pivotConfig,
    tableConfig,
    maxLimit,
    spaceSlug = 'agent-suggestions',
}: BuildChartAsCodeArtifactArgs): ChartAsCode => {
    const draft = {
        name,
        ...(description ? { description } : {}),
        tableName,
        metricQuery,
        chartConfig,
        ...(pivotConfig ? { pivotConfig } : {}),
        slug: generateSlug(name),
        spaceSlug,
        version: currentVersion,
        contentType: ContentAsCodeType.CHART,
    } as unknown as ChartAsCode;
    const normalizedMetricQuery = getChartAsCodeMetricQuery(draft, maxLimit);

    return {
        ...draft,
        tableName: normalizedMetricQuery.exploreName,
        metricQuery: normalizedMetricQuery,
        tableConfig: getTableConfig(tableConfig, normalizedMetricQuery),
    } as unknown as ChartAsCode;
};
