import {
    DimensionType,
    getDimensions,
    getItemId,
    getMetrics,
    isExploreError,
    metricQueryOfSemanticNode,
    ParameterError,
    QuerySourceType,
    type FeatureFlags,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceSchemaColumn,
    type QuerySourceSchemaTable,
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

/**
 * Explores as schema tables, their visible fields as columns. Applies the
 * same view-project and user-attribute filtering as the explore endpoints.
 */
export const scanExploreTables = async ({
    projectService,
    account,
    projectUuid,
    includeMetrics,
}: ScanSchemaArgs & {
    projectService: Pick<
        ProjectService,
        'getAllExploresSummary' | 'findExplores'
    >;
    includeMetrics: boolean;
}): Promise<QuerySourceSchemaTable[]> => {
    const summaries = await projectService.getAllExploresSummary(
        account,
        projectUuid,
        true,
        false,
    );

    // findExplores applies field-level user attributes: dimensions, metrics
    // and joined tables with required attributes the user lacks are removed
    const explores = await projectService.findExplores({
        account,
        projectUuid,
        exploreNames: summaries.map((summary) => summary.name),
    });

    return summaries.map((summary) => {
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
                      ...(includeMetrics ? getMetrics(explore) : [])
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
};

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

    readonly requiredFeatureFlags: FeatureFlags[] = [];

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
        return {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            tables: await scanExploreTables({
                projectService: this.projectService,
                account,
                projectUuid,
                includeMetrics: true,
            }),
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
        querySurface,
        query,
        parameters,
        userAttributeOverrides,
        invalidateCache,
        pivotConfiguration,
        documentQueryContext,
    }: SubmitSourceQueryArgs): Promise<{
        queryUuid: string;
        cacheHit: boolean;
    }> {
        const sourceQuery = SemanticLayerQuerySource.assertSourceQuery(query);

        const metricQuery = metricQueryOfSemanticNode(sourceQuery);

        const results = await this.asyncQueryService.executeAsyncMetricQuery({
            ...(documentQueryContext ? { documentQueryContext } : {}),
            account,
            projectUuid,
            metricQuery,
            context,
            querySurface,
            parameters: { ...parameters, ...sourceQuery.parameters },
            userAttributeOverrides,
            invalidateCache,
            pivotConfiguration: pivotConfiguration ?? undefined,
        });

        return {
            queryUuid: results.queryUuid,
            cacheHit: results.cacheMetadata.cacheHit,
        };
    }
}
