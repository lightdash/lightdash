import { subject } from '@casl/ability';
import {
    AbilityAction,
    ApiCreateSqlChart,
    BulkActionable,
    CreateSqlChart,
    ForbiddenError,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    NotFoundError,
    Organization,
    ParameterError,
    Project,
    QueryExecutionContext,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    SqlChart,
    SqlRunnerPivotQueryBody,
    UpdateSqlChart,
    VIZ_DEFAULT_AGGREGATION,
} from '@lightdash/common';
import { Knex } from 'knex';
import { uniq } from 'lodash';
import {
    CreateSqlChartVersionEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
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

export class SavedSqlService
    extends BaseService
    implements BulkActionable<Knex>
{
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
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
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
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
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
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: string;
        },
        resource:
            | {
                  savedSqlUuid: null;
                  spaceUuid: string;
              }
            | {
                  savedSqlUuid: string;
                  spaceUuid?: string;
              },
    ): Promise<SpaceShare[]> {
        let { spaceUuid } = resource;

        if (resource.savedSqlUuid !== null) {
            const savedSql = await this.savedSqlModel.getByUuid(
                resource.savedSqlUuid,
                {
                    projectUuid: actor.projectUuid,
                },
            );

            if (!savedSql) {
                throw new NotFoundError('Saved SQL Chart not found');
            }

            spaceUuid = savedSql.space.uuid;
        }

        if (!spaceUuid) {
            throw new NotFoundError('Space is required');
        }

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            spaceUuid,
        );

        const hasPermission = actor.user.ability.can(
            action,
            subject('SavedChart', {
                organizationUuid: space.organizationUuid,
                projectUuid: actor.projectUuid,
                isPrivate: space.isPrivate,
                access: spaceAccess,
            }),
        );

        if (!hasPermission) {
            throw new ForbiddenError(
                `You don't have access to ${action} this Saved SQL chart`,
            );
        }

        if (resource.spaceUuid && spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                resource.spaceUuid,
            );
            const newSpaceAccess = await this.spaceModel.getUserSpaceAccess(
                actor.user.userUuid,
                resource.spaceUuid,
            );

            const hasPermissionInNewSpace = actor.user.ability.can(
                action,
                subject('SavedChart', {
                    organizationUuid: newSpace.organizationUuid,
                    projectUuid: actor.projectUuid,
                    isPrivate: newSpace.isPrivate,
                    access: newSpaceAccess,
                }),
            );

            if (!hasPermissionInNewSpace) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this Saved SQL chart in the new space`,
                );
            }
        }

        return spaceAccess;
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

        const spaceAccess = await this.hasAccess(
            'view',
            {
                user,
                projectUuid,
            },
            {
                savedSqlUuid: savedChart.savedSqlUuid,
            },
        );

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
                userAccess: spaceAccess[0],
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

        await this.hasAccess(
            'create',
            { user, projectUuid },
            {
                savedSqlUuid: null,
                spaceUuid: sqlChart.spaceUuid,
            },
        );

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

        await this.hasAccess(
            'update',
            { user, projectUuid },
            {
                savedSqlUuid: savedChart.savedSqlUuid,
                spaceUuid:
                    sqlChart.unversionedData &&
                    savedChart.space.uuid !== sqlChart.unversionedData.spaceUuid
                        ? sqlChart.unversionedData.spaceUuid
                        : undefined,
            },
        );

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
        await this.hasAccess(
            'delete',
            { user, projectUuid },
            { savedSqlUuid: savedChart.savedSqlUuid },
        );

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
            user.ability.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
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
        context?: QueryExecutionContext,
    ): Promise<{ jobId: string }> {
        const { savedSqlUuid } = body;
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        let savedChart;

        if (savedSqlUuid) {
            savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
                projectUuid,
            });

            if (!savedChart) {
                throw new Error('Saved chart not found');
            }
            await this.hasAccess(
                'view',
                { user, projectUuid },
                { savedSqlUuid: savedChart.savedSqlUuid },
            );
        } else if (
            // If it's not a saved chart, check if the user has access to run a pivot query
            user.ability.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
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
            savedSqlUuid: savedChart?.savedSqlUuid,
            sql: savedChart?.sql || body.sql,
            limit: savedChart?.limit || body.limit,
            indexColumn: body.indexColumn,
            valuesColumns: body.valuesColumns,
            groupByColumns: body.groupByColumns,
            sortBy: body.sortBy,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            context: context || QueryExecutionContext.SQL_RUNNER,
        });

        return { jobId };
    }

    async getSqlChartResultJob(
        user: SessionUser,
        projectUuid: string,
        slug?: string,
        chartUuid?: string,
        context?: QueryExecutionContext,
    ): Promise<{ jobId: string }> {
        let savedChart;
        if (chartUuid) {
            savedChart = await this.savedSqlModel.getByUuid(chartUuid, {
                projectUuid,
            });
        }
        if (slug) {
            savedChart = await this.savedSqlModel.getBySlug(projectUuid, slug);
        }
        if (!savedChart) {
            throw new Error('Either chartUuid or slug must be provided');
        }

        await this.hasAccess(
            'view',
            { user, projectUuid },
            { savedSqlUuid: savedChart.savedSqlUuid },
        );

        const jobId = await this.schedulerClient.runSql({
            userUuid: user.userUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            projectUuid: savedChart.project.projectUuid,
            sql: savedChart.sql,
            limit: savedChart.limit,
            sqlChartUuid: savedChart.savedSqlUuid,
            context: context || QueryExecutionContext.SQL_CHART,
        });

        await this.analyticsModel.addSqlChartViewEvent(
            savedChart.savedSqlUuid,
            user.userUuid,
        );
        return {
            jobId,
        };
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: savedSqlUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ) {
        if (!targetSpaceUuid) {
            throw new ParameterError(
                'You cannot move a dashboard outside of a space',
            );
        }

        if (checkForAccess) {
            await this.hasAccess(
                'update',
                { user, projectUuid },
                { savedSqlUuid, spaceUuid: targetSpaceUuid },
            );
        }

        await this.savedSqlModel.moveToSpace(
            {
                projectUuid,
                itemUuid: savedSqlUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'sql_chart.moved',
                userId: user.userUuid,
                properties: {
                    chartId: savedSqlUuid,
                    projectId: projectUuid,
                    targetSpaceId: targetSpaceUuid,
                },
            });
        }
    }
}
