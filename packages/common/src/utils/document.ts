import Ajv, { type ValidateFunction } from 'ajv';
import { isEqual } from 'lodash';
import { validate as isUuid } from 'uuid';
import chartAsCodeSchema from '../schemas/json/chart-as-code-1.0.json';
import type { UuidOrSlug } from '../types/api/uuid';
import type { ChartAsCodeConfig } from '../types/contentAsCode/charts';
import type {
    DocumentAsCode,
    DocumentChartContent,
    DocumentContent,
    DocumentExploreChartContent,
    DocumentSqlChartContent,
} from '../types/document';
import { ParameterError } from '../types/errors';
import { parseSavedMergeQuery } from '../types/mergeQuery';
import { ChartKind, ChartType, type ChartConfig } from '../types/savedCharts';
import {
    fromDocumentChartBlocks,
    getDocumentChartBlocks,
} from './documentMarkdown';

export const DOCUMENT_SCHEMA_VERSION = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

/**
 * The newest version of each chart source this release reads. An entry from a
 * newer version, or with an unknown source, is kept as an unsupported chart.
 */
const DOCUMENT_CHART_SOURCE_VERSIONS: Record<
    DocumentChartContent['source'],
    number
> = {
    semantic: 1,
    merge: 1,
    sql: 1,
};

const isKnownChartSource = (
    source: unknown,
): source is DocumentChartContent['source'] =>
    typeof source === 'string' &&
    Object.hasOwn(DOCUMENT_CHART_SOURCE_VERSIONS, source);

let chartValidator: ValidateFunction<DocumentExploreChartContent> | undefined;

// Lazy compilation keeps importing common safe under browser CSP.
const createChartValidator =
    (): ValidateFunction<DocumentExploreChartContent> =>
        new Ajv({
            strict: false,
            validateFormats: false,
        }).compile<DocumentExploreChartContent>({
            $defs: chartAsCodeSchema.$defs,
            oneOf: [false, true].map((merge) => ({
                type: 'object',
                additionalProperties: false,
                required: ['source', 'chart'],
                properties: {
                    source: { const: merge ? 'merge' : 'semantic' },
                    chart: chartSchema(merge),
                },
            })),
        });

const validateChart = (
    id: string,
    content: DocumentExploreChartContent,
): void => {
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

const invalidContent = (message: string) =>
    new ParameterError(`Invalid Document content: ${message}`);

const SQL_CHART_KINDS: readonly string[] = [
    ChartKind.VERTICAL_BAR,
    ChartKind.LINE,
    ChartKind.PIE,
    ChartKind.BIG_NUMBER,
    ChartKind.TABLE,
];

const SQL_CHART_KEYS = [
    'name',
    'description',
    'sql',
    'limit',
    'chartKind',
    'config',
    'connection',
    'warehouseConnectionUuid',
];

/**
 * A SQL chart checked for its shape; the API boundary validates its
 * visualization config in full.
 */
const readSqlChartEntry = (
    id: string,
    entry: Record<string, unknown>,
): DocumentSqlChartContent => {
    const fail = (message: string) => invalidContent(`/charts/${id}${message}`);
    const { source, chart, ...rest } = entry;
    if (Object.keys(rest).length > 0 || !isRecord(chart)) {
        throw fail(' must have only source and chart');
    }
    const unknownKeys = Object.keys(chart).filter(
        (key) => !SQL_CHART_KEYS.includes(key),
    );
    if (unknownKeys.length > 0) {
        throw fail(`/chart has unknown fields ${unknownKeys.join(', ')}`);
    }
    const {
        name,
        description,
        sql,
        limit,
        chartKind,
        config,
        connection,
        warehouseConnectionUuid,
    } = chart;
    if (typeof name !== 'string' || name.trim() === '') {
        throw fail('/chart/name must be a non-empty string');
    }
    if (description !== undefined && typeof description !== 'string') {
        throw fail('/chart/description must be string');
    }
    if (typeof sql !== 'string' || sql.trim() === '') {
        throw fail('/chart/sql must be a non-empty string');
    }
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        throw fail('/chart/limit must be a positive integer');
    }
    if (typeof chartKind !== 'string' || !SQL_CHART_KINDS.includes(chartKind)) {
        throw fail(
            `/chart/chartKind must be one of ${SQL_CHART_KINDS.join(', ')}`,
        );
    }
    if (!isRecord(config) || config.type !== chartKind) {
        throw fail('/chart/config must be an object whose type is chartKind');
    }
    if (
        (connection !== undefined && typeof connection !== 'string') ||
        (warehouseConnectionUuid !== undefined &&
            typeof warehouseConnectionUuid !== 'string')
    ) {
        throw fail('/chart/connection must be string');
    }
    return {
        source: 'sql',
        chart: chart as DocumentSqlChartContent['chart'],
    };
};

/**
 * A chart entry this release reads, validated and without its `version`, or
 * undefined when it comes from a newer release. Throws when a readable entry
 * is invalid.
 */
const readChartEntry = (
    id: string,
    entry: unknown,
): DocumentChartContent | undefined => {
    if (!isRecord(entry)) {
        throw invalidContent(`/charts/${id} must be object`);
    }
    const { version = 1, ...chart } = entry;
    if (!isKnownChartSource(chart.source)) {
        return undefined;
    }
    if (typeof version !== 'number' || !Number.isInteger(version)) {
        throw invalidContent(`/charts/${id}/version must be integer`);
    }
    if (version > DOCUMENT_CHART_SOURCE_VERSIONS[chart.source]) {
        return undefined;
    }
    if (chart.source === 'sql') {
        return readSqlChartEntry(id, chart);
    }
    chartValidator ??= createChartValidator();
    if (!chartValidator(chart)) {
        throw invalidContent(
            (chartValidator.errors ?? [])
                .map(
                    (error) =>
                        `/charts/${id}${error.instancePath} ${error.message}`,
                )
                .join('; '),
        );
    }
    validateChart(id, chart);
    return chart;
};

const describeChartEntry = (entry: unknown): string => {
    if (!isRecord(entry) || typeof entry.source !== 'string') {
        return 'an unknown kind';
    }
    return typeof entry.version === 'number'
        ? `"${entry.source}" version ${entry.version}`
        : `"${entry.source}"`;
};

type ContentEnvelope = {
    markdown: string;
    entries: Record<string, unknown>;
};

const CONTENT_KEYS = ['markdown', 'charts', 'unsupportedCharts'];

const parseContentEnvelope = (raw: unknown): ContentEnvelope => {
    if (!isRecord(raw)) {
        throw invalidContent('must be object');
    }
    const unknownKeys = Object.keys(raw).filter(
        (key) => !CONTENT_KEYS.includes(key),
    );
    if (unknownKeys.length > 0) {
        throw invalidContent(`unknown fields ${unknownKeys.join(', ')}`);
    }
    const { markdown, charts, unsupportedCharts = {} } = raw;
    if (typeof markdown !== 'string') {
        throw invalidContent('/markdown must be string');
    }
    if (!isRecord(charts)) {
        throw invalidContent('/charts must be object');
    }
    if (!isRecord(unsupportedCharts)) {
        throw invalidContent('/unsupportedCharts must be object');
    }
    return { markdown, entries: { ...unsupportedCharts, ...charts } };
};

const getUnsupportedTagLines = (content: DocumentContent): Set<string> =>
    new Set(
        getDocumentChartBlocks(content).flatMap((block) =>
            block.type === 'unsupportedTag' ? [block.line] : [],
        ),
    );

/**
 * Validate Document content for a write and return its canonical form: chart
 * tags carry only their id and charts not placed in the markdown are dropped.
 *
 * Content this release can't read (charts and block tags from a newer
 * release) is accepted only unchanged from `previous`, the version being
 * replaced. A client may leave such charts out; they are carried over.
 */
export const parseDocumentContent = (
    schemaVersion: number,
    raw: unknown,
    { previous }: { previous?: DocumentContent } = {},
): DocumentContent => {
    if (schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
        throw new ParameterError(
            `Unsupported Document schema version: ${schemaVersion}`,
        );
    }
    const { markdown, entries } = parseContentEnvelope(raw);
    const previousUnsupported = previous?.unsupportedCharts ?? {};
    const readEntries = Object.entries(entries).map(
        ([id, entry]) => [id, entry, readChartEntry(id, entry)] as const,
    );
    const newEntry = readEntries.find(
        ([id, entry, chart]) =>
            chart === undefined &&
            !(
                Object.hasOwn(previousUnsupported, id) &&
                isEqual(entry, previousUnsupported[id])
            ),
    );
    if (newEntry) {
        throw new ParameterError(
            `Chart "${newEntry[0]}" is ${describeChartEntry(newEntry[1])}, which this version doesn't support`,
        );
    }
    const blocks = getDocumentChartBlocks({
        markdown,
        charts: Object.fromEntries(
            readEntries.flatMap(([id, , chart]) =>
                chart === undefined ? [] : [[id, chart]],
            ),
        ),
        unsupportedCharts: {
            ...previousUnsupported,
            ...Object.fromEntries(
                readEntries.flatMap(([id, entry, chart]) =>
                    chart === undefined ? [[id, entry]] : [],
                ),
            ),
        },
    });
    const previousTags = previous
        ? getUnsupportedTagLines(previous)
        : new Set<string>();
    const newTag = blocks.find(
        (block) =>
            block.type === 'unsupportedTag' && !previousTags.has(block.line),
    );
    if (newTag?.type === 'unsupportedTag') {
        throw new ParameterError(
            `${newTag.line} isn't supported by this version`,
        );
    }
    return fromDocumentChartBlocks(blocks);
};

/**
 * Read stored Document content, keeping what this release can't read (charts
 * and block tags from a newer release) as unsupported content instead of
 * failing the whole Document.
 */
export const parseStoredDocumentContent = (raw: unknown): DocumentContent => {
    const { markdown, entries } = parseContentEnvelope(raw);
    // An invalid stored chart is shown as unsupported rather than failing the Document
    const readEntry = (id: string, entry: unknown) => {
        try {
            return readChartEntry(id, entry);
        } catch (error) {
            if (error instanceof ParameterError) {
                return undefined;
            }
            throw error;
        }
    };
    const readEntries = Object.entries(entries).map(
        ([id, entry]) => [id, entry, readEntry(id, entry)] as const,
    );
    return fromDocumentChartBlocks(
        getDocumentChartBlocks({
            markdown,
            charts: Object.fromEntries(
                readEntries.flatMap(([id, , chart]) =>
                    chart === undefined ? [] : [[id, chart]],
                ),
            ),
            unsupportedCharts: Object.fromEntries(
                readEntries.flatMap(([id, entry, chart]) =>
                    chart === undefined ? [[id, entry]] : [],
                ),
            ),
        }),
    );
};

const DOCUMENT_AS_CODE_KEYS = [
    'name',
    'slug',
    'description',
    'spaceSlug',
    'schemaVersion',
    'markdown',
    'charts',
    'unsupportedCharts',
] as const;

const isNonBlankString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '';

type DocumentAsCodeMetadata = Pick<
    DocumentAsCode,
    'name' | 'slug' | 'description' | 'spaceSlug'
>;

const parseDocumentAsCodeMetadata = (
    raw: Record<string, unknown>,
): DocumentAsCodeMetadata => {
    const { name, slug, description = '', spaceSlug } = raw;
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
    return { name, slug, description, spaceSlug };
};

const assertRecord: (
    value: unknown,
    message: string,
) => asserts value is Record<string, unknown> = (value, message) => {
    if (!isRecord(value)) {
        throw new ParameterError(message);
    }
};

/**
 * A Document as code, validated strictly for a write; an omitted description
 * is empty. Content this release can't read must be unchanged from
 * `previous`, as in `parseDocumentContent`.
 */
export const parseDocumentAsCode = (
    raw: unknown,
    { previous }: { previous?: DocumentContent } = {},
): DocumentAsCode => {
    assertRecord(raw, 'Document as code must be an object');
    const unknownKeys = Object.keys(raw).filter(
        (key) => !(DOCUMENT_AS_CODE_KEYS as readonly string[]).includes(key),
    );
    if (unknownKeys.length > 0) {
        throw new ParameterError(
            `Unknown Document fields: ${unknownKeys.join(', ')}`,
        );
    }
    const { schemaVersion } = raw;
    if (schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
        throw new ParameterError(
            `Unsupported Document schema version: ${String(schemaVersion)}`,
        );
    }
    return {
        ...parseDocumentAsCodeMetadata(raw),
        schemaVersion,
        ...parseDocumentContent(
            schemaVersion,
            {
                markdown: raw.markdown,
                charts: raw.charts ?? {},
                ...(raw.unsupportedCharts === undefined
                    ? {}
                    : { unsupportedCharts: raw.unsupportedCharts }),
            },
            { previous },
        ),
    };
};

/**
 * A Document file checked only for its outer shape, for clients such as the
 * CLI. Charts and fields this client doesn't know pass through for the server
 * to validate, so files from a newer release still upload.
 */
export const parseDocumentAsCodeFile = (raw: unknown): DocumentAsCode => {
    assertRecord(raw, 'Document as code must be an object');
    const { schemaVersion, markdown, charts = {}, unsupportedCharts } = raw;
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
        throw new ParameterError('Document schemaVersion must be an integer');
    }
    if (typeof markdown !== 'string') {
        throw new ParameterError('Document markdown must be a string');
    }
    assertRecord(charts, 'Document charts must be an object');
    const invalidChart = Object.entries(charts).find(
        ([, chart]) => !isRecord(chart) || typeof chart.source !== 'string',
    );
    if (invalidChart) {
        throw new ParameterError(
            `Document chart "${invalidChart[0]}" must be an object with a source`,
        );
    }
    if (unsupportedCharts !== undefined) {
        assertRecord(
            unsupportedCharts,
            'Document unsupportedCharts must be an object',
        );
    }
    // Typed as known charts; the server validates them on upload.
    return {
        ...raw,
        ...parseDocumentAsCodeMetadata(raw),
        markdown,
        charts,
    } as DocumentAsCode;
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
