import { subject } from '@casl/ability';
import {
    ForbiddenError,
    FunnelQueryRequest,
    FunnelQueryResult,
    FunnelStepResult,
    getFieldMap,
    isExploreError,
    SessionUser,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../config/parseConfig';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { ConnectionBinding } from '../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { traceSpan } from '../../tracing/tracing';
import { BaseService } from '../BaseService';
import type { ProjectService } from '../ProjectService/ProjectService';
import { generateFunnelSql, getDimensionFromFieldMap } from './funnelSql';

type FunnelServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    projectService: ProjectService;
};

export class FunnelService extends BaseService {
    private analytics: LightdashAnalytics;

    private lightdashConfig: LightdashConfig;

    private projectModel: ProjectModel;

    private projectService: ProjectService;

    constructor({
        analytics,
        lightdashConfig,
        projectModel,
        projectService,
    }: FunnelServiceArguments) {
        super({ serviceName: 'FunnelService' });
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    private async checkCanAccessFunnelBuilder(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (!this.lightdashConfig.funnelBuilder.enabled) {
            throw new ForbiddenError('Funnel Builder feature is not enabled');
        }

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
                op: 'FunnelService.getEventNames',
                name: 'FunnelService.getEventNames',
                attributes: {
                    projectUuid,
                    exploreName,
                },
            },
            async () => {
                await this.checkCanAccessFunnelBuilder(user, projectUuid);

                const exploreResult =
                    await this.projectModel.getExploreFromCache(
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

                const explore = exploreResult;
                const fieldMap = getFieldMap(explore);
                const eventField = getDimensionFromFieldMap(
                    fieldMap,
                    eventDimensionId,
                );
                const timestampField = getDimensionFromFieldMap(
                    fieldMap,
                    timestampFieldId,
                );
                const baseTableSql = explore.tables[explore.baseTable].sqlTable;
                const baseTableName = explore.baseTable;

                const exploreBinding: ConnectionBinding = {
                    kind: 'explore',
                    exploreName: explore.name,
                };
                const { type } =
                    await this.projectService.getWarehouseSqlBuilderSettings(
                        projectUuid,
                        exploreBinding,
                    );
                const sqlBuilder = warehouseSqlBuilderFromType(type);

                // Filter to last 30 days to limit scan cost
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const quoteChar = sqlBuilder.getFieldQuoteChar();

                const sql = `
            SELECT DISTINCT ${
                eventField.compiledSql
            } AS ${quoteChar}event_name${quoteChar}
            FROM ${baseTableSql} AS ${quoteChar}${baseTableName}${quoteChar}
            WHERE ${eventField.compiledSql} IS NOT NULL
              AND ${timestampField.compiledSql} >= ${sqlBuilder.castToTimestamp(
                  thirtyDaysAgo,
              )}
            ORDER BY ${quoteChar}event_name${quoteChar}
            LIMIT 1000
        `;

                try {
                    const results = await this.projectService.runSqlQuery(
                        user,
                        projectUuid,
                        sql,
                        exploreBinding,
                    );

                    return results.rows
                        .map((r) => r.event_name as string)
                        .filter(
                            (val): val is string =>
                                val !== null && val !== undefined,
                        );
                } catch (error) {
                    this.logger.error('Failed to fetch event names', {
                        sql,
                        error,
                    });
                    throw error;
                }
            },
        );
    }

    async runFunnelQuery(
        user: SessionUser,
        projectUuid: string,
        request: FunnelQueryRequest,
    ): Promise<FunnelQueryResult> {
        return traceSpan(
            {
                op: 'FunnelService.runFunnelQuery',
                name: 'FunnelService.runFunnelQuery',
                attributes: {
                    projectUuid,
                    exploreName: request.exploreName,
                    stepCount: request.steps.length,
                },
            },
            async () => {
                await this.checkCanAccessFunnelBuilder(user, projectUuid);

                const exploreResult =
                    await this.projectModel.getExploreFromCache(
                        projectUuid,
                        request.exploreName,
                    );

                if (isExploreError(exploreResult)) {
                    throw new ForbiddenError(
                        `Explore ${
                            request.exploreName
                        } has errors: ${exploreResult.errors
                            .map((e) => e.message)
                            .join(', ')}`,
                    );
                }

                const explore = exploreResult;

                const exploreBinding: ConnectionBinding = {
                    kind: 'explore',
                    exploreName: explore.name,
                };
                const { type } =
                    await this.projectService.getWarehouseSqlBuilderSettings(
                        projectUuid,
                        exploreBinding,
                    );
                const sqlBuilder = warehouseSqlBuilderFromType(type);

                const sql = generateFunnelSql(request, explore, sqlBuilder);

                this.logger.debug('Running funnel query', { sql });

                try {
                    const results = await this.projectService.runSqlQuery(
                        user,
                        projectUuid,
                        sql,
                        exploreBinding,
                    );

                    // Map rows directly - conversion rates are computed in SQL
                    const steps: FunnelStepResult[] = results.rows.map(
                        (row) => ({
                            stepOrder: Number(row.step_order),
                            stepName: row.step_name as string,
                            totalUsers: Number(row.total_users),
                            conversionRate: Number(row.conversion_rate),
                            stepConversionRate: Number(
                                row.step_conversion_rate,
                            ),
                            medianTimeToConvertSeconds:
                                row.median_time_to_convert != null
                                    ? Number(row.median_time_to_convert)
                                    : null,
                            breakdownValue: row.breakdown_value as
                                | string
                                | undefined,
                        }),
                    );

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    this.analytics.track({
                        event: 'funnel.query_executed',
                        userId: user.userUuid,
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            exploreName: request.exploreName,
                            stepCount: request.steps.length,
                            hasBreakdown: !!request.breakdownDimensionId,
                            hasConversionWindow: !!request.conversionWindow,
                        },
                    });

                    return {
                        steps,
                        sql,
                    };
                } catch (error) {
                    this.logger.error('Failed to run funnel query', {
                        sql,
                        error,
                    });
                    throw error;
                }
            },
        );
    }
}
