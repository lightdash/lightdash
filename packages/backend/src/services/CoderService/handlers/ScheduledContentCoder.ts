import { subject } from '@casl/ability';
import {
    AlertAsCode,
    ApiAlertAsCodeListResponse,
    ApiAlertAsCodeUpsertResponse,
    ApiGoogleSheetsSyncAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeUpsertResponse,
    ApiScheduledDeliveryAsCodeListResponse,
    ApiScheduledDeliveryAsCodeUpsertResponse,
    assertUnreachable,
    ChartGoogleSheetsSyncAsCode,
    ChartScheduledDeliveryAsCode,
    ContentAsCodeType,
    CreateSchedulerTarget,
    currentVersion,
    DashboardDAO,
    DashboardFilterRule,
    DashboardGoogleSheetsSyncAsCode,
    DashboardScheduledDeliveryAsCode,
    DashboardTileTarget,
    Filters,
    ForbiddenError,
    GoogleSheetsSyncAsCode,
    isChartScheduler,
    isDashboardScheduler,
    isSchedulerGsheetsOptions,
    NotFoundError,
    NotificationFrequency,
    ParameterError,
    PromotionAction,
    ScheduledDeliveryAsCode,
    ScheduledDeliveryTargetAsCode,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    validateEmail,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SchedulerModel } from '../../../models/SchedulerModel';
import { BaseService } from '../../BaseService';
import { DashboardService } from '../../DashboardService/DashboardService';
import { SavedChartService } from '../../SavedChartsService/SavedChartService';
import { SchedulerService } from '../../SchedulerService/SchedulerService';
import { normalizeFilterIds, stripFilterIds } from '../filterIds';
import {
    getDashboardScheduledDeliveryFiltersWithTileSlugs,
    getDashboardScheduledDeliveryFiltersWithTileUuids,
    getDashboardTabSlug,
    getDashboardTabUuid,
    getScheduledDeliveryFormat,
    getScheduledDeliveryTargetKey,
    getScheduledDeliveryTargetsAsCode,
} from '../scheduledContent';

type ScheduledContentCoderArguments = {
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    schedulerModel: SchedulerModel;
    schedulerService: SchedulerService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
};

export class ScheduledContentCoder extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly schedulerService: SchedulerService;

    private readonly savedChartService: SavedChartService;

    private readonly dashboardService: DashboardService;

    constructor({
        projectModel,
        savedChartModel,
        dashboardModel,
        schedulerModel,
        schedulerService,
        savedChartService,
        dashboardService,
    }: ScheduledContentCoderArguments) {
        super();
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.schedulerModel = schedulerModel;
        this.schedulerService = schedulerService;
        this.savedChartService = savedChartService;
        this.dashboardService = dashboardService;
    }

    private static getScheduledDeliveryTargetsAsCode =
        getScheduledDeliveryTargetsAsCode;

    private static getScheduledDeliveryTargetKey =
        getScheduledDeliveryTargetKey;

    private static getDashboardScheduledDeliveryFiltersWithTileSlugs =
        getDashboardScheduledDeliveryFiltersWithTileSlugs;

    private static getDashboardScheduledDeliveryFiltersWithTileUuids =
        getDashboardScheduledDeliveryFiltersWithTileUuids;

    static getDashboardTabSlug = getDashboardTabSlug;

    static getDashboardTabUuid = getDashboardTabUuid;

    private static getScheduledDeliveryFormat = getScheduledDeliveryFormat;

    private async transformScheduledDelivery(
        scheduler: SchedulerAndTargets,
    ): Promise<ScheduledDeliveryAsCode | null> {
        if (
            !scheduler.slug ||
            (scheduler.thresholds && scheduler.thresholds.length > 0)
        ) {
            return null;
        }
        const targets =
            ScheduledContentCoder.getScheduledDeliveryTargetsAsCode(scheduler);
        if (!targets) return null;
        const format =
            ScheduledContentCoder.getScheduledDeliveryFormat(scheduler);
        if (!format) return null;

        const common = {
            contentType: ContentAsCodeType.SCHEDULED_DELIVERY as const,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            targets,
            downloadedAt: new Date(),
        };

        if (isChartScheduler(scheduler)) {
            const chart = await this.savedChartModel.getSummary(
                scheduler.savedChartUuid,
            );
            return {
                ...common,
                ...format,
                resource: { type: 'chart', slug: chart.slug },
                filters: stripFilterIds(scheduler.filters),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: null,
                selectedTabs: null,
            };
        }

        if (isDashboardScheduler(scheduler)) {
            const dashboard = await this.dashboardModel.getByIdOrSlug(
                scheduler.dashboardUuid,
            );
            return {
                ...common,
                ...format,
                resource: { type: 'dashboard', slug: dashboard.slug },
                filters:
                    ScheduledContentCoder.getDashboardScheduledDeliveryFiltersWithTileSlugs(
                        dashboard,
                        scheduler.filters,
                    ),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: scheduler.customViewportWidth ?? null,
                selectedTabs:
                    scheduler.selectedTabs?.map((tabUuid) =>
                        ScheduledContentCoder.getDashboardTabSlug(
                            dashboard,
                            tabUuid,
                        ),
                    ) ?? null,
            };
        }

        return null;
    }

    private async transformGoogleSheetsSync(
        scheduler: SchedulerAndTargets,
    ): Promise<GoogleSheetsSyncAsCode | null> {
        if (
            !scheduler.slug ||
            scheduler.format !== SchedulerFormat.GSHEETS ||
            scheduler.thresholds?.length ||
            !isSchedulerGsheetsOptions(scheduler.options)
        ) {
            return null;
        }

        const common = {
            contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC as const,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            destination: {
                spreadsheetId: scheduler.options.gdriveId,
                spreadsheetName: scheduler.options.gdriveName,
                organizationName: scheduler.options.gdriveOrganizationName,
                url: scheduler.options.url,
                tabName: scheduler.options.tabName ?? null,
            },
            downloadedAt: new Date(),
        };

        if (isChartScheduler(scheduler)) {
            const chart = await this.savedChartModel.getSummary(
                scheduler.savedChartUuid,
            );
            return {
                ...common,
                resource: { type: 'chart', slug: chart.slug },
                filters: stripFilterIds(scheduler.filters),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: null,
                selectedTabs: null,
            };
        }

        if (isDashboardScheduler(scheduler)) {
            const dashboard = await this.dashboardModel.getByIdOrSlug(
                scheduler.dashboardUuid,
            );
            return {
                ...common,
                resource: { type: 'dashboard', slug: dashboard.slug },
                filters:
                    ScheduledContentCoder.getDashboardScheduledDeliveryFiltersWithTileSlugs(
                        dashboard,
                        scheduler.filters,
                    ),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: scheduler.customViewportWidth ?? null,
                selectedTabs:
                    scheduler.selectedTabs?.map((tabUuid) =>
                        ScheduledContentCoder.getDashboardTabSlug(
                            dashboard,
                            tabUuid,
                        ),
                    ) ?? null,
            };
        }

        return null;
    }

    private static getScheduledContentNames(
        contentType:
            | ContentAsCodeType.SCHEDULED_DELIVERY
            | ContentAsCodeType.ALERT
            | ContentAsCodeType.GOOGLE_SHEETS_SYNC,
    ): { singular: string; plural: string } {
        switch (contentType) {
            case ContentAsCodeType.SCHEDULED_DELIVERY:
                return {
                    singular: 'Scheduled delivery',
                    plural: 'scheduled deliveries',
                };
            case ContentAsCodeType.ALERT:
                return { singular: 'Alert', plural: 'alerts' };
            case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                return {
                    singular: 'Google Sheets sync',
                    plural: 'Google Sheets syncs',
                };
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown scheduled content type',
                );
        }
    }

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType?: ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<ApiScheduledDeliveryAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.ALERT,
    ): Promise<ApiAlertAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC,
    ): Promise<ApiGoogleSheetsSyncAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType:
            | ContentAsCodeType.SCHEDULED_DELIVERY
            | ContentAsCodeType.ALERT
            | ContentAsCodeType.GOOGLE_SHEETS_SYNC = ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<
        | ApiScheduledDeliveryAsCodeListResponse['results']
        | ApiAlertAsCodeListResponse['results']
        | ApiGoogleSheetsSyncAsCodeListResponse['results']
    > {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            ) ||
            auditedAbility.cannot(
                'manage',
                subject('ScheduledDeliveries', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            ) ||
            (contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC &&
                auditedAbility.cannot(
                    'manage',
                    subject('GoogleSheets', {
                        projectUuid,
                        organizationUuid: project.organizationUuid,
                    }),
                ))
        ) {
            const { plural } =
                ScheduledContentCoder.getScheduledContentNames(contentType);
            throw new ForbiddenError(
                `You are not allowed to download ${plural}`,
            );
        }

        const schedulers =
            await this.schedulerModel.getSchedulerForProject(projectUuid);
        const filteredSchedulers = slugs?.length
            ? schedulers.filter((scheduler) => slugs.includes(scheduler.slug))
            : schedulers;
        const matchingSchedulers = filteredSchedulers.filter((scheduler) => {
            switch (contentType) {
                case ContentAsCodeType.ALERT:
                    return Boolean(scheduler.thresholds?.length);
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    return (
                        !scheduler.thresholds?.length &&
                        scheduler.format === SchedulerFormat.GSHEETS
                    );
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    return (
                        !scheduler.thresholds?.length &&
                        scheduler.format !== SchedulerFormat.GSHEETS
                    );
                default:
                    return assertUnreachable(
                        contentType,
                        'Unknown scheduled content type',
                    );
            }
        });
        const transformed = await Promise.all(
            matchingSchedulers.map((scheduler) => {
                switch (contentType) {
                    case ContentAsCodeType.ALERT:
                        return this.transformAlert(scheduler);
                    case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                        return this.transformGoogleSheetsSync(scheduler);
                    case ContentAsCodeType.SCHEDULED_DELIVERY:
                        return this.transformScheduledDelivery(scheduler);
                    default:
                        return assertUnreachable(
                            contentType,
                            'Unknown scheduled content type',
                        );
                }
            }),
        );
        const content: Array<
            ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode
        > = [];
        const skipped: Array<{ name: string; reason: string }> = [];
        const { singular: contentName } =
            ScheduledContentCoder.getScheduledContentNames(contentType);
        const unsupportedReason = `${contentName} as code supports chart and dashboard resources`;

        matchingSchedulers.forEach((scheduler, index) => {
            const item = transformed[index];
            if (item) {
                content.push(item);
            } else {
                skipped.push({
                    name: scheduler.name,
                    reason: scheduler.slug
                        ? unsupportedReason
                        : `${contentName} is missing its portable identity and must be backfilled before export`,
                });
            }
        });

        if (contentType === ContentAsCodeType.ALERT) {
            return { alerts: content as AlertAsCode[], skipped };
        }
        if (contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC) {
            return {
                googleSheetsSyncs: content as GoogleSheetsSyncAsCode[],
                skipped,
            };
        }
        return {
            scheduledDeliveries: content as ScheduledDeliveryAsCode[],
            skipped,
        };
    }

    private async transformAlert(
        scheduler: SchedulerAndTargets,
    ): Promise<AlertAsCode | null> {
        if (
            !scheduler.slug ||
            !isChartScheduler(scheduler) ||
            !scheduler.thresholds?.length ||
            scheduler.format !== SchedulerFormat.IMAGE
        ) {
            return null;
        }
        const targets =
            ScheduledContentCoder.getScheduledDeliveryTargetsAsCode(scheduler);
        if (!targets) return null;

        const chart = await this.savedChartModel.getSummary(
            scheduler.savedChartUuid,
        );
        return {
            contentType: ContentAsCodeType.ALERT,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            targets,
            resource: { type: 'chart', slug: chart.slug },
            thresholds: scheduler.thresholds,
            notificationFrequency:
                scheduler.notificationFrequency ?? NotificationFrequency.ALWAYS,
            filters: stripFilterIds(scheduler.filters),
            parameters: scheduler.parameters ?? null,
            downloadedAt: new Date(),
        };
    }

    private async getScheduledDeliveryResource(
        projectUuid: string,
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): Promise<
        | { type: 'chart'; uuid: string }
        | { type: 'dashboard'; uuid: string; dashboard: DashboardDAO }
    > {
        if (delivery.resource.type === 'chart') {
            const charts = await this.savedChartModel.find({
                projectUuid,
                slug: delivery.resource.slug,
                includeOrphanChartsWithinDashboard: true,
            });
            if (charts.length === 0) {
                throw new NotFoundError(
                    `Chart '${delivery.resource.slug}' was not found`,
                );
            }
            if (charts.length > 1) {
                throw new ParameterError(
                    `Multiple charts match slug '${delivery.resource.slug}'`,
                );
            }
            return { type: 'chart', uuid: charts[0].uuid };
        }

        const dashboards = await this.dashboardModel.find({
            projectUuid,
            slug: delivery.resource.slug,
        });
        if (dashboards.length === 0) {
            throw new NotFoundError(
                `Dashboard '${delivery.resource.slug}' was not found`,
            );
        }
        if (dashboards.length > 1) {
            throw new ParameterError(
                `Multiple dashboards match slug '${delivery.resource.slug}'`,
            );
        }
        return {
            type: 'dashboard',
            uuid: dashboards[0].uuid,
            dashboard: await this.dashboardModel.getByIdOrSlug(
                dashboards[0].uuid,
            ),
        };
    }

    private static getScheduledDeliveryTargets(delivery: {
        targets: ScheduledDeliveryTargetAsCode[];
    }): CreateSchedulerTarget[] {
        return delivery.targets.map((target) => {
            switch (target.type) {
                case 'email':
                    return { recipient: target.recipient };
                case 'slack':
                    return { channel: target.channel };
                default:
                    return assertUnreachable(
                        target,
                        'Unknown scheduled delivery target',
                    );
            }
        });
    }

    private static isChartScheduledDelivery(
        delivery: ScheduledDeliveryAsCode,
    ): delivery is ChartScheduledDeliveryAsCode {
        return delivery.resource.type === 'chart';
    }

    private static isDashboardScheduledDelivery(
        delivery: ScheduledDeliveryAsCode,
    ): delivery is DashboardScheduledDeliveryAsCode {
        return delivery.resource.type === 'dashboard';
    }

    private static isChartScheduledContent(
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): delivery is
        | ChartScheduledDeliveryAsCode
        | AlertAsCode
        | ChartGoogleSheetsSyncAsCode {
        return delivery.resource.type === 'chart';
    }

    private static isDashboardScheduledContent(
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): delivery is
        | DashboardScheduledDeliveryAsCode
        | DashboardGoogleSheetsSyncAsCode {
        return delivery.resource.type === 'dashboard';
    }

    private static scheduledContentIsEqual(
        current: ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode,
        desired: ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode,
    ): boolean {
        const normalize = (
            scheduledContent:
                | ScheduledDeliveryAsCode
                | AlertAsCode
                | GoogleSheetsSyncAsCode,
        ) => {
            const { downloadedAt, ...rest } = scheduledContent;
            if ('targets' in rest) {
                return {
                    ...rest,
                    targets: [...rest.targets].sort((left, right) =>
                        ScheduledContentCoder.getScheduledDeliveryTargetKey(
                            left,
                        ).localeCompare(
                            ScheduledContentCoder.getScheduledDeliveryTargetKey(
                                right,
                            ),
                        ),
                    ),
                };
            }
            return rest;
        };
        return isEqual(normalize(current), normalize(desired));
    }

    async upsertScheduledDelivery(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
        force = false,
    ): Promise<
        | ApiScheduledDeliveryAsCodeUpsertResponse['results']
        | ApiAlertAsCodeUpsertResponse['results']
        | ApiGoogleSheetsSyncAsCodeUpsertResponse['results']
    > {
        const isAlert = delivery.contentType === ContentAsCodeType.ALERT;
        const isGoogleSheetsSync =
            delivery.contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC;
        const { singular: contentName, plural: contentPlural } =
            ScheduledContentCoder.getScheduledContentNames(
                delivery.contentType,
            );
        if (slug !== delivery.slug) {
            throw new ParameterError(
                `${contentName} slug '${delivery.slug}' does not match path slug '${slug}'`,
            );
        }
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `You are not allowed to upload ${contentPlural}`,
            );
        }

        const resource = await this.getScheduledDeliveryResource(
            projectUuid,
            delivery,
        );
        const existing = await this.schedulerModel.findSchedulerByProjectSlug(
            projectUuid,
            slug,
        );

        if (
            existing &&
            (Boolean(existing.thresholds?.length) !== isAlert ||
                isGoogleSheetsSync !==
                    (!existing.thresholds?.length &&
                        existing.format === SchedulerFormat.GSHEETS) ||
                (resource.type === 'chart' &&
                    (!isChartScheduler(existing) ||
                        existing.savedChartUuid !== resource.uuid)) ||
                (resource.type === 'dashboard' &&
                    (!isDashboardScheduler(existing) ||
                        existing.dashboardUuid !== resource.uuid)))
        ) {
            throw new ParameterError(
                `${contentName} slug '${slug}' is already used by another resource in this project`,
            );
        }

        if (existing) {
            let current:
                | ScheduledDeliveryAsCode
                | AlertAsCode
                | GoogleSheetsSyncAsCode
                | null;
            switch (delivery.contentType) {
                case ContentAsCodeType.ALERT:
                    current = await this.transformAlert(existing);
                    break;
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    current = await this.transformGoogleSheetsSync(existing);
                    break;
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    current = await this.transformScheduledDelivery(existing);
                    break;
                default:
                    current = assertUnreachable(
                        delivery,
                        'Unknown scheduled content type',
                    );
            }
            if (
                !force &&
                current &&
                ScheduledContentCoder.scheduledContentIsEqual(current, delivery)
            ) {
                return { action: PromotionAction.NO_CHANGES };
            }
        }

        const targets = isGoogleSheetsSync
            ? []
            : ScheduledContentCoder.getScheduledDeliveryTargets(delivery);
        let filters: Filters | DashboardFilterRule[] | undefined;
        if (ScheduledContentCoder.isChartScheduledContent(delivery)) {
            filters = delivery.filters
                ? normalizeFilterIds(delivery.filters)
                : undefined;
        } else if (
            ScheduledContentCoder.isDashboardScheduledContent(delivery) &&
            resource.type === 'dashboard'
        ) {
            filters =
                ScheduledContentCoder.getDashboardScheduledDeliveryFiltersWithTileUuids(
                    resource.dashboard,
                    delivery.filters,
                );
        } else {
            throw new ParameterError(
                'Scheduled delivery resource type does not match its payload',
            );
        }
        let selectedTabs: string[] | null | undefined;
        if (isAlert || delivery.resource.type === 'chart') {
            selectedTabs = null;
        } else if (resource.type === 'dashboard' && delivery.selectedTabs) {
            selectedTabs = delivery.selectedTabs.map((tabSlug) =>
                ScheduledContentCoder.getDashboardTabUuid(
                    resource.dashboard,
                    tabSlug,
                ),
            );
        } else {
            selectedTabs = delivery.selectedTabs;
        }

        const formatAndOptions = (() => {
            switch (delivery.contentType) {
                case ContentAsCodeType.ALERT:
                    return {
                        format: SchedulerFormat.IMAGE,
                        options: { withPdf: false },
                    };
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    return {
                        format: SchedulerFormat.GSHEETS,
                        options: {
                            gdriveId: delivery.destination.spreadsheetId,
                            gdriveName: delivery.destination.spreadsheetName,
                            gdriveOrganizationName:
                                delivery.destination.organizationName,
                            url: delivery.destination.url,
                            tabName: delivery.destination.tabName ?? undefined,
                        },
                    };
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    return {
                        format: delivery.format,
                        options: delivery.options,
                    };
                default:
                    return assertUnreachable(
                        delivery,
                        'Unknown scheduled content type',
                    );
            }
        })();

        const schedulerInput = {
            slug: delivery.slug,
            name: delivery.name,
            message: delivery.message ?? undefined,
            cron: delivery.cron,
            timezone: delivery.timezone ?? undefined,
            ...formatAndOptions,
            filters,
            parameters: delivery.parameters ?? undefined,
            customViewportWidth: isAlert
                ? undefined
                : (delivery.customViewportWidth ?? undefined),
            selectedTabs,
            thresholds: isAlert ? delivery.thresholds : undefined,
            notificationFrequency: isAlert
                ? delivery.notificationFrequency
                : undefined,
            enabled: delivery.enabled,
            includeLinks: delivery.includeLinks,
            targets,
            appUuid: null,
            appName: null,
        };

        if (!existing) {
            let created: SchedulerAndTargets;
            if (resource.type === 'chart') {
                created = isGoogleSheetsSync
                    ? await this.savedChartService.createScheduler(
                          user,
                          resource.uuid,
                          schedulerInput,
                          { validateGoogleSheet: false },
                      )
                    : await this.savedChartService.createScheduler(
                          user,
                          resource.uuid,
                          schedulerInput,
                      );
            } else {
                created = await this.dashboardService.createScheduler(
                    user,
                    resource.uuid,
                    schedulerInput,
                );
            }
            if (!delivery.enabled) {
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    created.schedulerUuid,
                    false,
                );
            }
            return { action: PromotionAction.CREATE };
        }

        if (isGoogleSheetsSync) {
            await this.schedulerService.updateScheduler(
                user,
                existing.schedulerUuid,
                schedulerInput,
                { validateGoogleSheet: false },
            );
        } else {
            await this.schedulerService.updateScheduler(
                user,
                existing.schedulerUuid,
                schedulerInput,
            );
        }
        if (existing.enabled !== delivery.enabled) {
            await this.schedulerService.setSchedulerEnabled(
                user,
                existing.schedulerUuid,
                delivery.enabled,
            );
        }
        return { action: PromotionAction.UPDATE };
    }
}
