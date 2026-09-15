import Ajv, { type ValidateFunction } from 'ajv';
import chartAsCodeSchema from '../schemas/json/chart-as-code-1.0.json';
import type { DocumentContentV1 } from '../types/document';
import { ParameterError } from '../types/errors';
import {
    parseSavedMergeQuery,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
} from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';

export const DOCUMENT_SCHEMA_VERSION = 1;

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

let validator: ValidateFunction<DocumentContentV1> | undefined;

const getValidator = () => {
    if (!validator) {
        // Lazy compilation keeps importing common safe under browser CSP.
        validator = new Ajv({
            strict: false,
            validateFormats: false,
        }).compile<DocumentContentV1>({
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
                                    content: { type: 'string' },
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
    }
    return validator;
};

export const parseDocumentContent = (
    schemaVersion: number,
    raw: unknown,
): DocumentContentV1 => {
    if (schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
        throw new ParameterError(
            `Unsupported Document schema version: ${schemaVersion}`,
        );
    }
    const validate = getValidator();
    if (!validate(raw)) {
        throw new ParameterError(
            `Invalid Document content: ${validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join('; ')}`,
        );
    }
    const ids = raw.cells.map((cell) => cell.id);
    if (new Set(ids).size !== ids.length) {
        throw new ParameterError('Document cell IDs must be unique');
    }
    raw.cells.forEach((cell) => {
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
                'Custom chart types are not supported in Document schema version 1',
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
    return raw;
};
