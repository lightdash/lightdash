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
    toolRunQueryArgsSchemaPersisted,
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

    // Parse runQuery tool. Persisted artifacts may be V1 or V2;
    // parsePersistedRunQueryArgs normalizes both to the V2 internal shape.
    const vizTool = parsePersistedRunQueryArgs(vizConfigUnknown);
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

// Semantic artifacts are builtin-only: a custom chart type answer is stored
// in its own envelope, never as a slug config under source 'semantic'.
const isBuiltinSemanticVizConfig = (raw: object): boolean => {
    const parsed = parseVizConfig(raw);
    if (!parsed) return false;
    return !(
        parsed.type === AiResultType.QUERY_RESULT &&
        isCustomChartTypeSlugChartConfig(parsed.vizTool.chartConfig)
    );
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
        'config' in config
    ) {
        const parsed = toolRunQueryArgsSchemaPersisted.safeParse(config.config);
        // A merge-shaped config is valid here: the stored mergeConfig inside
        // the tool args is the merge discriminator for custom envelopes.
        if (
            parsed.success &&
            isCustomChartTypeSlugChartConfig(parsed.data.chartConfig)
        ) {
            return {
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: config.dataAppVizUuid,
                config: parsed.data,
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
        const parsed = toolRunQueryArgsSchemaPersisted.safeParse(config.config);
        if (parsed.success && parsed.data.mergeConfig) {
            return {
                source: 'merge',
                schemaVersion: 1,
                config: parsed.data,
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
        typeof config.config === 'object' &&
        isBuiltinSemanticVizConfig(config.config)
    ) {
        return {
            source: 'semantic',
            config: config.config as AiLegacySemanticChartArtifactConfig,
        };
    }

    if (isBuiltinSemanticVizConfig(config)) {
        return {
            source: 'semantic',
            config: config as AiLegacySemanticChartArtifactConfig,
        };
    }

    return null;
};

// The saved-chart shape a custom chart type answer renders and saves with:
// the server-derived uuid from the envelope plus the model's field mapping
// and option values from the verbatim tool args.
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
