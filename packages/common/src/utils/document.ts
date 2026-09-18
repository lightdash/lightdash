import Ajv, { type ValidateFunction } from 'ajv';
import { validate as isUuid } from 'uuid';
import chartAsCodeSchema from '../schemas/json/chart-as-code-1.0.json';
import type { UuidOrSlug } from '../types/api/uuid';
import type { DocumentContent } from '../types/document';
import { ParameterError } from '../types/errors';
import { parseSavedMergeQuery } from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';

export const DOCUMENT_SCHEMA_VERSION = 1;

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

const chartProperties = {
    name: chartAsCodeSchema.properties.name,
    description: chartAsCodeSchema.properties.description,
    tableName: chartAsCodeSchema.properties.tableName,
    metricQuery: chartAsCodeSchema.properties.metricQuery,
    chartConfig: chartAsCodeSchema.properties.chartConfig,
    tableConfig: chartAsCodeSchema.properties.tableConfig,
    pivotConfig: chartAsCodeSchema.properties.pivotConfig,
    parameters: chartAsCodeSchema.properties.parameters,
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
        required: ['cells'],
        properties: {
            cells: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'content'],
                    properties: {
                        type: { enum: ['markdown', 'chart'] },
                        content: {},
                    },
                    oneOf: [
                        {
                            properties: {
                                type: { const: 'markdown' },
                                content: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['markdown'],
                                    properties: {
                                        markdown: { type: 'string' },
                                    },
                                },
                            },
                        },
                        {
                            properties: {
                                type: { const: 'chart' },
                                content: {
                                    oneOf: [false, true].map((merge) => ({
                                        type: 'object',
                                        additionalProperties: false,
                                        required: ['source', 'chart'],
                                        properties: {
                                            source: {
                                                const: merge
                                                    ? 'merge'
                                                    : 'semantic',
                                            },
                                            chart: chartSchema(merge),
                                        },
                                    })),
                                },
                            },
                        },
                    ],
                },
            },
        },
    });

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
    raw.cells.forEach((cell, cellIndex) => {
        if (cell.type !== 'chart') {
            return;
        }
        const { chart } = cell.content;
        const queries = [
            chart.metricQuery,
            ...(cell.content.source === 'merge'
                ? cell.content.chart.merge.sources
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
        if (chart.chartConfig.type === ChartType.DATA_APP_VIZ) {
            throw new ParameterError(
                'Custom chart types are not supported in Documents',
            );
        }
        if (cell.content.source === 'merge') {
            const { merge } = cell.content.chart;
            if (
                merge.sources.some((source) => 'queryUuid' in source) ||
                merge.sources.length !== 2 ||
                !parseSavedMergeQuery(merge)
            ) {
                throw new ParameterError(
                    `Invalid merge sources or join keys in cell ${cellIndex}`,
                );
            }
        }
    });
    return raw;
};
