import {
    getDimensions,
    getItemId,
    getMetrics,
    isExploreError,
    ParameterError,
    type MetricQuery,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import {
    createTdcpServer,
    TdcpDialects,
    type TdcpCatalog,
    type TdcpColumnSchema,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
    type TdcpServer,
} from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../ProjectService/ProjectService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
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
 * The project's semantic layer as an in-process TDCP server: explores are
 * the catalog tables, and tier 2 queries speak metricquery:lightdash. This
 * is also, verbatim, what the outbound TDCP server exposes to external
 * consumers — the "semantic layer as a source" surface.
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
    }: TdcpCatalogContext): Promise<TdcpCatalog> {
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
                                  label: dimension.label ?? null,
                                  description: dimension.description ?? null,
                              })),
                          // Metrics are aggregations, so they surface as numbers
                          ...getMetrics(explore)
                              .filter((metric) => !metric.hidden)
                              .map((metric) => ({
                                  name: getItemId(metric),
                                  type: 'number' as const,
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

        return { tables };
    }

    async query(
        ctx: TdcpRequestContext,
        queryRequest: TdcpQueryRequest,
    ): Promise<TdcpDatasetDescriptor> {
        let payload: MetricQueryDialectPayload;
        try {
            payload = JSON.parse(queryRequest.query);
        } catch (e) {
            throw new ParameterError(
                `Invalid ${TdcpDialects.LIGHTDASH_METRIC_QUERY} payload: expected JSON`,
            );
        }

        // Only exploreName/dimensions/metrics are required on the wire; the
        // rest defaults to the empty metric query here
        const metricQuery: MetricQuery = {
            exploreName: payload.exploreName,
            dimensions: payload.dimensions,
            metrics: payload.metrics,
            filters: payload.filters ?? {},
            sorts: payload.sorts ?? [],
            limit:
                payload.limit ??
                queryRequest.limit ??
                DEFAULT_SOURCE_QUERY_LIMIT,
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

        return localDatasetDescriptor({
            queryUuid: results.queryUuid,
            expiresAt: this.asyncQueryService.getCacheExpiresAt(new Date()),
        });
    }
}

export const createSemanticLayerTdcpServer = (
    args: SemanticLayerTdcpServerArguments,
): TdcpServer<TdcpCatalogContext, TdcpRequestContext> => {
    const handlers = new SemanticLayerTdcpHandlers(args);
    return createTdcpServer({
        catalog: handlers.catalog.bind(handlers),
        queryDialects: [TdcpDialects.LIGHTDASH_METRIC_QUERY],
        query: handlers.query.bind(handlers),
    });
};
