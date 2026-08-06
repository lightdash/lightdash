import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    PossibleAbilities,
    SchedulerFormat,
    type CreateSchedulerAndTargetsWithoutIds,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SavedChartService } from './SavedChartService';

const chartUuid = 'chart-uuid';
const projectUuid = 'project-uuid';
const organizationUuid = 'org-uuid';
const spaceUuid = 'space-uuid';

const chartSummary = {
    uuid: chartUuid,
    projectUuid,
    organizationUuid,
    spaceUuid,
    name: 'Orders',
};

const editorUser = {
    userUuid: 'user-uuid',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ScheduledDeliveries',
            action: ['create'],
            conditions: { projectUuid },
        },
    ]),
};

describe('SavedChartService createScheduler', () => {
    const schedulerModel = {
        createScheduler: vi.fn(async (input) => ({
            ...input,
            schedulerUuid: 'new-scheduler-uuid',
        })),
    };
    const spacePermissionService = {
        can: vi.fn(async () => true),
    };
    const schedulerClient = {
        generateDailyJobsForScheduler: vi.fn(async () => {}),
    };
    const slackClient = {
        joinChannels: vi.fn(async () => {}),
    };
    const projectModel = {
        get: vi.fn(async () => ({ schedulerTimezone: 'UTC' })),
    };
    const savedChartModel = {
        getSummary: vi.fn(async () => chartSummary),
    };

    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: {} as unknown as SpaceModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        pinnedListModel: {} as unknown as PinnedListModel,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        slackClient: slackClient as unknown as SlackClient,
        dashboardModel: {} as unknown as DashboardModel,
        catalogModel: {} as unknown as CatalogModel,
        permissionsService: {} as unknown as PermissionsService,
        googleDriveClient: {} as unknown as GoogleDriveClient,
        userService: {} as unknown as UserService,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel: {} as unknown as ContentVerificationModel,
        organizationModel: {} as unknown as OrganizationModel,
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Mirrors the equivalent DashboardService/SavedSqlService tests: chart
    // creation never routes through SchedulerService's app-only guard, so a
    // stray appQuerySelections field is not rejected here — it's silently
    // dropped by SchedulerModel.toSchedulerInsert's per-resource whitelist
    // (see SchedulerModel.test.ts), the same way appState already is.
    test('does not reject a stray appQuerySelections field on a chart scheduler create', async () => {
        const newScheduler = {
            name: 'My delivery',
            cron: '0 9 * * *',
            timezone: 'UTC',
            format: SchedulerFormat.CSV,
            options: { formatted: true, limit: 'table' },
            includeLinks: true,
            targets: [],
            appQuerySelections: [
                {
                    captureKey: 'v1:abc123',
                    label: 'Revenue by month',
                    exploreName: 'orders',
                    excluded: false,
                },
            ],
        } as unknown as CreateSchedulerAndTargetsWithoutIds;

        await service.createScheduler(
            editorUser as unknown as Parameters<
                typeof service.createScheduler
            >[0],
            chartUuid,
            newScheduler,
        );

        expect(schedulerModel.createScheduler).toHaveBeenCalledWith(
            expect.objectContaining({ savedChartUuid: chartUuid }),
        );
    });
});
