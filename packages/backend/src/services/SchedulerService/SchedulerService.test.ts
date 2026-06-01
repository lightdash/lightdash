import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
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
    options: { formatted: true, limit: 'table' },
    enabled: true,
    includeLinks: true,
};

const schedulerModel = {
    getScheduler: jest.fn(async () => chartSchedulerInPrivateSpace),
};

const savedChartModel = {
    getSummary: jest.fn(async () => ({
        organizationUuid,
        projectUuid,
        spaceUuid: privateSpaceUuid,
    })),
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

describe('SchedulerService', () => {
    const service = new SchedulerService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        dashboardModel: {} as DashboardModel,
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
});
