import { subject } from '@casl/ability';
import {
    AbilityAction,
    ApiCreateSqlChart,
    BulkActionable,
    CreateSchedulerAndTargetsWithoutIds,
    CreateSqlChart,
    ForbiddenError,
    getSchedulerResourceTypeAndId,
    getTimezoneLabel,
    GoogleSheetsTransientError,
    isSchedulerGsheetsOptions,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    MissingConfigError,
    NotFoundError,
    Organization,
    ParameterError,
    Project,
    QueryExecutionContext,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    SqlChart,
    SqlRunnerPivotQueryBody,
    UnexpectedGoogleSheetsError,
    UpdateSqlChart,
    VIZ_DEFAULT_AGGREGATION,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { Knex } from 'knex';
import { uniq } from 'lodash';
import {
    CreateSqlChartVersionEvent,
    LightdashAnalytics,
    SchedulerUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import type {
    SoftDeletableService,
    SoftDeleteOptions,
} from '../SoftDeletableService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';

type SavedSqlServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedSqlModel: SavedSqlModel;
    schedulerClient: SchedulerClient;
    schedulerModel: SchedulerModel;
    analyticsModel: AnalyticsModel;
    spacePermissionService: SpacePermissionService;
    slackClient: SlackClient;
    googleDriveClient: GoogleDriveClient;
    userService: UserService;
};

// TODO: Rename to SqlRunnerService

export class SavedSqlService
    extends BaseService
    implements BulkActionable<Knex>, SoftDeletableService
{
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly savedSqlModel: SavedSqlModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly schedulerModel: SchedulerModel;

    private readonly analyticsModel: AnalyticsModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly slackClient: SlackClient;

    private readonly googleDriveClient: GoogleDriveClient;

    private readonly userService: UserService;

    constructor(args: SavedSqlServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.savedSqlModel = args.savedSqlModel;
        this.schedulerClient = args.schedulerClient;
        this.schedulerModel = args.schedulerModel;
        this.analyticsModel = args.analyticsModel;
        this.spacePermissionService = args.spacePermissionService;
        this.slackClient = args.slackClient;
        this.googleDriveClient = args.googleDriveClient;
        this.userService = args.userService;
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
    ) {
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

        const needsNewSpaceCheck =
            resource.spaceUuid && spaceUuid !== resource.spaceUuid;

        const ctx = needsNewSpaceCheck
            ? await this.spacePermissionService.getSpacesAccessContext(
                  actor.user.userUuid,
                  [spaceUuid, resource.spaceUuid!],
              )
            : await this.spacePermissionService.getSpacesAccessContext(
                  actor.user.userUuid,
                  [spaceUuid],
              );

        const auditedAbility = this.createAuditedAbility(actor.user);

        if (
            auditedAbility.cannot(
                action,
                subject('SavedChart', {
                    ...ctx[spaceUuid],
                    metadata: { savedSqlUuid: resource.savedSqlUuid ?? '' },
                }),
            )
        ) {
            throw new ForbiddenError(
                `You don't have access to ${action} this Saved SQL chart`,
            );
        }

        if (needsNewSpaceCheck) {
            if (
                auditedAbility.cannot(
                    action,
                    subject('SavedChart', {
                        ...ctx[resource.spaceUuid!],
                        metadata: { savedSqlUuid: resource.savedSqlUuid ?? '' },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this Saved SQL chart in the new space`,
                );
            }
        }

        return ctx[spaceUuid];
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

        const spaceCtx = await this.hasAccess(
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
                userAccess: spaceCtx.access[0],
            },
        };
    }

    async createSqlChart(
        user: SessionUser,
        projectUuid: string,
        sqlChart: CreateSqlChart,
    ): Promise<ApiCreateSqlChart['results']> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid,
                    projectUuid,
                }),
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
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid,
                    projectUuid,
                    metadata: { savedSqlUuid },
                }),
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

    async delete(
        user: SessionUser,
        savedSqlUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {});
        const { projectUuid } = savedChart.project;

        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'delete', {
                type: 'SavedChart',
                metadata: { savedSqlUuid },
                organizationUuid: savedChart.organization.organizationUuid,
                projectUuid,
            });
        } else {
            await this.hasAccess(
                'delete',
                { user, projectUuid },
                { savedSqlUuid: savedChart.savedSqlUuid },
            );
        }

        if (this.lightdashConfig.softDelete.enabled) {
            await this.softDelete(user, savedSqlUuid, {
                bypassPermissions: true, // perms checked above
            });
        } else {
            await this.permanentDelete(user, savedSqlUuid, {
                bypassPermissions: true, // perms checked above
            });
        }

        this.analytics.track({
            event: 'sql_chart.deleted',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSqlUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
                softDelete: this.lightdashConfig.softDelete.enabled,
            },
        });
    }

    async softDelete(
        user: SessionUser,
        savedSqlUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'delete', {
                type: 'SavedChart',
                metadata: { savedSqlUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const savedChart = await this.savedSqlModel.getByUuid(
                savedSqlUuid,
                {},
            );
            await this.hasAccess(
                'delete',
                { user, projectUuid: savedChart.project.projectUuid },
                { savedSqlUuid: savedChart.savedSqlUuid },
            );
        }

        await this.savedSqlModel.softDelete(savedSqlUuid, user.userUuid);
    }

    async restore(
        user: SessionUser,
        savedSqlUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            deleted: true,
        });
        const { projectUuid } = savedChart.project;
        const { organizationUuid } = savedChart.organization;

        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { savedSqlUuid },
                organizationUuid,
                projectUuid,
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid,
                        metadata: { projectUuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }

            const isAdmin = auditedAbility.can(
                'manage',
                subject('DeletedContent', {
                    organizationUuid,
                    projectUuid,
                    metadata: { savedSqlUuid },
                }),
            );

            if (!isAdmin && savedChart.createdBy?.userUuid !== user.userUuid) {
                throw new ForbiddenError(
                    'You can only restore content you deleted',
                );
            }
        }

        await this.savedSqlModel.restore(savedSqlUuid);

        this.analytics.track({
            event: 'sql_chart.restored',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSqlUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });
    }

    async permanentDelete(
        user: SessionUser,
        savedSqlUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { savedSqlUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const savedChart = await this.savedSqlModel.getByUuid(
                savedSqlUuid,
                { deleted: true },
            );
            const { projectUuid } = savedChart.project;
            const { organizationUuid } = savedChart.organization;

            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid,
                        metadata: { projectUuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }

            const isAdmin = auditedAbility.can(
                'manage',
                subject('DeletedContent', {
                    organizationUuid,
                    projectUuid,
                    metadata: { savedSqlUuid },
                }),
            );

            if (!isAdmin && savedChart.createdBy?.userUuid !== user.userUuid) {
                throw new ForbiddenError(
                    'You can only permanently delete content you deleted',
                );
            }
        }

        await this.savedSqlModel.permanentDelete(savedSqlUuid);
    }

    async getResultJobFromSql(
        user: SessionUser,
        projectUuid: string,
        sql: string,
        limit?: number,
    ): Promise<{ jobId: string }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Job', {
                    organizationUuid,
                    projectUuid,
                }),
            ) ||
            auditedAbility.cannot(
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
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

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
        } else {
            // If it's not a saved chart, check if the user has access to run a pivot query
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'create',
                    subject('Job', {
                        organizationUuid,
                        projectUuid,
                    }),
                ) ||
                auditedAbility.cannot(
                    'manage',
                    subject('SqlRunner', {
                        organizationUuid,
                        projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
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
        } else {
            this.logBypassEvent(user, 'update', {
                type: 'SavedChart',
                metadata: { savedSqlUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
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

    private async hasChartSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        try {
            return await this.spacePermissionService.can(
                'view',
                user,
                spaceUuid,
            );
        } catch (e) {
            return false;
        }
    }

    private async checkCreateScheduledDeliveryAccess(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<{ organizationUuid: string; spaceUuid: string }> {
        const sqlChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });
        const { organizationUuid } = sqlChart.organization;
        const spaceUuid = sqlChart.space.uuid;

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                    metadata: { savedSqlUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasChartSpaceAccess(user, spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }

        return { organizationUuid, spaceUuid };
    }

    async getSchedulers(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        await this.checkCreateScheduledDeliveryAccess(
            user,
            projectUuid,
            savedSqlUuid,
        );
        return this.schedulerModel.getSqlChartSchedulers(savedSqlUuid);
    }

    async createScheduler(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
        newScheduler: CreateSchedulerAndTargetsWithoutIds,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        // SQL chart schedulers only flow through the Google Sheets upload worker
        // (SchedulerTask.handleGsheetsUpload). Other formats route to
        // handleScheduledDelivery, which has no SQL-chart branch and would fail
        // at runtime with "Chart or dashboard can't be both undefined".
        if (newScheduler.format !== SchedulerFormat.GSHEETS) {
            throw new ParameterError(
                'SQL chart schedulers only support Google Sheets format',
            );
        }

        if (!isValidFrequency(newScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }

        if (!isValidTimezone(newScheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
        }

        if (!newScheduler.targets || !Array.isArray(newScheduler.targets)) {
            throw new ParameterError(
                'Targets is required and must be an array',
            );
        }

        if (newScheduler.format === SchedulerFormat.GSHEETS) {
            if (!isSchedulerGsheetsOptions(newScheduler.options)) {
                throw new ParameterError(
                    'Google Sheets format requires valid gsheets options',
                );
            }

            try {
                const refreshToken = await this.userService.getRefreshToken(
                    user.userUuid,
                );
                await this.googleDriveClient.assertFileIsGoogleSheet(
                    refreshToken,
                    newScheduler.options.gdriveId,
                );
            } catch (error) {
                if (error instanceof UnexpectedGoogleSheetsError) {
                    throw error;
                }
                if (error instanceof GoogleSheetsTransientError) {
                    throw error;
                }
                throw new MissingConfigError(
                    'Unable to validate Google Sheets file. Please ensure you have connected your Google account.',
                );
            }
        }

        const { organizationUuid } =
            await this.checkCreateScheduledDeliveryAccess(
                user,
                projectUuid,
                savedSqlUuid,
            );

        const scheduler = await this.schedulerModel.createScheduler({
            ...newScheduler,
            createdBy: user.userUuid,
            savedChartUuid: null,
            dashboardUuid: null,
            savedSqlUuid,
        });

        const createSchedulerEventData: SchedulerUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                ...getSchedulerResourceTypeAndId(scheduler),
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                timeZone: getTimezoneLabel(scheduler.timezone),
                includeLinks: scheduler.includeLinks,
            },
        };
        this.analytics.track(createSchedulerEventData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        const { schedulerTimezone: defaultTimezone } =
            await this.projectModel.get(projectUuid);

        await this.schedulerClient.generateDailyJobsForScheduler(
            scheduler,
            {
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
            },
            defaultTimezone,
        );

        return scheduler;
    }
}
