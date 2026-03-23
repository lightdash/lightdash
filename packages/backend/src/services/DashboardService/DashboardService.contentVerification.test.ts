import { Ability } from '@casl/ability';
import {
    ContentType,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type ContentVerificationInfo,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';

const dashboardData = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'dashboard-uuid',
};

const verificationInfo: ContentVerificationInfo = {
    verifiedBy: {
        userUuid: 'user-uuid',
        firstName: 'Test',
        lastName: 'User',
    },
    verifiedAt: new Date(),
};

const adminUser: SessionUser = {
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

const editorUser: SessionUser = {
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
        spaceModel: {} as SpaceModel,
        analyticsModel: {} as AnalyticsModel,
        pinnedListModel: {} as PinnedListModel,
        schedulerModel: {} as SchedulerModel,
        schedulerService: {} as SchedulerService,
        savedChartModel: {} as SavedChartModel,
        savedChartService: {} as SavedChartService,
        projectModel: {} as ProjectModel,
        slackClient: {} as SlackClient,
        schedulerClient: {} as SchedulerClient,
        catalogModel: {} as CatalogModel,
        spacePermissionService: {} as SpacePermissionService,
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
