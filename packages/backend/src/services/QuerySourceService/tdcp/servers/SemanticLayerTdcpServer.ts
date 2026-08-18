import {
    DimensionType,
    getDimensions,
    getItemId,
    getMetrics,
    isExploreError,
    ParameterError,
    TDCP_PROTOCOL_REVISION,
    TdcpDialects,
    TdcpMethods,
    type MetricQuery,
    type SemanticLayerSourceQuery,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpColumnSchema,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
} from '@lightdash/common';
import type { ProjectModel } from '../../../../models/ProjectModel/ProjectModel';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../ProjectService/ProjectService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
    type TdcpServer,
} from '../TdcpServer';

type SemanticLayerTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
    projectModel: ProjectModel;
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
export class SemanticLayerTdcpServer implements TdcpServer {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    private readonly projectModel: ProjectModel;

    constructor(args: SemanticLayerTdcpServerArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
        this.projectModel = args.projectModel;
    }

    // eslint-disable-next-line class-methods-use-this
    async capabilities(): Promise<TdcpCapabilities> {
        return {
            revision: TDCP_PROTOCOL_REVISION,
            // @oliver: tier 0 read could mean "all fields of the explore at
            // its natural grain" — attractive for agents, but grain traps.
            // Left off until we decide.
            read: false,
            scan: false,
            queryDialects: [TdcpDialects.LIGHTDASH_METRIC_QUERY],
            compose: false,
        };
    }

    async catalog({
        account,
        projectUuid,
    }: TdcpCatalogContext): Promise<TdcpCatalog> {
        // Applies view-project authorization and user-attribute filtering
        const summaries = await this.projectService.getAllExploresSummary(
            account,
            projectUuid,
            true,
            false,
        );

        const explores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            summaries.map((summary) => summary.name),
        );

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
                                  type: dimension.type,
                                  label: dimension.label ?? null,
                                  description: dimension.description ?? null,
                              })),
                          // Metrics are aggregations, so they surface as numbers
                          ...getMetrics(explore)
                              .filter((metric) => !metric.hidden)
                              .map((metric) => ({
                                  name: getItemId(metric),
                                  type: DimensionType.NUMBER,
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
        request: TdcpDataRequest,
    ): Promise<TdcpDatasetDescriptor> {
        if (
            request.method !== TdcpMethods.QUERY ||
            request.dialect !== TdcpDialects.LIGHTDASH_METRIC_QUERY
        ) {
            throw new ParameterError(
                `The semantic layer source only accepts ${TdcpMethods.QUERY} requests in the ${TdcpDialects.LIGHTDASH_METRIC_QUERY} dialect`,
            );
        }

        let payload: MetricQueryDialectPayload;
        try {
            payload = JSON.parse(request.query);
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
            limit: payload.limit ?? request.limit ?? DEFAULT_SOURCE_QUERY_LIMIT,
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
