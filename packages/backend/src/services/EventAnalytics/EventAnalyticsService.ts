import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getFieldMap,
    isExploreError,
    QueryExecutionContext,
    resolveEventAnalyticsDateRange,
    type EventNamesRequest,
    type Explore,
    type FunnelQueryRequest,
    type FunnelQueryResult,
    type RetentionQueryRequest,
    type RetentionQueryResult,
    type SessionUser,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { ConnectionBinding } from '../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { traceSpan } from '../../tracing/tracing';
import { BaseService } from '../BaseService';
import type { ProjectService } from '../ProjectService/ProjectService';
import {
    buildEventNamesSql,
    compileEventAnalyticsFilterSql,
    getDimensionFromFieldMap,
} from './eventAnalyticsSql';
import { generateFunnelSql } from './funnelSql';
import { generateRetentionSql, parseRetentionRows } from './retentionSql';

type EventAnalyticsServiceArguments = {
    analytics: LightdashAnalytics;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    projectService: ProjectService;
};

type ExploreQueryContext = {
    explore: Explore;
    sqlBuilder: WarehouseSqlBuilder;
    binding: ConnectionBinding;
};

/** Runs funnel and retention queries over an explore used as an event stream. */
export class EventAnalyticsService extends BaseService {
    private analytics: LightdashAnalytics;

    private featureFlagModel: FeatureFlagModel;

    private projectModel: ProjectModel;

    private projectService: ProjectService;

    constructor({
        analytics,
        featureFlagModel,
        projectModel,
        projectService,
    }: EventAnalyticsServiceArguments) {
        super({ serviceName: 'EventAnalyticsService' });
        this.analytics = analytics;
        this.featureFlagModel = featureFlagModel;
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    /**
     * Checks that the feature is enabled and the user can run raw SQL in the
     * project. Event analytics queries bypass the semantic layer, so they need
     * the SQL Runner permission.
     */
    private async assertCanQuery(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid, name: projectName } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You need SQL Runner access in this project to run event analytics',
            );
        }

        const { enabled } = await this.featureFlagModel.get({
            user: { organizationUuid, userUuid: user.userUuid },
            featureFlagId: FeatureFlags.EventAnalytics,
        });
        if (!enabled) {
            throw new ForbiddenError('Event analytics is not enabled');
        }

        return { organizationUuid };
    }

    private async getExploreQueryContext(
        projectUuid: string,
        exploreName: string,
    ): Promise<ExploreQueryContext> {
        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );

        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${exploreName} has errors: ${explore.errors
                    .map((e) => e.message)
                    .join(', ')}`,
            );
        }

        const binding: ConnectionBinding = {
            kind: 'explore',
            exploreName: explore.name,
        };
        const { type, startOfWeek } =
            await this.projectService.getWarehouseSqlBuilderSettings(
                projectUuid,
                binding,
            );

        return {
            explore,
            sqlBuilder: warehouseSqlBuilderFromType(type, startOfWeek),
            binding,
        };
    }

    /** Gets the distinct event names seen in the request's date range. */
    async getEventNames(
        user: SessionUser,
        projectUuid: string,
        request: EventNamesRequest,
    ): Promise<string[]> {
        return traceSpan(
            {
                op: 'EventAnalyticsService.getEventNames',
                name: 'EventAnalyticsService.getEventNames',
                attributes: { projectUuid, exploreName: request.exploreName },
            },
            async () => {
                await this.assertCanQuery(user, projectUuid);

                const { explore, sqlBuilder, binding } =
                    await this.getExploreQueryContext(
                        projectUuid,
                        request.exploreName,
                    );
                const fieldMap = getFieldMap(explore);
                const { start, end } = resolveEventAnalyticsDateRange(
                    request.dateRange,
                );

                const sql = buildEventNamesSql({
                    explore,
                    sqlBuilder,
                    eventField: getDimensionFromFieldMap(
                        fieldMap,
                        request.eventNameFieldId,
                    ),
                    timestampField: getDimensionFromFieldMap(
                        fieldMap,
                        request.timestampFieldId,
                    ),
                    start,
                    end,
                    filterSql: compileEventAnalyticsFilterSql({
                        filters: request.filters,
                        explore,
                        sqlBuilder,
                        timezone: 'UTC',
                    }),
                });

                const { rows } = await this.runSql(
                    user,
                    projectUuid,
                    sql,
                    binding,
                );

                return rows
                    .map((row) => row.event_name)
                    .filter(
                        (value): value is string =>
                            typeof value === 'string' && value.length > 0,
                    );
            },
        );
    }

    /** Runs a funnel query and returns conversion per step. */
    async runFunnelQuery(
        user: SessionUser,
        projectUuid: string,
        request: FunnelQueryRequest,
    ): Promise<FunnelQueryResult> {
        return traceSpan(
            {
                op: 'EventAnalyticsService.runFunnelQuery',
                name: 'EventAnalyticsService.runFunnelQuery',
                attributes: {
                    projectUuid,
                    exploreName: request.exploreName,
                    stepCount: request.steps.length,
                },
            },
            async () => {
                const { organizationUuid } = await this.assertCanQuery(
                    user,
                    projectUuid,
                );
                const { explore, sqlBuilder, binding } =
                    await this.getExploreQueryContext(
                        projectUuid,
                        request.exploreName,
                    );

                const sql = generateFunnelSql({
                    request,
                    explore,
                    sqlBuilder,
                    timezone: 'UTC',
                    now: new Date(),
                });
                const { rows, durationMs } = await this.runSql(
                    user,
                    projectUuid,
                    sql,
                    binding,
                );

                this.analytics.track({
                    event: 'funnel.query_executed',
                    userId: user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        exploreName: request.exploreName,
                        warehouseType: sqlBuilder.getAdapterType(),
                        stepCount: request.steps.length,
                        hasBreakdown: !!request.breakdownDimensionId,
                        hasConversionWindow: !!request.conversionWindow,
                        hasFilters: !!request.filters?.dimensions,
                        dateRangeType: request.dateRange.type,
                        durationMs,
                        rowCount: rows.length,
                    },
                });

                return {
                    steps: rows.map((row) => ({
                        stepOrder: Number(row.step_order),
                        stepName: String(row.step_name),
                        totalUsers: Number(row.total_users),
                        conversionRate: Number(row.conversion_rate),
                        stepConversionRate: Number(row.step_conversion_rate),
                        medianTimeToConvertSeconds:
                            row.median_time_to_convert == null
                                ? null
                                : Number(row.median_time_to_convert),
                        breakdownValue:
                            row.breakdown_value == null
                                ? undefined
                                : String(row.breakdown_value),
                    })),
                    sql,
                    durationMs,
                };
            },
        );
    }

    /** Runs a retention query and returns the cohort matrix. */
    async runRetentionQuery(
        user: SessionUser,
        projectUuid: string,
        request: RetentionQueryRequest,
    ): Promise<RetentionQueryResult> {
        return traceSpan(
            {
                op: 'EventAnalyticsService.runRetentionQuery',
                name: 'EventAnalyticsService.runRetentionQuery',
                attributes: {
                    projectUuid,
                    exploreName: request.exploreName,
                    unit: request.unit,
                    periods: request.periods,
                },
            },
            async () => {
                const { organizationUuid } = await this.assertCanQuery(
                    user,
                    projectUuid,
                );
                const { explore, sqlBuilder, binding } =
                    await this.getExploreQueryContext(
                        projectUuid,
                        request.exploreName,
                    );

                const now = new Date();
                const sql = generateRetentionSql({
                    request,
                    explore,
                    sqlBuilder,
                    timezone: 'UTC',
                    now,
                });
                const { rows, durationMs } = await this.runSql(
                    user,
                    projectUuid,
                    sql,
                    binding,
                );
                const { cohorts, averages } = parseRetentionRows(
                    rows,
                    request,
                    now,
                );

                this.analytics.track({
                    event: 'retention.query_executed',
                    userId: user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        exploreName: request.exploreName,
                        warehouseType: sqlBuilder.getAdapterType(),
                        unit: request.unit,
                        periods: request.periods,
                        cohortType: request.cohortType,
                        criteria: request.criteria,
                        mode: request.mode,
                        anyReturnEvent: request.returnEvent === null,
                        hasBreakdown: !!request.breakdownDimensionId,
                        hasFilters: !!request.filters?.dimensions,
                        dateRangeType: request.dateRange.type,
                        durationMs,
                        rowCount: rows.length,
                        cohortCount: cohorts.length,
                    },
                });

                return {
                    unit: request.unit,
                    periods: request.periods,
                    cohorts,
                    averages,
                    sql,
                    durationMs,
                };
            },
        );
    }

    /** Runs the SQL and returns its rows with the wall-clock duration. */
    private async runSql(
        user: SessionUser,
        projectUuid: string,
        sql: string,
        binding: ConnectionBinding,
    ): Promise<{ rows: Record<string, unknown>[]; durationMs: number }> {
        this.logger.debug('Running event analytics query', { sql });
        const startedAt = Date.now();
        try {
            const results = await this.projectService.runSqlQuery(
                user,
                projectUuid,
                sql,
                binding,
                QueryExecutionContext.EVENT_ANALYTICS,
            );
            return { rows: results.rows, durationMs: Date.now() - startedAt };
        } catch (error) {
            this.logger.error('Event analytics query failed', { sql, error });
            throw error;
        }
    }
}
