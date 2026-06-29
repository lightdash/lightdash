import { Ability, RawRuleOf } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    type ChartScheduler,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppModel } from '../../models/AppModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { JobModel } from '../../models/JobModel/JobModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SchedulerService } from './SchedulerService';

const projectUuid = 'projectUuid';
const organizationUuid = 'organizationUuid';
const privateSpaceUuid = 'private-space-uuid';
const savedChartUuid = 'savedChartUuid';

// An interactive_viewer can `create` ScheduledDeliveries unconditionally within
// a project, but can only `view` charts in spaces they inherit or have access to.
const interactiveViewer: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid,
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.MEMBER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ScheduledDeliveries',
            action: ['create'],
            conditions: { projectUuid },
        },
        {
            subject: 'SavedChart',
            action: ['view'],
            conditions: { projectUuid, inheritsFromOrgOrProject: true },
        },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const chartSchedulerInPrivateSpace: ChartScheduler = {
    schedulerUuid: 'schedulerUuid',
    name: 'scheduler',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'otherUserUuid',
    createdByName: 'other user',
    format: SchedulerFormat.CSV,
    cron: '0 0 * * *',
    savedChartUuid,
    savedChartName: 'chart',
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: null,
    appName: null,
    agentUuid: null,
    prompt: null,
    sourceThreadUuid: null,
    aiSchedulerOptions: null,
    options: { formatted: true, limit: 'table' },
    enabled: true,
    includeLinks: true,
};

const dashboardScheduler = {
    schedulerUuid: 'schedulerUuid',
    name: 'scheduler name',
    dashboardUuid: 'dashboardUuid',
    savedChartUuid: null,
    savedSqlUuid: null,
    appUuid: null,
    targets: [],
} as unknown as SchedulerAndTargets;

const dashboardSummary = {
    organizationUuid,
    projectUuid,
    spaceUuid: 'spaceUuid',
};

const schedulerModel = {
    getScheduler: jest.fn(async () => chartSchedulerInPrivateSpace),
    getSchedulerAndTargets: jest.fn(async () => dashboardScheduler),
};

const savedChartModel = {
    getSummary: jest.fn(async () => ({
        organizationUuid,
        projectUuid,
        spaceUuid: privateSpaceUuid,
    })),
};

const dashboardModel = {
    getByIdOrSlug: jest.fn(async () => dashboardSummary),
};

const spacePermissionService = {
    getSpaceAccessContext: jest.fn(async () => ({
        inheritsFromOrgOrProject: false,
        access: [],
    })),
};

const schedulerClient = {
    addScheduledDeliveryJob: jest.fn(async () => ({})),
};

const buildUser = (
    abilities: RawRuleOf<Ability<PossibleAbilities>>[],
): SessionUser =>
    ({
        userUuid: 'userUuid',
        organizationUuid,
        organizationName: 'organizationName',
        organizationCreatedAt: new Date(),
        role: OrganizationMemberRole.VIEWER,
        ability: new Ability<PossibleAbilities>(abilities),
    }) as unknown as SessionUser;

const buildService = () =>
    new SchedulerService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: {} as SavedSqlModel,
        appModel: {} as AppModel,
        projectModel: {} as ProjectModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        slackClient: {} as SlackClient,
        emailClient: {} as EmailClient,
        userModel: {} as UserModel,
        googleDriveClient: {} as GoogleDriveClient,
        userService: {} as UserService,
        jobModel: {} as JobModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

describe('SchedulerService', () => {
    const service = buildService();

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('sendSchedulerByUuid', () => {
        test('should throw ForbiddenError when user cannot view the underlying resource', async () => {
            await expect(
                service.sendSchedulerByUuid(
                    interactiveViewer,
                    chartSchedulerInPrivateSpace.schedulerUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).not.toHaveBeenCalled();
        });
    });

    describe('getScheduler', () => {
        test('returns the scheduler when the user can view the underlying resource', async () => {
            const user = buildUser([
                { subject: 'Dashboard', action: ['view'] },
            ]);

            const result = await service.getScheduler(user, 'schedulerUuid');

            expect(result).toEqual(dashboardScheduler);
            expect(schedulerModel.getSchedulerAndTargets).toHaveBeenCalledWith(
                'schedulerUuid',
            );
        });

        test('throws ForbiddenError when the user cannot view the underlying resource', async () => {
            const user = buildUser([]);

            await expect(
                service.getScheduler(user, 'schedulerUuid'),
            ).rejects.toThrowError(ForbiddenError);
        });

        test('throws ForbiddenError when the user is not part of an organization', async () => {
            const user = {
                ...buildUser([{ subject: 'Dashboard', action: ['view'] }]),
                organizationUuid: undefined,
            } as unknown as SessionUser;

            await expect(
                service.getScheduler(user, 'schedulerUuid'),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                schedulerModel.getSchedulerAndTargets,
            ).not.toHaveBeenCalled();
        });
    });

    describe('reassignSchedulerOwner', () => {
        const gsheetsScheduler: ChartScheduler = {
            ...chartSchedulerInPrivateSpace,
            schedulerUuid: 'gsheetsSchedulerUuid',
            createdBy: 'currentOwnerUuid',
            format: SchedulerFormat.GSHEETS,
        };

        // manage:ScheduledDeliveries but NOT manage:GoogleSheets (custom role)
        const actorWithoutGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        const actorWithGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        // create:ScheduledDeliveries but NOT create:GoogleSheets (custom role)
        const newOwnerWithoutGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { projectUuid },
            },
        ]);

        const newOwnerWithGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { projectUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['create'],
                conditions: { projectUuid },
            },
        ]);

        const buildReassignService = (newOwner: SessionUser) => {
            const projectModel = {
                getSummary: jest.fn(async () => ({
                    organizationUuid,
                    projectUuid,
                })),
            };
            const reassignSchedulerModel = {
                getSchedulersByUuid: jest.fn(async () => [gsheetsScheduler]),
                updateOwner: jest.fn(async () => {}),
            };
            const userModel = {
                findSessionUserAndOrgByUuid: jest.fn(async () => newOwner),
                getRefreshToken: jest.fn(async () => 'refresh-token'),
            };

            const reassignService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel:
                    reassignSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: savedChartModel as unknown as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {} as AppModel,
                projectModel: projectModel as unknown as ProjectModel,
                schedulerClient: schedulerClient as unknown as SchedulerClient,
                slackClient: {} as SlackClient,
                emailClient: {} as EmailClient,
                userModel: userModel as unknown as UserModel,
                googleDriveClient: {} as GoogleDriveClient,
                userService: {} as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });

            return { reassignService, reassignSchedulerModel };
        };

        test('should throw ForbiddenError when actor lacks manage:GoogleSheets for a GSHEETS scheduler', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithGoogleSheets);

            await expect(
                reassignService.reassignSchedulerOwner(
                    actorWithoutGoogleSheets,
                    projectUuid,
                    [gsheetsScheduler.schedulerUuid],
                    newOwnerWithGoogleSheets.userUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(reassignSchedulerModel.updateOwner).not.toHaveBeenCalled();
        });

        test('should throw ForbiddenError when new owner lacks manage:GoogleSheets for a GSHEETS scheduler', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithoutGoogleSheets);

            await expect(
                reassignService.reassignSchedulerOwner(
                    actorWithGoogleSheets,
                    projectUuid,
                    [gsheetsScheduler.schedulerUuid],
                    newOwnerWithoutGoogleSheets.userUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(reassignSchedulerModel.updateOwner).not.toHaveBeenCalled();
        });

        test('should reassign GSHEETS scheduler when both actor and new owner have manage:GoogleSheets', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithGoogleSheets);

            await reassignService.reassignSchedulerOwner(
                actorWithGoogleSheets,
                projectUuid,
                [gsheetsScheduler.schedulerUuid],
                newOwnerWithGoogleSheets.userUuid,
            );

            expect(reassignSchedulerModel.updateOwner).toHaveBeenCalledWith(
                [gsheetsScheduler.schedulerUuid],
                newOwnerWithGoogleSheets.userUuid,
            );
        });
    });
});
