import { Ability } from '@casl/ability';
import {
    ContentAsCodeType,
    OrganizationMemberRole,
    PossibleAbilities,
    PromotionAction,
    SchedulerFormat,
    type ScheduledDeliveryAsCode,
    type SchedulerAndTargets,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const chartUuid = 'chart-uuid';

const user: SessionUser = {
    userUuid: 'uploader-uuid',
    email: 'uploader@example.com',
    firstName: 'Code',
    lastName: 'Uploader',
    organizationUuid,
    organizationName: 'Test organization',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ability: new Ability<PossibleAbilities>([
        {
            action: ['view', 'manage'],
            subject: 'ContentAsCode',
            conditions: { projectUuid, organizationUuid },
        },
        {
            action: 'manage',
            subject: 'ScheduledDeliveries',
            conditions: { projectUuid, organizationUuid },
        },
    ]),
};

const scheduler: SchedulerAndTargets = {
    schedulerUuid: 'scheduler-uuid',
    slug: 'weekly-orders',
    name: 'Weekly orders',
    message: 'Here are the orders',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'original-owner-uuid',
    createdByName: 'Original owner',
    format: SchedulerFormat.CSV,
    cron: '0 9 * * 1',
    timezone: 'Europe/Madrid',
    savedChartUuid: chartUuid,
    savedChartName: 'Orders',
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: null,
    appName: null,
    options: { formatted: true, limit: 'table' },
    filters: undefined,
    parameters: undefined,
    enabled: true,
    includeLinks: true,
    targets: [
        {
            schedulerEmailTargetUuid: 'email-target-uuid',
            schedulerUuid: 'scheduler-uuid',
            recipient: 'data@example.com',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
    ],
};

const delivery: ScheduledDeliveryAsCode = {
    contentType: ContentAsCodeType.SCHEDULED_DELIVERY,
    version: 1,
    slug: 'weekly-orders',
    name: 'Weekly orders',
    message: 'Here are the orders',
    cron: '0 9 * * 1',
    timezone: 'Europe/Madrid',
    enabled: true,
    includeLinks: true,
    targets: [{ type: 'email', recipient: 'data@example.com' }],
    resource: { type: 'chart', slug: 'orders' },
    format: SchedulerFormat.CSV,
    options: { formatted: true, limit: 'table' },
    filters: null,
    parameters: null,
    customViewportWidth: null,
    selectedTabs: null,
};

const buildService = ({
    existing = null,
}: { existing?: SchedulerAndTargets | null } = {}) => {
    const schedulerModel = {
        getSchedulerForProject: vi.fn(async () => [scheduler]),
        findSchedulerByProjectSlug: vi.fn(async () => existing),
    };
    const schedulerService = {
        updateScheduler: vi.fn(async () => scheduler),
        setSchedulerEnabled: vi.fn(async () => scheduler),
    };
    const savedChartService = {
        createScheduler: vi.fn(async () => scheduler),
    };

    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
            })),
        } as never,
        savedChartModel: {
            getSummary: vi.fn(async () => ({
                uuid: chartUuid,
                slug: 'orders',
            })),
            find: vi.fn(async () => [{ uuid: chartUuid, slug: 'orders' }]),
        } as never,
        savedSqlModel: {} as never,
        dashboardModel: {} as never,
        spaceModel: {} as never,
        schedulerModel: schedulerModel as never,
        schedulerService: schedulerService as never,
        savedChartService: savedChartService as never,
        dashboardService: {} as never,
        schedulerClient: {} as never,
        promoteService: {} as never,
        spacePermissionService: {} as never,
        contentVerificationModel: {} as never,
    });

    return { service, schedulerService, savedChartService };
};

describe('CoderService scheduled deliveries as code', () => {
    it('round-trips dashboard tab UUIDs through portable slugs', () => {
        const dashboard = {
            tabs: [
                { uuid: 'overview-uuid', name: 'Overview', order: 0 },
                {
                    uuid: 'revenue-costs-uuid',
                    name: 'Revenue / Costs',
                    order: 1,
                },
                {
                    uuid: 'revenue-costs-duplicate-uuid',
                    name: 'Revenue - Costs',
                    order: 2,
                },
            ],
        };

        expect(
            CoderService.getDashboardTabSlug(dashboard, 'overview-uuid'),
        ).toBe('overview');
        expect(
            CoderService.getDashboardTabSlug(dashboard, 'revenue-costs-uuid'),
        ).toBe('revenue-costs-1');
        expect(
            CoderService.getDashboardTabSlug(
                dashboard,
                'revenue-costs-duplicate-uuid',
            ),
        ).toBe('revenue-costs-2');
        expect(
            CoderService.getDashboardTabUuid(dashboard, 'revenue-costs-2'),
        ).toBe('revenue-costs-duplicate-uuid');
        expect(
            CoderService.getDashboardTabUuid(dashboard, 'overview-uuid'),
        ).toBe('overview-uuid');
    });

    it('exports a chart delivery by content slug without its owner', async () => {
        const { service } = buildService();

        const result = await service.getScheduledDeliveries(user, projectUuid);

        expect(result.skipped).toEqual([]);
        expect(result.scheduledDeliveries).toHaveLength(1);
        expect(result.scheduledDeliveries[0]).toMatchObject({
            slug: 'weekly-orders',
            resource: { type: 'chart', slug: 'orders' },
            targets: [{ type: 'email', recipient: 'data@example.com' }],
        });
        expect(result.scheduledDeliveries[0]).not.toHaveProperty('createdBy');
    });

    it('makes the uploader the owner when creating a delivery', async () => {
        const { service, savedChartService } = buildService();

        const result = await service.upsertScheduledDelivery(
            user,
            projectUuid,
            delivery.slug,
            delivery,
        );

        expect(result).toEqual({ action: PromotionAction.CREATE });
        expect(savedChartService.createScheduler).toHaveBeenCalledWith(
            user,
            chartUuid,
            expect.not.objectContaining({ createdBy: expect.anything() }),
        );
    });

    it('preserves the existing owner when updating a delivery', async () => {
        const { service, schedulerService } = buildService({
            existing: scheduler,
        });

        const result = await service.upsertScheduledDelivery(
            user,
            projectUuid,
            delivery.slug,
            { ...delivery, name: 'Renamed weekly orders' },
        );

        expect(result).toEqual({ action: PromotionAction.UPDATE });
        expect(schedulerService.updateScheduler).toHaveBeenCalledWith(
            user,
            scheduler.schedulerUuid,
            expect.not.objectContaining({ createdBy: expect.anything() }),
        );
    });

    it('rejects a project-scoped slug already used by another resource', async () => {
        const dashboardScheduler: SchedulerAndTargets = {
            ...scheduler,
            savedChartUuid: null,
            savedChartName: null,
            dashboardUuid: 'dashboard-uuid',
            dashboardName: 'Orders dashboard',
            filters: undefined,
            customViewportWidth: undefined,
            selectedTabs: null,
        };
        const { service, schedulerService } = buildService({
            existing: dashboardScheduler,
        });

        await expect(
            service.upsertScheduledDelivery(
                user,
                projectUuid,
                delivery.slug,
                delivery,
            ),
        ).rejects.toThrow(
            "Scheduled delivery slug 'weekly-orders' is already used by another resource in this project",
        );
        expect(schedulerService.updateScheduler).not.toHaveBeenCalled();
    });

    it('does not reschedule an unchanged delivery', async () => {
        const { service, schedulerService } = buildService({
            existing: scheduler,
        });

        const result = await service.upsertScheduledDelivery(
            user,
            projectUuid,
            delivery.slug,
            delivery,
        );

        expect(result).toEqual({ action: PromotionAction.NO_CHANGES });
        expect(schedulerService.updateScheduler).not.toHaveBeenCalled();
    });

    it('ignores target order and YAML key order when detecting changes', async () => {
        const slackTarget = {
            schedulerSlackTargetUuid: 'slack-target-uuid',
            schedulerUuid: 'scheduler-uuid',
            channel: 'slack-channel',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        };
        const schedulerWithMixedTargets: SchedulerAndTargets = {
            ...scheduler,
            targets: [slackTarget, ...scheduler.targets],
        };
        const deliveryWithYamlOrderedTargets: ScheduledDeliveryAsCode = {
            ...delivery,
            targets: [
                { recipient: 'data@example.com', type: 'email' },
                { channel: 'slack-channel', type: 'slack' },
            ],
        };
        const { service, schedulerService } = buildService({
            existing: schedulerWithMixedTargets,
        });

        const result = await service.upsertScheduledDelivery(
            user,
            projectUuid,
            delivery.slug,
            deliveryWithYamlOrderedTargets,
        );

        expect(result).toEqual({ action: PromotionAction.NO_CHANGES });
        expect(schedulerService.updateScheduler).not.toHaveBeenCalled();
    });

    it('updates an unchanged delivery when forced', async () => {
        const { service, schedulerService } = buildService({
            existing: scheduler,
        });

        const result = await service.upsertScheduledDelivery(
            user,
            projectUuid,
            delivery.slug,
            delivery,
            true,
        );

        expect(result).toEqual({ action: PromotionAction.UPDATE });
        expect(schedulerService.updateScheduler).toHaveBeenCalledOnce();
    });
});
