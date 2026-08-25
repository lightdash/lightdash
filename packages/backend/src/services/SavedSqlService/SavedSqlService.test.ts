import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SchedulerFormat,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { SavedSqlService } from './SavedSqlService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';
const savedSqlUuid = 'saved-sql-uuid';
const spaceUuid = 'space-uuid';

const sqlChart = {
    savedSqlUuid,
    name: 'Chart',
    organization: { organizationUuid },
    project: { projectUuid },
    space: { uuid: spaceUuid, name: 'Space' },
    dashboard: null as { uuid: string; name: string } | null,
};

const baseUser = {
    userId: 1,
    userUuid: 'user-uuid',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    isActive: true,
    timezone: null,
    isPending: false,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const adminUser = {
    ...baseUser,
    userUuid: 'admin-uuid',
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ScheduledDeliveries',
            action: 'manage',
            conditions: { organizationUuid },
        },
    ]),
};

const editorUser = {
    ...baseUser,
    userUuid: 'editor-uuid',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ScheduledDeliveries',
            action: 'create',
            conditions: { organizationUuid },
        },
        {
            subject: 'ScheduledDeliveries',
            action: 'manage',
            conditions: { organizationUuid, userUuid: 'editor-uuid' },
        },
    ]),
};

const viewerUser = {
    ...baseUser,
    userUuid: 'viewer-uuid',
    role: OrganizationMemberRole.VIEWER,
    ability: new Ability<PossibleAbilities>([]),
};

const createdScheduler = {
    schedulerUuid: 'scheduler-uuid',
    name: 'Test',
    cron: '0 9 * * *',
    timezone: 'UTC',
    format: SchedulerFormat.IMAGE,
    savedChartUuid: null,
    dashboardUuid: null,
    savedSqlUuid,
    createdBy: 'editor-uuid',
    targets: [],
    includeLinks: false,
    plainTextEmail: false,
    enabled: true,
    options: {},
};

const savedSqlModel = {
    getByUuid: vi.fn(async () => sqlChart),
};
const schedulerModel = {
    getSqlChartSchedulers: vi.fn(async () => []),
    createScheduler: vi.fn(async () => createdScheduler),
};
const spacePermissionService = {
    can: vi.fn(async () => true),
};

const newSchedulerPayload = {
    name: 'Test',
    cron: '0 9 * * *',
    timezone: 'UTC',
    format: SchedulerFormat.IMAGE,
    options: {},
    targets: [],
    includeLinks: false,
    plainTextEmail: false,
    enabled: true,
    appUuid: null,
    appName: null,
};

describe('SavedSqlService - Scheduler authorization (PROD-7098)', () => {
    const service = new SavedSqlService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        schedulerClient: {} as unknown as SchedulerClient,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

    afterEach(() => vi.clearAllMocks());

    describe('getSchedulers', () => {
        it('admin lists all SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(adminUser, projectUuid, savedSqlUuid),
            ).resolves.toEqual([]);
            expect(schedulerModel.getSqlChartSchedulers).toHaveBeenCalledWith(
                savedSqlUuid,
                undefined,
            );
        });

        it('editor lists only their own SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(editorUser, projectUuid, savedSqlUuid),
            ).resolves.toEqual([]);
            expect(schedulerModel.getSqlChartSchedulers).toHaveBeenCalledWith(
                savedSqlUuid,
                'editor-uuid',
            );
        });

        it('viewer is blocked from listing SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(viewerUser, projectUuid, savedSqlUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerModel.getSqlChartSchedulers).not.toHaveBeenCalled();
        });

        it('user without space access is blocked', async () => {
            spacePermissionService.can.mockResolvedValueOnce(false);
            await expect(
                service.getSchedulers(editorUser, projectUuid, savedSqlUuid),
            ).rejects.toThrow(
                "You don't have access to the space this chart belongs to",
            );
            expect(schedulerModel.getSqlChartSchedulers).not.toHaveBeenCalled();
        });
    });

    describe('createScheduler', () => {
        it('admin can create scheduler on SQL chart', async () => {
            await expect(
                service.createScheduler(
                    adminUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).resolves.toBeDefined();
        });

        it('editor can create scheduler on SQL chart (PROD-7098 fix)', async () => {
            await expect(
                service.createScheduler(
                    editorUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).resolves.toBeDefined();
        });

        it('viewer is blocked from creating scheduler', async () => {
            await expect(
                service.createScheduler(
                    viewerUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        it('user without space access is blocked from creating scheduler', async () => {
            spacePermissionService.can.mockResolvedValueOnce(false);
            await expect(
                service.createScheduler(
                    editorUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).rejects.toThrow(
                "You don't have access to the space this chart belongs to",
            );
            expect(schedulerModel.createScheduler).not.toHaveBeenCalled();
        });
    });
});

describe('SavedSqlService - dashboard-owned chart access', () => {
    const owningDashboardUuid = 'owning-dashboard-uuid';
    const accessContext = {
        organizationUuid,
        projectUuid,
        inheritsFromOrgOrProject: true,
        access: [],
    };
    const directAccessModel = {
        getByUuid: vi.fn(async () => sqlChart),
        resolveColorPalette: vi.fn(async () => null),
    };
    const directAccessPermissionService = {
        getDashboardAccessContext: vi.fn(async () => ({
            ...accessContext,
            directOnly: true,
        })),
        getSpacesAccessContext: vi.fn(async () => ({
            [spaceUuid]: accessContext,
        })),
    };
    const service = new SavedSqlService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedSqlModel: directAccessModel as unknown as SavedSqlModel,
        schedulerClient: {} as unknown as SchedulerClient,
        schedulerModel: {} as unknown as SchedulerModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        spacePermissionService:
            directAccessPermissionService as unknown as SpacePermissionService,
    });
    const chartViewer = {
        ...baseUser,
        role: OrganizationMemberRole.VIEWER,
        ability: new Ability<PossibleAbilities>([
            { subject: 'SavedChart', action: 'view' },
        ]),
    };

    afterEach(() => vi.clearAllMocks());

    it('authorizes a dashboard-owned sql chart through its dashboard access context', async () => {
        directAccessModel.getByUuid.mockResolvedValueOnce({
            ...sqlChart,
            dashboard: { uuid: owningDashboardUuid, name: 'Dashboard' },
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).hasAccess(
                'view',
                { user: chartViewer, projectUuid },
                { savedSqlUuid },
            ),
        ).resolves.toEqual({ ...accessContext, directOnly: true });
        expect(
            directAccessPermissionService.getDashboardAccessContext,
        ).toHaveBeenCalledWith(chartViewer.userUuid, {
            uuid: owningDashboardUuid,
            spaceUuid,
        });
        expect(
            directAccessPermissionService.getSpacesAccessContext,
        ).not.toHaveBeenCalled();
    });

    it('authorizes a space sql chart through its space access context', async () => {
        directAccessModel.getByUuid.mockResolvedValueOnce({
            ...sqlChart,
            dashboard: null,
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).hasAccess(
                'view',
                { user: chartViewer, projectUuid },
                { savedSqlUuid },
            ),
        ).resolves.toEqual({ ...accessContext, directOnly: false });
        expect(
            directAccessPermissionService.getDashboardAccessContext,
        ).not.toHaveBeenCalled();
        expect(
            directAccessPermissionService.getSpacesAccessContext,
        ).toHaveBeenCalledWith(chartViewer.userUuid, [spaceUuid]);
    });

    it('does not expose the private space name to a grant-only user', async () => {
        const ownedChart = {
            ...sqlChart,
            dashboard: { uuid: owningDashboardUuid, name: 'Dashboard' },
        };
        directAccessModel.getByUuid.mockResolvedValue(ownedChart);

        const result = await service.getSqlChart(
            chartViewer,
            projectUuid,
            savedSqlUuid,
        );

        expect(result.space.name).toBe('');
        expect(result.space.uuid).toBe(spaceUuid);
    });
});
