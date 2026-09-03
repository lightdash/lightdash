import {
    DimensionType,
    getDimensions,
    getItemId,
    getMetrics,
    isExploreError,
    ParameterError,
    QuerySourceType,
    type MetricQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceSchemaColumn,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../ProjectService/ProjectService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type SemanticLayerQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

const DEFAULT_SOURCE_QUERY_LIMIT = 500;

/**
 * The project's semantic layer as a query source: explores are the tables,
 * their dimensions and metrics are the columns, and queries are metric
 * queries compiled through the explore.
 */
export class SemanticLayerQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        label: 'Semantic layer',
        description:
            'Metric queries against the explores of this project. Tables are explores; columns are their dimensions and metrics, referenced by field id. Result columns are named by field id — exactly the dimensions and metrics requested.',
    };

    readonly supportsPivot = true;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    constructor(args: SemanticLayerQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
    }

    private static assertSourceQuery(
        query: SourceQuery,
    ): SemanticLayerSourceQuery {
        if (query.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.SEMANTIC_LAYER} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    async scanSchema({
        account,
        projectUuid,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
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
            const columns: QuerySourceSchemaColumn[] =
                explore === undefined || isExploreError(explore)
                    ? []
                    : [
                          ...getDimensions(explore)
                              .filter((dimension) => !dimension.hidden)
                              .map((dimension) => ({
                                  reference: getItemId(dimension),
                                  type: dimension.type,
                                  label: dimension.label ?? null,
                                  description: dimension.description ?? null,
                              })),
                          // Metrics are aggregations, so they surface as numbers
                          ...getMetrics(explore)
                              .filter((metric) => !metric.hidden)
                              .map((metric) => ({
                                  reference: getItemId(metric),
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

        return {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            tables,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(): string[] {
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        parameters,
        userAttributeOverrides,
        invalidateCache,
        pivotConfiguration,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = SemanticLayerQuerySource.assertSourceQuery(query);

        // Only exploreName/dimensions/metrics are required on the wire; the
        // rest defaults to the empty metric query here
        const metricQuery: MetricQuery = {
            exploreName: sourceQuery.exploreName,
            dimensions: sourceQuery.dimensions,
            metrics: sourceQuery.metrics,
            filters: sourceQuery.filters ?? {},
            sorts: sourceQuery.sorts ?? [],
            limit: sourceQuery.limit ?? DEFAULT_SOURCE_QUERY_LIMIT,
            tableCalculations: sourceQuery.tableCalculations ?? [],
            additionalMetrics: sourceQuery.additionalMetrics,
            customDimensions: sourceQuery.customDimensions,
            timezone: sourceQuery.timezone,
        };

        const results = await this.asyncQueryService.executeAsyncMetricQuery({
            account,
            projectUuid,
            metricQuery,
            context,
            parameters,
            userAttributeOverrides,
            invalidateCache,
            pivotConfiguration: pivotConfiguration ?? undefined,
        });

        return { queryUuid: results.queryUuid };
    }
}
