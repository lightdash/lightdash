import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ContentAsCodeType,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    PossibleAbilities,
    ProjectType,
    SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';
import { hashContentAsCodeDocument } from './contentAsCodeHash';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const USER_UUID = 'user-uuid';

const project = {
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    upstreamProjectUuid: null,
    type: ProjectType.DEFAULT,
    createdByUserUuid: USER_UUID,
};

const makeSessionUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[] = [
        {
            subject: 'ContentAsCode',
            action: ['view', 'create'],
            conditions: { projectUuid: PROJECT_UUID },
        },
    ],
): SessionUser =>
    ({
        userUuid: USER_UUID,
        userId: 1,
        email: 'owner@example.com',
        firstName: 'Sync',
        lastName: 'Owner',
        organizationUuid: ORGANIZATION_UUID,
        role: OrganizationMemberRole.MEMBER,
        isActive: true,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const buildService = (
    appliedRevisionModel: {
        upsertMany: ReturnType<typeof vi.fn>;
        listByProject: ReturnType<typeof vi.fn>;
    },
) =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            get: vi.fn(async () => project),
            getSummary: vi.fn(async () => project),
        } as never,
        savedChartModel: {} as never,
        savedSqlModel: {} as never,
        appModel: {} as never,
        dashboardModel: {} as never,
        spaceModel: {} as never,
        schedulerModel: {} as never,
        schedulerService: {} as never,
        savedChartService: {} as never,
        dashboardService: {} as never,
        schedulerClient: {} as never,
        promoteService: {} as never,
        spacePermissionService: {} as never,
        contentVerificationModel: {} as never,
        contentAsCodeAppliedRevisionModel: appliedRevisionModel as never,
        groupsModel: {} as never,
        organizationMemberProfileModel: {} as never,
        userModel: {} as never,
    });

describe('CoderService applied revisions', () => {
    it('returns an empty sync status when no revisions exist', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(async () => []),
        };
        const service = buildService(appliedRevisionModel);

        await expect(
            service.getContentAsCodeSyncStatus(
                makeSessionUser(),
                PROJECT_UUID,
            ),
        ).resolves.toEqual({
            lastAppliedAt: null,
            revisionCount: 0,
            revisions: [],
        });
    });

    it('rejects sync status for viewers without content-as-code access', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(async () => []),
        };
        const service = buildService(appliedRevisionModel);

        await expect(
            service.getContentAsCodeSyncStatus(makeSessionUser([]), PROJECT_UUID),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(appliedRevisionModel.listByProject).not.toHaveBeenCalled();
    });

    it('stores valid revisions and returns the latest applied timestamp', async () => {
        const appliedAt = new Date('2026-08-25T12:00:00.000Z');
        const revision = {
            contentType: ContentAsCodeType.CHART,
            slug: 'orders',
            contentHash: hashContentAsCodeDocument({ slug: 'orders' }),
            appliedAt,
            appliedByUserUuid: USER_UUID,
        };
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(async () => [revision]),
        };
        const service = buildService(appliedRevisionModel);

        await expect(
            service.upsertContentAsCodeAppliedRevisions(
                makeSessionUser(),
                PROJECT_UUID,
                [
                    {
                        contentType: ContentAsCodeType.CHART,
                        slug: 'orders',
                        contentHash: revision.contentHash,
                    },
                ],
            ),
        ).resolves.toEqual({
            lastAppliedAt: appliedAt,
            revisionCount: 1,
            revisions: [revision],
        });
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalledWith(
            PROJECT_UUID,
            USER_UUID,
            [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    contentHash: revision.contentHash,
                },
            ],
        );
    });

    it('rejects invalid content hashes on write', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(),
        };
        const service = buildService(appliedRevisionModel);

        await expect(
            service.upsertContentAsCodeAppliedRevisions(
                makeSessionUser(),
                PROJECT_UUID,
                [
                    {
                        contentType: ContentAsCodeType.CHART,
                        slug: 'orders',
                        contentHash: 'not-a-hash',
                    },
                ],
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
    });
});
