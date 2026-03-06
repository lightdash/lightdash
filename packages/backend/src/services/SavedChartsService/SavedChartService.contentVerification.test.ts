import { Ability } from '@casl/ability';
import {
    ContentType,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type ChartSummary,
    type ContentVerificationInfo,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SavedChartService } from './SavedChartService';

const chartSummary: Pick<
    ChartSummary,
    'organizationUuid' | 'projectUuid' | 'uuid'
> = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'chart-uuid',
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
        { subject: 'SavedChart', action: ['view', 'update', 'delete'] },
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
        { subject: 'SavedChart', action: ['view', 'update'] },
    ]),
};

const featureFlagService = {
    get: jest.fn(),
};

const savedChartModel = {
    getSummary: jest.fn(async () => chartSummary),
};

const contentVerificationModel = {
    verify: jest.fn(async () => undefined),
    unverify: jest.fn(async () => undefined),
    getByContent: jest.fn(async () => verificationInfo),
};

jest.spyOn(analyticsMock, 'track');

describe('SavedChartService - Content Verification', () => {
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock,
        projectModel: {} as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: {} as SpaceModel,
        analyticsModel: {} as AnalyticsModel,
        pinnedListModel: {} as PinnedListModel,
        schedulerModel: {} as SchedulerModel,
        schedulerService: {} as SchedulerService,
        schedulerClient: {} as SchedulerClient,
        slackClient: {} as SlackClient,
        dashboardModel: {} as DashboardModel,
        catalogModel: {} as CatalogModel,
        permissionsService: {} as PermissionsService,
        googleDriveClient: {} as GoogleDriveClient,
        userService: {} as UserService,
        spacePermissionService: {} as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        featureFlagService: featureFlagService as unknown as FeatureFlagService,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Feature flag gating', () => {
        it('should throw ForbiddenError on verifyChart when flag is disabled', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: false,
            });

            await expect(
                service.verifyChart(adminUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.verifyChart(adminUser, 'chart-uuid'),
            ).rejects.toThrow('Content verification is not enabled');

            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError on unverifyChart when flag is disabled', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: false,
            });

            await expect(
                service.unverifyChart(adminUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });

        it('should allow verifyChart when flag is enabled and user is admin', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: true,
            });

            const result = await service.verifyChart(adminUser, 'chart-uuid');

            expect(result).toEqual(verificationInfo);
            expect(contentVerificationModel.verify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
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
                service.verifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.verifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow('Only admins can verify charts');

            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError on unverifyChart for non-admin', async () => {
            featureFlagService.get.mockResolvedValue({
                id: FeatureFlags.ContentVerification,
                enabled: true,
            });

            await expect(
                service.unverifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });
    });
});
