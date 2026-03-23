import { Ability } from '@casl/ability';
import {
    ContentType,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';

const dashboardData = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'dashboard-uuid',
};

const verificationInfo = {
    verifiedBy: {
        userUuid: 'user-uuid',
        firstName: 'Test',
        lastName: 'User',
    },
    verifiedAt: new Date(),
};

const adminUser = {
    userUuid: 'user-uuid',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'manage' },
        { subject: 'Dashboard', action: ['view', 'update', 'delete'] },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const editorUser = {
    ...adminUser,
    userUuid: 'editor-uuid',
    email: 'editor@test.com',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Dashboard', action: ['view', 'update'] },
    ]),
};

const featureFlagService = {
    get: jest.fn(),
};

const dashboardModel = {
    getByIdOrSlug: jest.fn(async () => dashboardData),
};

const contentVerificationModel = {
    verify: jest.fn(async () => undefined),
    unverify: jest.fn(async () => undefined),
    getByContent: jest.fn(async () => verificationInfo),
};

jest.spyOn(analyticsMock, 'track');

describe('DashboardService - Content Verification', () => {
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spaceModel: {} as unknown as SpaceModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        pinnedListModel: {} as unknown as PinnedListModel,
        schedulerModel: {} as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        savedChartModel: {} as unknown as SavedChartModel,
        savedChartService: {} as unknown as SavedChartService,
        projectModel: {} as unknown as ProjectModel,
        slackClient: {} as unknown as SlackClient,
        schedulerClient: {} as unknown as SchedulerClient,
        catalogModel: {} as unknown as CatalogModel,
        spacePermissionService: {} as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        featureFlagService: featureFlagService as unknown as FeatureFlagService,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Feature flag gating', () => {
        it('should throw ForbiddenError on verifyDashboard when flag is disabled', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: false,
            });

            await expect(
                service.verifyDashboard(adminUser, 'dashboard-uuid'),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.verifyDashboard(adminUser, 'dashboard-uuid'),
            ).rejects.toThrow('Content verification is not enabled');

            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError on unverifyDashboard when flag is disabled', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: false,
            });

            await expect(
                service.unverifyDashboard(adminUser, 'dashboard-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });

        it('should allow verifyDashboard when flag is enabled and user is admin', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: true,
            });

            const result = await service.verifyDashboard(
                adminUser,
                'dashboard-uuid',
            );

            expect(result).toEqual(verificationInfo);
            expect(contentVerificationModel.verify).toHaveBeenCalledWith(
                ContentType.DASHBOARD,
                'dashboard-uuid',
                'project-uuid',
                'user-uuid',
            );
        });
    });

    describe('CASL authorization', () => {
        it('should throw ForbiddenError when user lacks manage:ContentVerification', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: true,
            });

            await expect(
                service.verifyDashboard(editorUser, 'dashboard-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });
    });
});
