import {
    getDimensions,
    getItemId,
    getMetrics,
    isExploreError,
    ParameterError,
    QuerySourceType,
    type MetricQuery,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import {
    createTdcpServer,
    TdcpDialects,
    TdcpMethods,
    type TdcpCatalog,
    type TdcpColumnSchema,
    type TdcpDataRequest,
    type TdcpQueryRequest,
} from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../ProjectService/ProjectService';
import type {
    LightdashTdcpServer,
    TdcpHostContext,
    TdcpLocalDataset,
} from '../host';
import { dimensionTypeToTdcpType } from '../typeMapping';

type SemanticLayerTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

const DEFAULT_SOURCE_QUERY_LIMIT = 500;

/**
 * The wire payload of a metricquery:lightdash query: the semantic layer
 * source query minus the envelope fields the adapter owns.
 */
type MetricQueryDialectPayload = Omit<
    SemanticLayerSourceQuery,
    'sourceType' | 'nodeId'
>;

/**
 * What tabular/capabilities advertises for params: enough for an agent to
 * compose a query from capabilities alone. Deep shapes (filters, table
 * calculations) are summarized, not exhaustively schematized — the explore
 * schema comes from tabular/catalog.
 */
const METRIC_QUERY_PAYLOAD_SCHEMA: Record<string, unknown> = {
    type: 'object',
    required: ['exploreName', 'dimensions', 'metrics'],
    additionalProperties: false,
    properties: {
        exploreName: {
            type: 'string',
            description: 'A table reference from tabular/catalog',
        },
        dimensions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dimension field ids (columns of the catalog table)',
        },
        metrics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Metric field ids (columns of the catalog table)',
        },
        filters: {
            type: 'object',
            description: 'Lightdash metric query filters shape',
        },
        sorts: {
            type: 'array',
            items: {
                type: 'object',
                required: ['fieldId', 'descending'],
                properties: {
                    fieldId: { type: 'string' },
                    descending: { type: 'boolean' },
                },
            },
        },
        limit: { type: 'integer', minimum: 1 },
        tableCalculations: { type: 'array' },
        additionalMetrics: { type: 'array' },
        customDimensions: { type: 'array' },
        timezone: { type: 'string' },
    },
};

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Structural floor for the params payload. In-process callers arrive
 * TSOA-validated; this is the guard that matters once the outbound endpoint
 * makes this a wire input, and the payloadSchema above is its contract.
 */
const parseMetricQueryPayload = (
    params: Record<string, unknown>,
): MetricQueryDialectPayload => {
    if (
        typeof params.exploreName !== 'string' ||
        !isStringArray(params.dimensions) ||
        !isStringArray(params.metrics)
    ) {
        throw new ParameterError(
            `Invalid ${TdcpDialects.LIGHTDASH_METRIC_QUERY} params: exploreName (string), dimensions and metrics (string arrays) are required`,
        );
    }
    if (params.limit !== undefined && typeof params.limit !== 'number') {
        throw new ParameterError(
            `Invalid ${TdcpDialects.LIGHTDASH_METRIC_QUERY} params: limit must be a number`,
        );
    }
    return params as MetricQueryDialectPayload;
};

/**
 * The project's semantic layer as an in-process TDCP server: explores are
 * the catalog tables, and tier 2 queries speak metricquery:lightdash
 * (structured form). This implementation is what the outbound TDCP server
 * will re-expose to external consumers — the "semantic layer as a source"
 * surface.
 */
class SemanticLayerTdcpHandlers {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    constructor(args: SemanticLayerTdcpServerArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
    }

    async catalog({
        account,
        projectUuid,
    }: TdcpHostContext): Promise<TdcpCatalog> {
        // Applies view-project authorization and explore-level user-attribute
        // filtering
        const summaries = await this.projectService.getAllExploresSummary(
            account,
            projectUuid,
            true,
            false,
        );

        // findExplores applies field-level user attributes: dimensions,
        // metrics and joined tables with required attributes the user lacks
        // are removed, matching what the explore endpoint returns
        const explores = await this.projectService.findExplores({
            account,
            projectUuid,
            exploreNames: summaries.map((summary) => summary.name),
        });

        const tables = summaries.map((summary) => {
            const explore = explores[summary.name];
            const columns: TdcpColumnSchema[] =
                explore === undefined || isExploreError(explore)
                    ? []
                    : [
                          ...getDimensions(explore)
                              .filter((dimension) => !dimension.hidden)
                              .map((dimension) => ({
                                  name: getItemId(dimension),
                                  type: dimensionTypeToTdcpType(dimension.type),
                                  sourceType: null,
                                  label: dimension.label ?? null,
                                  description: dimension.description ?? null,
                              })),
                          // Metrics are aggregations, so they surface as numbers
                          ...getMetrics(explore)
                              .filter((metric) => !metric.hidden)
                              .map((metric) => ({
                                  name: getItemId(metric),
                                  type: 'number' as const,
                                  sourceType: null,
                                  label: metric.label ?? null,
                                  description: metric.description ?? null,
                              })),
                      ];

            return {
                reference: summary.name,
                label: summary.label ?? null,
                description: summary.description ?? null,
                columns,
            };
        });

        return { tables, nextCursor: null };
    }

    async query(
        ctx: TdcpHostContext,
        queryRequest: TdcpQueryRequest,
    ): Promise<TdcpLocalDataset> {
        const payload = parseMetricQueryPayload(queryRequest.params ?? {});

        // The envelope limit is a result-row cap: the smaller of it and the
        // payload's own limit wins
        const payloadLimit = payload.limit ?? DEFAULT_SOURCE_QUERY_LIMIT;
        const metricQuery: MetricQuery = {
            exploreName: payload.exploreName,
            dimensions: payload.dimensions,
            metrics: payload.metrics,
            filters: payload.filters ?? {},
            sorts: payload.sorts ?? [],
            limit:
                queryRequest.limit !== undefined
                    ? Math.min(payloadLimit, queryRequest.limit)
                    : payloadLimit,
            tableCalculations: payload.tableCalculations ?? [],
            additionalMetrics: payload.additionalMetrics,
            customDimensions: payload.customDimensions,
            timezone: payload.timezone,
        };

        const results = await this.asyncQueryService.executeAsyncMetricQuery({
            account: ctx.account,
            projectUuid: ctx.projectUuid,
            metricQuery,
            context: ctx.queryContext,
        });

        return { queryUuid: results.queryUuid };
    }
}

/** SemanticLayerSourceQuery -> protocol request, owned by this server module. */
export const semanticLayerSourceQueryToDataRequest = (
    query: SourceQuery,
): TdcpDataRequest => {
    if (query.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
        throw new ParameterError(
            `Expected a ${QuerySourceType.SEMANTIC_LAYER} query`,
        );
    }
    const { sourceType, nodeId, ...payload } = query;
    return {
        method: TdcpMethods.QUERY,
        dialect: TdcpDialects.LIGHTDASH_METRIC_QUERY,
        params: payload,
        limit: query.limit,
    };
};

export const createSemanticLayerTdcpServer = (
    args: SemanticLayerTdcpServerArguments,
): LightdashTdcpServer => {
    const handlers = new SemanticLayerTdcpHandlers(args);
    return createTdcpServer({
        catalog: handlers.catalog.bind(handlers),
        queryDialects: [
            {
                dialect: TdcpDialects.LIGHTDASH_METRIC_QUERY,
                form: 'structured',
                payloadSchema: METRIC_QUERY_PAYLOAD_SCHEMA,
                docsUrl: null,
            },
        ],
        query: handlers.query.bind(handlers),
    });
};
