import { type DataAppVizChart } from '../../types/savedCharts';
import { isAiComposerChartArtifactConfig } from './composerArtifact';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import type {
    AiChartArtifactConfig,
    AiCustomChartTypeChartArtifactConfig,
    AiLegacySemanticChartArtifactConfig,
} from './index';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    isCustomChartTypeSlugChartConfig,
    parsePersistedRunQueryArgs,
    parsePersistedRunQueryPayload,
    toolRunQueryArgsSchemaPersisted,
    toolRunQueryExpressionResolvedArgsSchema,
} from './schemas';
import { AiResultType } from './types';
import { getValidAiQueryLimit } from './validators';

const sanitizeMcpToolKeyPart = (value: string) => {
    const sanitized = value
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+/, '')
        .replace(/_+$/, '');

    return sanitized.length > 0 ? sanitized.toLowerCase() : 'tool';
};

export const getMcpToolBaseName = (
    mcpServerName: string,
    toolName: string,
): string =>
    `mcp_${sanitizeMcpToolKeyPart(mcpServerName)}__${sanitizeMcpToolKeyPart(toolName)}`;

export const parseVizConfig = (
    vizConfigUnknown: object | null,
    maxLimit?: number | undefined,
) => {
    if (!vizConfigUnknown) {
        return null;
    }

    // Parse every persisted run-query shape to the existing internal domain
    // type before rendering or replaying it.
    const vizTool = parsePersistedRunQueryPayload(vizConfigUnknown);
    if (vizTool) {
        const metricQuery = {
            exploreName: vizTool.queryConfig.exploreName,
            dimensions: vizTool.queryConfig.dimensions,
            metrics: vizTool.queryConfig.metrics,
            sorts: vizTool.queryConfig.sorts.map((sort) => ({
                ...sort,
                nullsFirst: sort.nullsFirst ?? undefined,
            })),
            limit: getValidAiQueryLimit(
                vizTool.queryConfig.limit,
                maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
            ),
            filters: vizTool.queryConfig.filters,
            // additionalMetrics is filtered to aggregations (for field
            // validation); customMetrics keeps the full set incl.
            // periodComparison for SQL population.
            additionalMetrics: filterAggregationCustomMetrics(
                vizTool.queryConfig.customMetrics,
            ),
            customMetrics: vizTool.queryConfig.customMetrics,
            tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                vizTool.queryConfig.tableCalculations,
            ),
        };

        return {
            type: AiResultType.QUERY_RESULT,
            vizTool,
            metricQuery,
            parameters: vizTool.queryConfig.parameters,
        } as const;
    }

    return null;
};

// Semantic artifacts accept every persisted query format, including resolved
// per-category filter connectors. Custom charts and merges use their own
// replay envelopes.
const parseBuiltinSemanticVizConfig = (raw: object) => {
    const existing = parsePersistedRunQueryArgs(raw);
    if (existing) {
        if (
            existing.mergeConfig !== null ||
            isCustomChartTypeSlugChartConfig(existing.chartConfig)
        ) {
            return null;
        }
        return raw as AiLegacySemanticChartArtifactConfig;
    }

    const resolved = toolRunQueryExpressionResolvedArgsSchema.safeParse(raw);
    if (
        !resolved.success ||
        resolved.data.mergeConfig !== null ||
        isCustomChartTypeSlugChartConfig(resolved.data.chartConfig)
    ) {
        return null;
    }
    return resolved.data;
};

const parseVersionedArtifactQueryConfig = (raw: unknown) => {
    const existing = toolRunQueryArgsSchemaPersisted.safeParse(raw);
    if (existing.success) return existing.data;

    const resolved = toolRunQueryExpressionResolvedArgsSchema.safeParse(raw);
    return resolved.success ? resolved.data : null;
};

export const parseAiArtifactChartConfig = (
    config: unknown,
): AiChartArtifactConfig | null => {
    if (!config || typeof config !== 'object') return null;

    if (isAiComposerChartArtifactConfig(config)) {
        return config;
    }

    if (
        'source' in config &&
        config.source === 'customChartType' &&
        'schemaVersion' in config &&
        config.schemaVersion === 1 &&
        'dataAppVizUuid' in config &&
        typeof config.dataAppVizUuid === 'string' &&
        config.dataAppVizUuid.length > 0 &&
        'config' in config
    ) {
        const parsed = parseVersionedArtifactQueryConfig(config.config);
        if (
            parsed !== null &&
            parsed.mergeConfig === null &&
            isCustomChartTypeSlugChartConfig(parsed.chartConfig)
        ) {
            return {
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: config.dataAppVizUuid,
                config: parsed,
            };
        }
        return null;
    }

    if (
        'source' in config &&
        config.source === 'merge' &&
        'schemaVersion' in config &&
        config.schemaVersion === 1 &&
        'config' in config
    ) {
        const parsed = parseVersionedArtifactQueryConfig(config.config);
        if (parsed !== null && parsed.mergeConfig !== null) {
            return {
                source: 'merge',
                schemaVersion: 1,
                config: parsed,
            };
        }
        return null;
    }

    if (
        'source' in config &&
        config.source === 'sql' &&
        'sql' in config &&
        typeof config.sql === 'string' &&
        'limit' in config &&
        typeof config.limit === 'number'
    ) {
        return {
            source: 'sql',
            sql: config.sql,
            limit: config.limit,
        };
    }

    if (
        'source' in config &&
        config.source === 'semantic' &&
        'config' in config &&
        config.config &&
        typeof config.config === 'object'
    ) {
        const parsed = parseBuiltinSemanticVizConfig(config.config);
        if (parsed !== null) {
            return {
                source: 'semantic',
                config: parsed,
            };
        }
        return null;
    }

    const semantic = parseBuiltinSemanticVizConfig(config);
    if (semantic !== null) {
        return {
            source: 'semantic',
            config: semantic,
        };
    }

    return null;
};

// The saved-chart shape a custom chart type answer renders and saves with:
// the server-derived uuid from the envelope plus the persisted field mapping
// and option values.
export const getDataAppVizChartFromArtifact = (
    artifactConfig: AiCustomChartTypeChartArtifactConfig,
): DataAppVizChart | null => {
    const { chartConfig } = artifactConfig.config;
    if (!isCustomChartTypeSlugChartConfig(chartConfig)) return null;
    return {
        dataAppVizUuid: artifactConfig.dataAppVizUuid,
        fieldMapping: chartConfig.fieldMapping,
        ...(chartConfig.options ? { optionValues: chartConfig.options } : {}),
    };
};
