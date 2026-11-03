import {
    ForbiddenError,
    isExploreError,
    ParameterError,
    QuerySourceType,
    type FeatureFlags,
    type FunnelSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { ConnectionBinding } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import { generateFunnelSql } from '../../FunnelService/funnelSql';
import type { ProjectService } from '../../ProjectService/ProjectService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
} from '../types';
import { scanExploreTables } from './SemanticLayerQuerySource';

type FunnelQuerySourceArguments = {
    asyncQueryService: Pick<AsyncQueryService, 'executeAsyncSqlQuery'>;
    projectService: Pick<
        ProjectService,
        | 'getAllExploresSummary'
        | 'findExplores'
        | 'getWarehouseSqlBuilderSettings'
    >;
    projectModel: Pick<
        ProjectModel,
        'getExploreFromCache' | 'resolveWarehouseCredentialRead'
    >;
};

/**
 * Conversion funnels as a query source: a declarative funnel over an
 * explore's event rows, compiled to warehouse SQL by the funnel builder.
 */
export class FunnelQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.FUNNEL,
        label: 'Funnel',
        description:
            'Conversion funnels over the event rows of an explore. Name the explore and three of its dimensions by field id: who (userIdFieldId), when (timestampFieldId) and what happened (eventNameFieldId). Steps are ordered event names, at least two; a user counts in a step only after completing every earlier step, within the conversion window of the previous one (default 30 days). Result columns are fixed, one row per step (per breakdown value when breakdownDimensionId is set): step_order, step_name, total_users, conversion_rate (% of step 1), step_conversion_rate (% of the previous step), median_time_to_convert (seconds from the previous step, null on step 1) and breakdown_value. Tables are explores; columns are their dimensions.',
    };

    readonly supportsPivot = false;

    readonly requiredFeatureFlags: FeatureFlags[] = [];

    private readonly asyncQueryService: FunnelQuerySourceArguments['asyncQueryService'];

    private readonly projectService: FunnelQuerySourceArguments['projectService'];

    private readonly projectModel: FunnelQuerySourceArguments['projectModel'];

    constructor(args: FunnelQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
        this.projectModel = args.projectModel;
    }

    private static assertSourceQuery(query: SourceQuery): FunnelSourceQuery {
        if (query.sourceType !== QuerySourceType.FUNNEL) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.FUNNEL} query, got "${query.sourceType}"`,
            );
        }
        if (query.steps.length < 2) {
            throw new ParameterError('A funnel needs at least two steps');
        }
        return query;
    }

    async scanSchema({
        account,
        projectUuid,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return {
            sourceType: QuerySourceType.FUNNEL,
            tables: await scanExploreTables({
                projectService: this.projectService,
                account,
                projectUuid,
                includeMetrics: false,
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
    }: SubmitSourceQueryArgs): Promise<SourceQuerySubmissionResult> {
        const sourceQuery = FunnelQuerySource.assertSourceQuery(query);

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            sourceQuery.exploreName,
        );
        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${sourceQuery.exploreName} has errors: ${explore.errors
                    .map((e) => e.message)
                    .join(', ')}`,
            );
        }

        const binding: ConnectionBinding = {
            kind: 'explore',
            exploreName: explore.name,
        };
        const [{ type }, connection] = await Promise.all([
            this.projectService.getWarehouseSqlBuilderSettings(
                projectUuid,
                binding,
            ),
            this.projectModel.resolveWarehouseCredentialRead(
                projectUuid,
                binding,
            ),
        ]);
        const sql = generateFunnelSql(
            sourceQuery,
            explore,
            warehouseSqlBuilderFromType(type),
        );

        // Inherits manage:SqlRunner from the SQL runner path, like
        // FunnelService; compiled SQL should eventually be gated like a metric query
        const results = await this.asyncQueryService.executeAsyncSqlQuery({
            account,
            projectUuid,
            sql,
            limit: sourceQuery.limit,
            context,
            querySurface,
            parameters,
            userAttributeOverrides,
            invalidateCache,
            warehouseConnectionUuid:
                connection.kind === 'extra'
                    ? connection.warehouseConnectionUuid
                    : null,
        });

        return {
            queryUuid: results.queryUuid,
            cacheHit: results.cacheMetadata.cacheHit,
        };
    }
}
