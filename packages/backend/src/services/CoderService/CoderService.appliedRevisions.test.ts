import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ContentAsCodeType,
    ForbiddenError,
    NotFoundError,
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

const emptyListPage = {
    missingIds: [],
    spaces: [],
    languageMap: undefined,
};

const mockCurrentContent = (
    service: CoderService,
    charts: Array<{ slug: string; name: string }> = [],
    dashboards: Array<{ slug: string; name: string }> = [],
) => {
    vi.spyOn(service, 'getCharts').mockResolvedValue({
        ...emptyListPage,
        charts: charts as never,
        total: charts.length,
        offset: 0,
    });
    vi.spyOn(service, 'getDashboards').mockResolvedValue({
        ...emptyListPage,
        dashboards: dashboards as never,
        total: dashboards.length,
        offset: 0,
    });
};

const buildService = (appliedRevisionModel: {
    upsertMany: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
}) =>
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
    it('returns an empty sync status when no revisions or instance content exist', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(async () => []),
        };
        const service = buildService(appliedRevisionModel);
        mockCurrentContent(service);

        await expect(
            service.getContentAsCodeSyncStatus(makeSessionUser(), PROJECT_UUID),
        ).resolves.toEqual({
            syncEnabled: true,
            lastAppliedAt: null,
            items: [],
        });
    });

    it('classifies instance charts as ui_only, in_sync, or ahead', async () => {
        const appliedAt = new Date('2026-08-25T12:00:00.000Z');
        const inSyncSnapshot = { slug: 'orders', name: 'Orders' };
        const driftedSnapshot = { slug: 'revenue', name: 'Revenue yesterday' };
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(async () => [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    contentHash: hashContentAsCodeDocument(inSyncSnapshot),
                    snapshot: inSyncSnapshot,
                    appliedAt,
                    appliedByUserUuid: USER_UUID,
                },
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'revenue',
                    contentHash: hashContentAsCodeDocument(driftedSnapshot),
                    snapshot: driftedSnapshot,
                    appliedAt,
                    appliedByUserUuid: USER_UUID,
                },
            ]),
        };
        const service = buildService(appliedRevisionModel);
        mockCurrentContent(service, [
            { slug: 'new-from-ui', name: 'New from UI' },
            { slug: 'orders', name: 'Orders' },
            { slug: 'revenue', name: 'Revenue today' },
        ]);

        await expect(
            service.getContentAsCodeSyncStatus(makeSessionUser(), PROJECT_UUID),
        ).resolves.toEqual({
            syncEnabled: true,
            lastAppliedAt: appliedAt,
            items: [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'new-from-ui',
                    state: 'ui_only',
                    appliedAt: null,
                    contentHash: null,
                    snapshot: null,
                    current: { slug: 'new-from-ui', name: 'New from UI' },
                },
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    state: 'in_sync',
                    appliedAt,
                    contentHash: hashContentAsCodeDocument(inSyncSnapshot),
                    snapshot: inSyncSnapshot,
                    current: { slug: 'orders', name: 'Orders' },
                },
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'revenue',
                    state: 'ahead',
                    appliedAt,
                    contentHash: hashContentAsCodeDocument(driftedSnapshot),
                    snapshot: driftedSnapshot,
                    current: { slug: 'revenue', name: 'Revenue today' },
                },
            ],
        });
    });

    it('rejects sync status for viewers without content-as-code access', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(async () => []),
        };
        const service = buildService(appliedRevisionModel);

        await expect(
            service.getContentAsCodeSyncStatus(
                makeSessionUser([]),
                PROJECT_UUID,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(appliedRevisionModel.listByProject).not.toHaveBeenCalled();
    });

    it('stores the canonical snapshot and hash, then returns the latest applied timestamp', async () => {
        const appliedAt = new Date('2026-08-25T12:00:00.000Z');
        const snapshot = { slug: 'orders', name: 'Orders' };
        const revision = {
            contentType: ContentAsCodeType.CHART,
            slug: 'orders',
            contentHash: hashContentAsCodeDocument(snapshot),
            snapshot,
            appliedAt,
            appliedByUserUuid: USER_UUID,
        };
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(async () => [revision]),
        };
        const service = buildService(appliedRevisionModel);
        mockCurrentContent(service, [{ slug: 'orders', name: 'Orders' }]);

        await expect(
            service.upsertContentAsCodeAppliedRevisions(
                makeSessionUser(),
                PROJECT_UUID,
                [
                    {
                        contentType: ContentAsCodeType.CHART,
                        slug: 'orders',
                        snapshot: {
                            ...snapshot,
                            updatedAt: new Date('2026-08-24T00:00:00.000Z'),
                        },
                    },
                ],
            ),
        ).resolves.toEqual({
            syncEnabled: true,
            lastAppliedAt: appliedAt,
            items: [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    state: 'in_sync',
                    appliedAt,
                    contentHash: revision.contentHash,
                    snapshot,
                    current: { slug: 'orders', name: 'Orders' },
                },
            ],
        });
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalledWith(
            PROJECT_UUID,
            USER_UUID,
            [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    snapshot,
                    contentHash: revision.contentHash,
                },
            ],
        );
    });

    it('rejects snapshots that are not charts or dashboards', async () => {
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
                        contentType: ContentAsCodeType.SPACE,
                        slug: 'finance',
                        snapshot: { slug: 'finance' },
                    } as never,
                ],
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
    });

    it('restamps last-applied to the current instance document', async () => {
        const appliedAt = new Date('2026-08-25T13:00:00.000Z');
        const current = { slug: 'orders', name: 'Orders edited in UI' };
        const revision = {
            contentType: ContentAsCodeType.CHART,
            slug: 'orders',
            contentHash: hashContentAsCodeDocument(current),
            snapshot: current,
            appliedAt,
            appliedByUserUuid: USER_UUID,
        };
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(async () => [revision]),
        };
        const service = buildService(appliedRevisionModel);
        mockCurrentContent(service, [
            { slug: 'orders', name: 'Orders edited in UI' },
        ]);

        await expect(
            service.restampContentAsCodeAppliedRevision(
                makeSessionUser(),
                PROJECT_UUID,
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                },
            ),
        ).resolves.toEqual({
            syncEnabled: true,
            lastAppliedAt: appliedAt,
            items: [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    state: 'in_sync',
                    appliedAt,
                    contentHash: revision.contentHash,
                    snapshot: current,
                    current,
                },
            ],
        });
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalledWith(
            PROJECT_UUID,
            USER_UUID,
            [
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'orders',
                    snapshot: current,
                    contentHash: revision.contentHash,
                },
            ],
        );
    });

    it('rejects restamp when the chart does not exist', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(),
            listByProject: vi.fn(),
        };
        const service = buildService(appliedRevisionModel);
        mockCurrentContent(service);

        await expect(
            service.restampContentAsCodeAppliedRevision(
                makeSessionUser(),
                PROJECT_UUID,
                {
                    contentType: ContentAsCodeType.CHART,
                    slug: 'missing',
                },
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
    });
});
