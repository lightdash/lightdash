import { Ability } from '@casl/ability';
import {
    ContentType,
    ContentVerificationInfo,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppModel } from '../../models/AppModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../AiAccessService/agentActionTestUtils.mock';
import { DashboardService } from '../DashboardService/DashboardService';
import { PromoteService } from '../PromoteService/PromoteService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
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
    avatarUrl: null,
    avatarGradient: null,
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
    verify: vi.fn(async () => undefined),
    unverify: vi.fn(async () => undefined),
    getByContent: vi.fn(
        async (): Promise<ContentVerificationInfo | null> => null,
    ),
};

vi.spyOn(analyticsMock, 'track');

const agentActionLogModel = { insert: vi.fn().mockResolvedValue(undefined) };
const buildService = () =>
    new CoderService({
        agentActionLogModel,
        directAccessService: {} as never,
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedChartModel: {} as unknown as SavedChartModel,
        savedSqlModel: {} as unknown as SavedSqlModel,
        appModel: {} as unknown as AppModel,
        dashboardModel: {} as unknown as DashboardModel,
        spaceModel: {} as unknown as SpaceModel,
        schedulerModel: {} as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        savedChartService: {} as unknown as SavedChartService,
        dashboardService: {} as unknown as DashboardService,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {} as unknown as SpacePermissionService,
        contentAsCodeSnapshotModel: {
            upsert: vi.fn(),
        } as unknown as ContentAsCodeSnapshotModel,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as never,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        groupsModel: {} as never,
        organizationMemberProfileModel: {} as never,
        userModel: {} as never,
        warehouseConnectionModel: {} as never,
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
    let warnSpy: import('vitest').MockInstance;

    beforeEach(() => {
        service = buildService();
        warnSpy = vi
            .spyOn(
                (service as unknown as { logger: { warn: () => void } }).logger,
                'warn',
            )
            .mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllMocks();
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

describe.each(agentActionTestCases)(
    'agent verification: %s',
    (_, surface, enabled, count) => {
        test.each([true, false])(
            'records committed verification %s',
            async (verified) => {
                agentActionLogModel.insert.mockClear();
                contentVerificationModel.getByContent.mockResolvedValue(
                    verified ? null : verificationInfo,
                );
                await withAgentActionScope(adminUser, surface, enabled, () =>
                    callSync(buildService(), { user: adminUser, verified }),
                );
                expect(agentActionLogModel.insert).toHaveBeenCalledTimes(count);
                if (count)
                    expect(agentActionLogModel.insert).toHaveBeenCalledWith(
                        expect.objectContaining({
                            object_type: 'content_verification',
                            object_uuid: 'chart-uuid',
                            action: verified ? 'verify' : 'unverify',
                            outcome: 'allowed',
                        }),
                    );
            },
        );
        test('records a skipped policy refusal without content arguments', async () => {
            agentActionLogModel.insert.mockClear();
            await withAgentActionScope(nonAdminUser, surface, enabled, () =>
                callSync(buildService(), {
                    user: nonAdminUser,
                    verified: true,
                }),
            );
            expect(agentActionLogModel.insert).toHaveBeenCalledTimes(count);
            if (count)
                expect(agentActionLogModel.insert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        outcome: 'denied',
                        policy_layer: 'casl',
                        reason_code: 'content_verification_forbidden',
                    }),
                );
        });
    },
);
