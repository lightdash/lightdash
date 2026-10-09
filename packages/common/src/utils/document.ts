import Ajv, { type ValidateFunction } from 'ajv';
import { validate as isUuid } from 'uuid';
import chartAsCodeSchema from '../schemas/json/chart-as-code-1.0.json';
import type { UuidOrSlug } from '../types/api/uuid';
import type { ChartAsCodeConfig } from '../types/contentAsCode/charts';
import type {
    DocumentAsCode,
    DocumentChartContent,
    DocumentContent,
} from '../types/document';
import { ParameterError } from '../types/errors';
import { parseSavedMergeQuery } from '../types/mergeQuery';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import {
    fromDocumentChartBlocks,
    getDocumentChartBlocks,
} from './documentMarkdown';

export const DOCUMENT_SCHEMA_VERSION = 2;

export const getDocumentUrl = (
    projectUuidOrSlug: UuidOrSlug,
    documentUuidOrSlug: UuidOrSlug,
    documentSlug?: string,
): string =>
    `/projects/${encodeURIComponent(projectUuidOrSlug)}/documents/${encodeURIComponent(
        documentSlug && !isUuid(documentSlug)
            ? documentSlug
            : documentUuidOrSlug,
    )}`;

const semanticChartProperties = chartAsCodeSchema.$defs.ChartAsCode.properties;

const chartProperties = {
    name: semanticChartProperties.name,
    description: semanticChartProperties.description,
    tableName: semanticChartProperties.tableName,
    metricQuery: semanticChartProperties.metricQuery,
    chartConfig: semanticChartProperties.chartConfig,
    tableConfig: semanticChartProperties.tableConfig,
    pivotConfig: semanticChartProperties.pivotConfig,
    parameters: semanticChartProperties.parameters,
};

const chartSchema = (merge: boolean) => ({
    type: 'object',
    additionalProperties: false,
    properties: {
        ...chartProperties,
        ...(merge ? { merge: { $ref: '#/$defs/SavedMergeQuery' } } : {}),
    },
    required: [
        'name',
        'tableName',
        'metricQuery',
        'chartConfig',
        ...(merge ? ['merge'] : []),
    ],
});

let contentValidator: ValidateFunction<DocumentContent> | undefined;

// Lazy compilation keeps importing common safe under browser CSP.
const createValidator = (): ValidateFunction<DocumentContent> =>
    new Ajv({
        strict: false,
        validateFormats: false,
    }).compile<DocumentContent>({
        $defs: chartAsCodeSchema.$defs,
        type: 'object',
        additionalProperties: false,
        required: ['markdown', 'charts'],
        properties: {
            markdown: { type: 'string' },
            charts: {
                type: 'object',
                additionalProperties: {
                    oneOf: [false, true].map((merge) => ({
                        type: 'object',
                        additionalProperties: false,
                        required: ['source', 'chart'],
                        properties: {
                            source: { const: merge ? 'merge' : 'semantic' },
                            chart: chartSchema(merge),
                        },
                    })),
                },
            },
        },
    });

const validateChart = (id: string, content: DocumentChartContent): void => {
    const { chart } = content;
    const queries = [
        chart.metricQuery,
        ...(content.source === 'merge'
            ? content.chart.merge.sources
                  .filter((source) => source.kind === 'query')
                  .map((source) => source.metricQuery)
            : []),
    ];
    if (
        queries.some((query) =>
            ['queryUuid', 'results', 'rows'].some((key) => key in query),
        )
    ) {
        throw new ParameterError(
            'Document charts must contain durable queries, not query UUIDs or results',
        );
    }
    if (
        chart.chartConfig.type === ChartType.DATA_APP_VIZ &&
        chart.chartConfig.config === undefined
    ) {
        throw new ParameterError(
            `Custom chart "${id}" must reference a chart type`,
        );
    }
    if (content.source === 'merge') {
        const { merge } = content.chart;
        if (
            merge.sources.some((source) => 'queryUuid' in source) ||
            merge.sources.length !== 2 ||
            !parseSavedMergeQuery(merge)
        ) {
            throw new ParameterError(
                `Invalid merge sources or join keys in chart "${id}"`,
            );
        }
    }
};

/**
 * Validate Document content and return its canonical form: chart tags carry
 * only their id and charts that are not placed in the markdown are dropped.
 */
export const parseDocumentContent = (
    schemaVersion: number,
    raw: unknown,
): DocumentContent => {
    if (schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
        throw new ParameterError(
            `Unsupported Document schema version: ${schemaVersion}`,
        );
    }
    contentValidator ??= createValidator();
    if (!contentValidator(raw)) {
        throw new ParameterError(
            `Invalid Document content: ${contentValidator.errors?.map((error) => `${error.instancePath} ${error.message}`).join('; ')}`,
        );
    }
    const blocks = getDocumentChartBlocks(raw);
    blocks.forEach((block) => {
        if (block.type === 'chart') validateChart(block.id, block.chart);
    });
    return fromDocumentChartBlocks(blocks);
};

const DOCUMENT_AS_CODE_KEYS = [
    'name',
    'slug',
    'description',
    'spaceSlug',
    'schemaVersion',
    'markdown',
    'charts',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonBlankString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '';

/** A Document as code, as downloaded; an omitted description is empty. */
export const parseDocumentAsCode = (raw: unknown): DocumentAsCode => {
    if (!isRecord(raw)) {
        throw new ParameterError('Document as code must be an object');
    }
    const unknownKeys = Object.keys(raw).filter(
        (key) => !(DOCUMENT_AS_CODE_KEYS as readonly string[]).includes(key),
    );
    if (unknownKeys.length > 0) {
        throw new ParameterError(
            `Unknown Document fields: ${unknownKeys.join(', ')}`,
        );
    }
    const { name, slug, description = '', spaceSlug, schemaVersion } = raw;
    if (
        !isNonBlankString(name) ||
        !isNonBlankString(slug) ||
        !isNonBlankString(spaceSlug)
    ) {
        throw new ParameterError(
            'Document name, slug and spaceSlug must be non-empty strings',
        );
    }
    if (typeof description !== 'string') {
        throw new ParameterError('Document description must be a string');
    }
    if (schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
        throw new ParameterError(
            `Unsupported Document schema version: ${String(schemaVersion)}`,
        );
    }
    return {
        name,
        slug,
        description,
        spaceSlug,
        schemaVersion,
        ...parseDocumentContent(schemaVersion, {
            markdown: raw.markdown,
            charts: raw.charts ?? {},
        }),
    };
};

/**
 * The runtime chart config of a stored Document chart. Stored custom charts
 * are always pinned to this project's chart type uuid; the portable slug that
 * reads add is dropped.
 */
export const getDocumentRuntimeChartConfig = (
    chartConfig: ChartAsCodeConfig,
): ChartConfig => {
    if (chartConfig.type !== ChartType.DATA_APP_VIZ) {
        return chartConfig;
    }
    if (chartConfig.config?.dataAppVizUuid === undefined) {
        throw new ParameterError(
            'Custom chart is not linked to a chart type in this project',
        );
    }
    const { dataAppVizSlug, dataAppVizUuid, ...config } = chartConfig.config;
    return {
        type: ChartType.DATA_APP_VIZ,
        config: { ...config, dataAppVizUuid },
    };
};
