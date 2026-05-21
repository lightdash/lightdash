import { Ability } from '@casl/ability';
import {
    ContentType,
    ContentVerificationInfo,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PromoteService } from '../PromoteService/PromoteService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CoderService } from './CoderService';

const verificationInfo = {
    verifiedBy: {
        userUuid: 'user-uuid',
        firstName: 'Admin',
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
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'manage' },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const nonAdminUser = {
    ...adminUser,
    userUuid: 'editor-uuid',
    email: 'editor@test.com',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([]),
};

const contentVerificationModel = {
    verify: jest.fn(async () => undefined),
    unverify: jest.fn(async () => undefined),
    getByContent: jest.fn(
        async (): Promise<ContentVerificationInfo | null> => null,
    ),
};

jest.spyOn(analyticsMock, 'track');

const buildService = () =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedChartModel: {} as unknown as SavedChartModel,
        savedSqlModel: {} as unknown as SavedSqlModel,
        dashboardModel: {} as unknown as DashboardModel,
        spaceModel: {} as unknown as SpaceModel,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {} as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
    });

const callSync = (
    service: CoderService,
    args: {
        user: typeof adminUser;
        verified: boolean | undefined;
        contentType?: ContentType;
        contentUuid?: string;
    },
) =>
    // syncVerification is private; access via any for focused branch coverage.
    (
        service as unknown as {
            syncVerification: (input: {
                user: typeof adminUser;
                projectUuid: string;
                organizationUuid: string;
                contentType: ContentType;
                contentUuid: string;
                verified: boolean | undefined;
            }) => Promise<void>;
        }
    ).syncVerification({
        user: args.user,
        projectUuid: 'project-uuid',
        organizationUuid: 'org-uuid',
        contentType: args.contentType ?? ContentType.CHART,
        contentUuid: args.contentUuid ?? 'chart-uuid',
        verified: args.verified,
    });

describe('CoderService - syncVerification', () => {
    let service: CoderService;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        service = buildService();
        warnSpy = jest
            .spyOn(
                (service as unknown as { logger: { warn: () => void } }).logger,
                'warn',
            )
            .mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('no-ops when verified is undefined', async () => {
        await callSync(service, { user: adminUser, verified: undefined });

        expect(contentVerificationModel.getByContent).not.toHaveBeenCalled();
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('verifies when verified=true and content is not currently verified', async () => {
        contentVerificationModel.getByContent.mockResolvedValueOnce(null);

        await callSync(service, { user: adminUser, verified: true });

        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.CHART,
            'chart-uuid',
            'project-uuid',
            'user-uuid',
        );
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.created',
            }),
        );
    });

    it('is idempotent when verified=true and content is already verified', async () => {
        contentVerificationModel.getByContent.mockResolvedValueOnce(
            verificationInfo,
        );

        await callSync(service, { user: adminUser, verified: true });

        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('unverifies when verified=false and content is currently verified', async () => {
        contentVerificationModel.getByContent.mockResolvedValueOnce(
            verificationInfo,
        );

        await callSync(service, { user: adminUser, verified: false });

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.CHART,
            'chart-uuid',
        );
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.deleted',
            }),
        );
    });

    it('is idempotent when verified=false and content is not currently verified', async () => {
        contentVerificationModel.getByContent.mockResolvedValueOnce(null);

        await callSync(service, { user: adminUser, verified: false });

        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('warns and skips when user lacks manage:ContentVerification', async () => {
        await callSync(service, { user: nonAdminUser, verified: true });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(contentVerificationModel.getByContent).not.toHaveBeenCalled();
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('routes dashboard content type correctly', async () => {
        contentVerificationModel.getByContent.mockResolvedValueOnce(null);

        await callSync(service, {
            user: adminUser,
            verified: true,
            contentType: ContentType.DASHBOARD,
            contentUuid: 'dashboard-uuid',
        });

        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            'dashboard-uuid',
            'project-uuid',
            'user-uuid',
        );
    });
});
