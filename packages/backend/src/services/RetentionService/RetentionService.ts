import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getFieldMap,
    isExploreError,
    type Explore,
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
import {
    buildEventNamesSql,
    getDimensionFromFieldMap,
} from '../EventAnalytics/eventAnalyticsSql';
import type { ProjectService } from '../ProjectService/ProjectService';
import { generateRetentionSql, parseRetentionRows } from './retentionSql';

type RetentionServiceArguments = {
    analytics: LightdashAnalytics;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    projectService: ProjectService;
};

export class RetentionService extends BaseService {
    private analytics: LightdashAnalytics;

    private featureFlagModel: FeatureFlagModel;

    private projectModel: ProjectModel;

    private projectService: ProjectService;

    constructor({
        analytics,
        featureFlagModel,
        projectModel,
        projectService,
    }: RetentionServiceArguments) {
        super({ serviceName: 'RetentionService' });
        this.analytics = analytics;
        this.featureFlagModel = featureFlagModel;
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    private async checkCanAccessRetentionBuilder(
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
                'User does not have access to SQL Runner in this project',
            );
        }

        const { enabled } = await this.featureFlagModel.get({
            user: { organizationUuid, userUuid: user.userUuid },
            featureFlagId: FeatureFlags.RetentionBuilder,
        });
        if (!enabled) {
            throw new ForbiddenError('Retention builder is not enabled');
        }

        return { organizationUuid };
    }

    private async getExploreAndSqlBuilder(
        projectUuid: string,
        exploreName: string,
    ): Promise<{
        explore: Explore;
        sqlBuilder: WarehouseSqlBuilder;
        binding: ConnectionBinding;
    }> {
        const exploreResult = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );

        if (isExploreError(exploreResult)) {
            throw new ForbiddenError(
                `Explore ${exploreName} has errors: ${exploreResult.errors
                    .map((e) => e.message)
                    .join(', ')}`,
            );
        }

        const binding: ConnectionBinding = {
            kind: 'explore',
            exploreName: exploreResult.name,
        };
        const { type, startOfWeek } =
            await this.projectService.getWarehouseSqlBuilderSettings(
                projectUuid,
                binding,
            );

        return {
            explore: exploreResult,
            sqlBuilder: warehouseSqlBuilderFromType(type, startOfWeek),
            binding,
        };
    }

    async getEventNames(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        eventDimensionId: string,
        timestampFieldId: string,
    ): Promise<string[]> {
        return traceSpan(
            {
                op: 'RetentionService.getEventNames',
                name: 'RetentionService.getEventNames',
                attributes: { projectUuid, exploreName },
            },
            async () => {
                await this.checkCanAccessRetentionBuilder(user, projectUuid);

                const { explore, sqlBuilder, binding } =
                    await this.getExploreAndSqlBuilder(
                        projectUuid,
                        exploreName,
                    );
                const fieldMap = getFieldMap(explore);

                // Filter to last 30 days to limit scan cost
                const since = new Date();
                since.setDate(since.getDate() - 30);

                const sql = buildEventNamesSql({
                    explore,
                    sqlBuilder,
                    eventField: getDimensionFromFieldMap(
                        fieldMap,
                        eventDimensionId,
                    ),
                    timestampField: getDimensionFromFieldMap(
                        fieldMap,
                        timestampFieldId,
                    ),
                    since,
                });

                const results = await this.projectService.runSqlQuery(
                    user,
                    projectUuid,
                    sql,
                    binding,
                );

                return results.rows
                    .map((r) => r.event_name)
                    .filter(
                        (val): val is string =>
                            typeof val === 'string' && val.length > 0,
                    );
            },
        );
    }

    async runRetentionQuery(
        user: SessionUser,
        projectUuid: string,
        request: RetentionQueryRequest,
    ): Promise<RetentionQueryResult> {
        return traceSpan(
            {
                op: 'RetentionService.runRetentionQuery',
                name: 'RetentionService.runRetentionQuery',
                attributes: {
                    projectUuid,
                    exploreName: request.exploreName,
                    unit: request.unit,
                    periods: request.periods,
                },
            },
            async () => {
                const { organizationUuid } =
                    await this.checkCanAccessRetentionBuilder(
                        user,
                        projectUuid,
                    );

                const { explore, sqlBuilder, binding } =
                    await this.getExploreAndSqlBuilder(
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

                this.logger.debug('Running retention query', { sql });

                try {
                    const results = await this.projectService.runSqlQuery(
                        user,
                        projectUuid,
                        sql,
                        binding,
                    );

                    const { cohorts, averages } = parseRetentionRows(
                        results.rows,
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
                            unit: request.unit,
                            periods: request.periods,
                            cohortType: request.cohortType,
                            criteria: request.criteria,
                            mode: request.mode,
                            anyReturnEvent: request.returnEvent === null,
                            hasBreakdown: !!request.breakdownDimensionId,
                            hasFilters: !!request.filters?.dimensions,
                        },
                    });

                    return {
                        unit: request.unit,
                        periods: request.periods,
                        cohorts,
                        averages,
                        sql,
                    };
                } catch (error) {
                    this.logger.error('Failed to run retention query', {
                        sql,
                        error,
                    });
                    throw error;
                }
            },
        );
    }
}
