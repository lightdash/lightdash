import { subject } from '@casl/ability';
import {
    ApiCreateSqlChart,
    CreateSqlChart,
    FeatureFlags,
    ForbiddenError,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    Organization,
    Project,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    SqlChart,
    SqlRunnerPivotQueryBody,
    SqlRunnerPivotQueryPayload,
    UpdateSqlChart,
} from '@lightdash/common';
import { uniq } from 'lodash';
import {
    CreateSqlChartVersionEvent,
    LightdashAnalytics,
    QueryExecutionContext,
} from '../../analytics/LightdashAnalytics';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { applyLimitToSqlQuery } from '../../queryBuilder';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';

type SavedSqlServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    savedSqlModel: SavedSqlModel;
    schedulerClient: SchedulerClient;
    analyticsModel: AnalyticsModel;
};

// TODO: Rename to SqlRunnerService

export class SavedSqlService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly savedSqlModel: SavedSqlModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly analyticsModel: AnalyticsModel;

    constructor(args: SavedSqlServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.savedSqlModel = args.savedSqlModel;
        this.schedulerClient = args.schedulerClient;
        this.analyticsModel = args.analyticsModel;
    }

    static getCreateVersionEventProperties(
        config: SqlChart['config'],
    ): Pick<
        CreateSqlChartVersionEvent['properties'],
        'chartKind' | 'barChart' | 'lineChart' | 'pieChart'
    > {
        return {
            chartKind: config.type,
            barChart: isVizBarChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation,
                          ),
                      ),
                  }
                : undefined,
            lineChart: isVizLineChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation,
                          ),
                      ),
                  }
                : undefined,
            pieChart: isVizPieChartConfig(config)
                ? {
                      groupByCount: config.fieldConfig?.x ? 1 : 0,
                  }
                : undefined,
        };
    }

    private async hasAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        {
            spaceUuid,
            projectUuid,
            organizationUuid,
        }: { spaceUuid: string; projectUuid: string; organizationUuid: string },
    ): Promise<{ hasAccess: boolean; userAccess: SpaceShare | undefined }> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        const hasPermission = user.ability.can(
            action,
            subject('SavedChart', {
                organizationUuid,
                projectUuid,
                isPrivate: space.isPrivate,
                access,
            }),
        );

        return {
            hasAccess: hasPermission,
            userAccess: access[0],
        };
    }

    private async hasSavedChartAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        savedChart: {
            project: Pick<Project, 'projectUuid'>;
            organization: Pick<Organization, 'organizationUuid'>;
            space: Pick<SpaceSummary, 'uuid'>;
        },
    ) {
        return this.hasAccess(user, action, {
            spaceUuid: savedChart.space.uuid,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
        });
    }

    async getSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string | undefined,
        slug?: string,
    ): Promise<SqlChart> {
        let savedChart;
        if (savedSqlUuid) {
            savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
                projectUuid,
            });
        } else if (slug) {
            savedChart = await this.savedSqlModel.getBySlug(projectUuid, slug);
        } else {
            throw new Error('Either savedSqlUuid or slug must be provided');
        }
        const { hasAccess: hasViewAccess, userAccess } =
            await this.hasSavedChartAccess(user, 'view', savedChart);

        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }
        this.analytics.track({
            event: 'sql_chart.view',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSqlUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });
        return {
            ...savedChart,
            space: {
                ...savedChart.space,
                userAccess,
            },
        };
    }

    async createSqlChart(
        user: SessionUser,
        projectUuid: string,
        sqlChart: CreateSqlChart,
    ): Promise<ApiCreateSqlChart['results']> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { hasAccess: hasCreateAccess } = await this.hasAccess(
            user,
            'create',
            {
                spaceUuid: sqlChart.spaceUuid,
                projectUuid,
                organizationUuid,
            },
        );

        if (!hasCreateAccess) {
            throw new ForbiddenError(
                "You don't have permission to create this chart",
            );
        }
        const createdChart = await this.savedSqlModel.create(
            user.userUuid,
            projectUuid,
            sqlChart,
        );

        this.analytics.track({
            event: 'sql_chart.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSqlUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        this.analytics.track({
            event: 'sql_chart_version.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSqlUuid,
                versionId: createdChart.savedSqlVersionUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
                ...SavedSqlService.getCreateVersionEventProperties(
                    sqlChart.config,
                ),
            },
        });

        return createdChart;
    }

    async updateSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
        sqlChart: UpdateSqlChart,
    ): Promise<{ savedSqlUuid: string; savedSqlVersionUuid: string | null }> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });

        const { hasAccess: hasUpdateAccess } = await this.hasSavedChartAccess(
            user,
            'update',
            savedChart,
        );
        if (!hasUpdateAccess) {
            throw new ForbiddenError(
                "You don't have permission to update this chart",
            );
        }

        // check permission if the chart is being moved to a different space
        if (
            sqlChart.unversionedData &&
            savedChart.space.uuid !== sqlChart.unversionedData.spaceUuid
        ) {
            const { hasAccess: hasUpdateAccessToNewSpace } =
                await this.hasAccess(user, 'update', {
                    spaceUuid: sqlChart.unversionedData.spaceUuid,
                    organizationUuid: savedChart.organization.organizationUuid,
                    projectUuid: savedChart.project.projectUuid,
                });
            if (!hasUpdateAccessToNewSpace) {
                throw new ForbiddenError(
                    "You don't have permission to move this chart to the new space",
                );
            }
        }

        const updatedChart = await this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid,
            sqlChart,
        });

        this.analytics.track({
            event: 'sql_chart.updated',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSqlUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });

        if (updatedChart.savedSqlVersionUuid && sqlChart.versionedData) {
            this.analytics.track({
                event: 'sql_chart_version.created',
                userId: user.userUuid,
                properties: {
                    chartId: updatedChart.savedSqlUuid,
                    versionId: updatedChart.savedSqlVersionUuid,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    ...SavedSqlService.getCreateVersionEventProperties(
                        sqlChart.versionedData.config,
                    ),
                },
            });
        }

        return updatedChart;
    }

    async deleteSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<void> {
        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });
        const { hasAccess: hasDeleteAccess } = await this.hasSavedChartAccess(
            user,
            'delete',
            savedChart,
        );
        if (!hasDeleteAccess) {
            throw new ForbiddenError(
                "You don't have permission to delete this chart",
            );
        }
        await this.savedSqlModel.delete(savedSqlUuid);

        this.analytics.track({
            event: 'sql_chart.deleted',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSqlUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });
    }

    async getResultJobFromSql(
        user: SessionUser,
        projectUuid: string,
        sql: string,
        limit?: number,
    ): Promise<{ jobId: string }> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const jobId = await this.schedulerClient.runSql({
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            sql,
            limit,
            context: QueryExecutionContext.SQL_RUNNER,
        });

        return { jobId };
    }

    async getResultJobFromSqlPivotQuery(
        user: SessionUser,
        projectUuid: string,
        body: SqlRunnerPivotQueryBody,
    ): Promise<{ jobId: string }> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        // If it's a saved chart, check if the user has access to it
        if (body.slug || body.uuid) {
            let savedChart;
            if (body.uuid) {
                savedChart = await this.savedSqlModel.getByUuid(body.uuid, {
                    projectUuid,
                });
            } else if (body.slug) {
                savedChart = await this.savedSqlModel.getBySlug(
                    projectUuid,
                    body.slug,
                );
            }

            if (!savedChart) {
                throw new Error('Chart not found');
            }

            const { hasAccess: hasViewAccess } = await this.hasSavedChartAccess(
                user,
                'view',
                savedChart,
            );
            if (!hasViewAccess) {
                throw new ForbiddenError("You don't have access to this chart");
            }
        } else if (
            // If it's not a saved chart, check if the user has access to run a pivot query
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const jobId = await this.schedulerClient.runSqlPivotQuery({
            ...body,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            context: QueryExecutionContext.SQL_RUNNER,
        });

        return { jobId };
    }

    async getSqlChartResultJob(
        user: SessionUser,
        projectUuid: string,
        slug: string,
    ): Promise<{ jobId: string }> {
        const savedChart = await this.savedSqlModel.getBySlug(
            projectUuid,
            slug,
        );

        const { hasAccess: hasViewAccess } = await this.hasSavedChartAccess(
            user,
            'view',
            savedChart,
        );
        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }

        const jobId = await this.schedulerClient.runSql({
            userUuid: user.userUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            projectUuid: savedChart.project.projectUuid,
            sql: savedChart.sql,
            limit: savedChart.limit,
            sqlChartUuid: savedChart.savedSqlUuid,
            context: QueryExecutionContext.SQL_CHART,
        });

        await this.analyticsModel.addSqlChartViewEvent(
            savedChart.savedSqlUuid,
            user.userUuid,
        );
        return {
            jobId,
        };
    }

    async getChartWithResultJob(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<{ jobId: string; chart: SqlChart }> {
        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });

        const { hasAccess: hasViewAccess, userAccess } =
            await this.hasSavedChartAccess(user, 'view', savedChart);
        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }

        const jobId = await this.schedulerClient.runSql({
            userUuid: user.userUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            projectUuid: savedChart.project.projectUuid,
            sql: savedChart.sql,
            limit: savedChart.limit,
            sqlChartUuid: savedSqlUuid,
            context: QueryExecutionContext.DASHBOARD,
        });

        return {
            jobId,
            chart: {
                ...savedChart,
                space: {
                    ...savedChart.space,
                    userAccess,
                },
            },
        };
    }
}
