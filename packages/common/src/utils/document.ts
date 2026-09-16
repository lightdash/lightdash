import Ajv, { type ValidateFunction } from 'ajv';
import chartAsCodeSchema from '../schemas/json/chart-as-code-1.0.json';
import type {
    DocumentContentV1,
    DocumentContentV2,
    DocumentContentV3,
} from '../types/document';
import { ParameterError } from '../types/errors';
import {
    parseSavedMergeQuery,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
} from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';

export const DOCUMENT_SCHEMA_VERSION = 3;

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

let legacyValidator: ValidateFunction<DocumentContentV1> | undefined;
let titledValidator: ValidateFunction<DocumentContentV2> | undefined;
let currentValidator: ValidateFunction<DocumentContentV3> | undefined;

// Lazy compilation keeps importing common safe under browser CSP.
const createValidator = <T>(schemaVersion: 1 | 2 | 3): ValidateFunction<T> =>
    new Ajv({
        strict: false,
        validateFormats: false,
    }).compile<T>({
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
                    required: ['id', 'type', 'content'],
                    properties: {
                        id: {
                            type: 'string',
                            minLength: 1,
                            pattern: '\\S',
                        },
                        type: { enum: ['markdown', 'chart'] },
                        content: {},
                    },
                    oneOf: [
                        {
                            properties: {
                                type: { const: 'markdown' },
                                content:
                                    schemaVersion === 1
                                        ? { type: 'string' }
                                        : {
                                              type: 'object',
                                              additionalProperties: false,
                                              required: ['markdown'],
                                              properties: {
                                                  markdown: { type: 'string' },
                                                  ...(schemaVersion === 2
                                                      ? {
                                                            title: {
                                                                type: 'string',
                                                                pattern: '\\S',
                                                            },
                                                        }
                                                      : {}),
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
                                            ...(schemaVersion === 2
                                                ? {
                                                      title: {
                                                          type: 'string',
                                                          pattern: '\\S',
                                                      },
                                                  }
                                                : {}),
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

const validateContent = <T>(validate: ValidateFunction<T>, raw: unknown): T => {
    if (!validate(raw)) {
        throw new ParameterError(
            `Invalid Document content: ${validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join('; ')}`,
        );
    }
    return raw;
};

const readContent = (
    schemaVersion: number,
    raw: unknown,
): DocumentContentV3 => {
    if (schemaVersion === 1) {
        legacyValidator ??= createValidator<DocumentContentV1>(1);
        const legacy = validateContent(legacyValidator, raw);
        return {
            cells: legacy.cells.map((cell) =>
                cell.type === 'markdown'
                    ? { ...cell, content: { markdown: cell.content } }
                    : { ...cell, content: { ...cell.content } },
            ),
        };
    }
    if (schemaVersion === 2) {
        titledValidator ??= createValidator<DocumentContentV2>(2);
        const legacy = validateContent(titledValidator, raw);
        return {
            cells: legacy.cells.map((cell) =>
                cell.type === 'markdown'
                    ? { ...cell, content: { markdown: cell.content.markdown } }
                    : {
                          ...cell,
                          content:
                              cell.content.source === 'semantic'
                                  ? {
                                        source: 'semantic',
                                        chart: cell.content.chart,
                                    }
                                  : {
                                        source: 'merge',
                                        chart: cell.content.chart,
                                    },
                      },
            ),
        };
    }
    if (schemaVersion === DOCUMENT_SCHEMA_VERSION) {
        currentValidator ??= createValidator<DocumentContentV3>(3);
        return validateContent(currentValidator, raw);
    }
    throw new ParameterError(
        `Unsupported Document schema version: ${schemaVersion}`,
    );
};

export const parseDocumentContent = (
    schemaVersion: number,
    raw: unknown,
): DocumentContentV3 => {
    const content = readContent(schemaVersion, raw);
    const ids = content.cells.map((cell) => cell.id);
    if (new Set(ids).size !== ids.length) {
        throw new ParameterError('Document cell IDs must be unique');
    }
    content.cells.forEach((cell) => {
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
                !parseSavedMergeQuery(SAVED_MERGE_QUERY_SCHEMA_VERSION, merge)
            ) {
                throw new ParameterError(
                    `Invalid merge sources or join keys in cell ${cell.id}`,
                );
            }
        }
    });
    return content;
};
