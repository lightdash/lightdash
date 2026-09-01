import { Ability } from '@casl/ability';
import {
    AnyType,
    PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardService } from './DashboardService';

const PROJECT_UUID = 'project-uuid';
const SPACE_UUID = 'space-uuid';

const editorUser = {
    userUuid: 'editor-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'delete', subject: 'Dashboard' },
        { action: 'update', subject: 'Dashboard' },
    ]),
} as unknown as SessionUser;

const reviewerUser = {
    userUuid: 'reviewer-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'delete', subject: 'Dashboard' },
        { action: 'manage', subject: 'ContentAsCode' },
        { action: 'update', subject: 'Dashboard' },
    ]),
} as unknown as SessionUser;

const dashboardDao = {
    uuid: 'dashboard-uuid',
    projectUuid: PROJECT_UUID,
    organizationUuid: 'org-uuid',
    slug: 'weekly-kpis',
    name: 'Weekly KPIs',
    spaceUuid: SPACE_UUID,
    tiles: [],
    tabs: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
} as AnyType;

const draftFields = { name: 'Weekly KPIs (edited)' };

type Overrides = {
    settings?: object | undefined;
    snapshot?: object | undefined;
    openDraftsForContent?: { draft: object }[];
    orphanedCharts?: { uuid: string }[];
    softDeleteEnabled?: boolean;
    dashboards?: AnyType[];
    managedSlugs?: string[];
};

const buildService = (overrides: Overrides = {}) => {
    const settingsGet = vi
        .fn()
        .mockResolvedValue(
            'settings' in overrides
                ? overrides.settings
                : { syncEnabled: true },
        );
    const snapshotGet = vi.fn(
        async (_projectUuid: string, _contentType: string, slug: string) => {
            if (overrides.managedSlugs) {
                return overrides.managedSlugs.includes(slug)
                    ? { snapshotHash: 'abc' }
                    : undefined;
            }
            return 'snapshot' in overrides
                ? overrides.snapshot
                : { snapshotHash: 'abc' };
        },
    );
    const upsertOpenDraft = vi.fn(async (args: AnyType) => ({
        uuid: 'draft-uuid',
        draft: args.draft,
    }));
    const listOpenForContent = vi
        .fn()
        .mockResolvedValue(overrides.openDraftsForContent ?? []);
    const getOrphanedCharts = vi
        .fn()
        .mockResolvedValue(overrides.orphanedCharts ?? []);
    const permanentDelete = vi
        .fn()
        .mockImplementation((uuid: string) =>
            Promise.resolve({ uuid, projectUuid: PROJECT_UUID }),
        );
    const dashboardPermanentDelete = vi.fn().mockResolvedValue(dashboardDao);
    const dashboardSoftDelete = vi.fn().mockResolvedValue(dashboardDao);
    const dashboards = overrides.dashboards ?? [dashboardDao];
    const getDashboard = (uuid: string) =>
        dashboards.find((candidate) => candidate.uuid === uuid) ?? dashboardDao;
    const dashboardUpdateMultiple = vi.fn(
        async (_projectUuid: string, updates: AnyType[]) =>
            updates.map((update) => ({
                ...getDashboard(update.uuid),
                ...update,
            })),
    );
    const service = new DashboardService({
        lightdashConfig: {
            ...lightdashConfigMock,
            softDelete: {
                ...lightdashConfigMock.softDelete,
                enabled: overrides.softDeleteEnabled ?? false,
            },
        },
        analytics: analyticsMock,
        dashboardModel: {
            getOrphanedCharts,
            getByIdOrSlug: vi.fn(async (uuid: string) => getDashboard(uuid)),
            updateMultiple: dashboardUpdateMultiple,
            permanentDelete: dashboardPermanentDelete,
            softDelete: dashboardSoftDelete,
        } as AnyType,
        spaceModel: {} as AnyType,
        analyticsModel: {} as AnyType,
        pinnedListModel: {} as AnyType,
        schedulerModel: {} as AnyType,
        searchModel: {} as AnyType,
        schedulerService: {
            softDeleteByDashboardUuid: vi.fn(),
        } as AnyType,
        savedChartModel: { permanentDelete } as AnyType,
        savedSqlModel: {} as AnyType,
        savedChartService: {} as AnyType,
        projectModel: {
            get: vi.fn().mockResolvedValue({
                projectUuid: PROJECT_UUID,
                organizationUuid: 'org-uuid',
            }),
        } as AnyType,
        slackClient: {} as AnyType,
        schedulerClient: {} as AnyType,
        contentAsCodeProjectSettingsModel: { get: settingsGet } as AnyType,
        contentAsCodeSnapshotModel: { get: snapshotGet } as AnyType,
        contentDraftModel: {
            upsertOpenDraft,
            listOpenForContent,
        } as AnyType,
        catalogModel: {} as AnyType,
        organizationModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: true,
                access: [],
                directOnly: false,
            }),
        } as AnyType,
        contentVerificationModel: {
            getByContent: vi.fn().mockResolvedValue(undefined),
        } as AnyType,
    });
    return {
        service,
        settingsGet,
        snapshotGet,
        upsertOpenDraft,
        listOpenForContent,
        permanentDelete,
        dashboardPermanentDelete,
        dashboardSoftDelete,
        dashboardUpdateMultiple,
    };
};

const draftWithChartTile = (savedChartUuid: string) => ({
    draft: {
        tiles: [
            {
                type: 'saved_chart',
                properties: { savedChartUuid, belongsToDashboard: true },
            },
        ],
    },
});

describe('DashboardService drafts gating (sync + git-backed only)', () => {
    afterEach(() => vi.clearAllMocks());

    it('stores a draft for git-backed content when sync is enabled', async () => {
        const { service, upsertOpenDraft } = buildService();
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: PROJECT_UUID,
                contentType: 'dashboard',
                slug: dashboardDao.slug,
                authorUserUuid: editorUser.userUuid,
            }),
        );
        expect(result).toMatchObject({
            name: 'Weekly KPIs (edited)',
            hasUnpublishedChanges: true,
        });
    });

    it('rejects an invalid draft before persisting it', async () => {
        const { service, upsertOpenDraft } = buildService();

        await expect(
            service['maybeStoreDraft'](editorUser, dashboardDao, {
                tiles: 'not-an-array',
            }),
        ).rejects.toThrow('Invalid dashboard draft field: tiles');
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('publishes normally when the repo never opted into sync', async () => {
        const { service, snapshotGet, upsertOpenDraft } = buildService({
            settings: undefined,
        });
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(snapshotGet).not.toHaveBeenCalled();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('publishes normally for content that is not git-backed', async () => {
        const { service, upsertOpenDraft } = buildService({
            snapshot: undefined,
        });
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('publishes normally for content-as-code managers', async () => {
        const { service, upsertOpenDraft } = buildService();
        const result = await service['maybeStoreDraft'](
            reviewerUser,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('turns a Git-backed dashboard move into a portable draft field', async () => {
        const { service, upsertOpenDraft } = buildService();

        const result = await service.update(editorUser, dashboardDao.uuid, {
            name: dashboardDao.name,
            spaceUuid: 'new-space-uuid',
        });

        expect(result).toMatchObject({
            spaceUuid: 'new-space-uuid',
            hasUnpublishedChanges: true,
        });
        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                draft: expect.objectContaining({
                    spaceUuid: 'new-space-uuid',
                }),
            }),
        );
    });

    it('drafts only Git-backed dashboards in a mixed bulk update', async () => {
        const managedDashboard = {
            ...dashboardDao,
            uuid: 'managed-dashboard',
            slug: 'managed-dashboard',
        };
        const uiOnlyDashboard = {
            ...dashboardDao,
            uuid: 'ui-only-dashboard',
            slug: 'ui-only-dashboard',
        };
        const { service, dashboardUpdateMultiple, upsertOpenDraft } =
            buildService({
                dashboards: [managedDashboard, uiOnlyDashboard],
                managedSlugs: [managedDashboard.slug],
            });
        const updates = [managedDashboard, uiOnlyDashboard].map((item) => ({
            uuid: item.uuid,
            name: `${item.name} updated`,
            description: 'Updated description',
            spaceUuid: 'new-space-uuid',
        }));

        const results = await service.updateMultiple(
            editorUser,
            PROJECT_UUID,
            updates,
        );

        expect(upsertOpenDraft).toHaveBeenCalledTimes(1);
        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                contentUuid: managedDashboard.uuid,
                draft: expect.objectContaining({
                    spaceUuid: 'new-space-uuid',
                }),
            }),
        );
        expect(dashboardUpdateMultiple).toHaveBeenCalledWith(PROJECT_UUID, [
            updates[1],
        ]);
        expect(results).toMatchObject([
            { uuid: managedDashboard.uuid, hasUnpublishedChanges: true },
            { uuid: uiOnlyDashboard.uuid },
        ]);
        expect(results[1]).not.toHaveProperty('hasUnpublishedChanges');
    });

    it('persists safe drafts before a mixed bulk publish failure', async () => {
        const managedDashboard = {
            ...dashboardDao,
            uuid: 'managed-dashboard',
            slug: 'managed-dashboard',
        };
        const uiOnlyDashboard = {
            ...dashboardDao,
            uuid: 'ui-only-dashboard',
            slug: 'ui-only-dashboard',
        };
        const { service, dashboardUpdateMultiple, upsertOpenDraft } =
            buildService({
                dashboards: [managedDashboard, uiOnlyDashboard],
                managedSlugs: [managedDashboard.slug],
            });
        dashboardUpdateMultiple.mockRejectedValueOnce(
            new Error('published transaction failed'),
        );
        const updates = [managedDashboard, uiOnlyDashboard].map((item) => ({
            uuid: item.uuid,
            name: `${item.name} updated`,
            description: 'Updated description',
            spaceUuid: item.spaceUuid,
        }));

        await expect(
            service.updateMultiple(editorUser, PROJECT_UUID, updates),
        ).rejects.toThrow('published transaction failed');
        expect(upsertOpenDraft).toHaveBeenCalledTimes(1);
        expect(upsertOpenDraft.mock.invocationCallOrder[0]).toBeLessThan(
            dashboardUpdateMultiple.mock.invocationCallOrder[0],
        );
    });

    it('publishes every bulk dashboard update for a Content as Code manager', async () => {
        const managedDashboard = {
            ...dashboardDao,
            uuid: 'managed-dashboard',
            slug: 'managed-dashboard',
        };
        const { service, dashboardUpdateMultiple, upsertOpenDraft } =
            buildService({
                dashboards: [managedDashboard],
                managedSlugs: [managedDashboard.slug],
            });
        const updates = [
            {
                uuid: managedDashboard.uuid,
                name: 'Manager update',
                description: 'Updated description',
                spaceUuid: managedDashboard.spaceUuid,
            },
        ];

        await service.updateMultiple(reviewerUser, PROJECT_UUID, updates);

        expect(upsertOpenDraft).not.toHaveBeenCalled();
        expect(dashboardUpdateMultiple).toHaveBeenCalledWith(
            PROJECT_UUID,
            updates,
        );
    });

    it('blocks an editor from deleting a Git-backed dashboard', async () => {
        const { service, dashboardPermanentDelete, dashboardSoftDelete } =
            buildService();

        await expect(
            service.delete(editorUser, dashboardDao.uuid),
        ).rejects.toThrow('This dashboard is managed by Content as Code');
        expect(dashboardPermanentDelete).not.toHaveBeenCalled();
        expect(dashboardSoftDelete).not.toHaveBeenCalled();
    });

    it('deletes a UI-only dashboard normally', async () => {
        const { service, dashboardPermanentDelete } = buildService({
            snapshot: undefined,
        });

        await expect(
            service.delete(editorUser, dashboardDao.uuid),
        ).resolves.toBeUndefined();
        expect(dashboardPermanentDelete).toHaveBeenCalledWith(
            dashboardDao.uuid,
        );
    });

    it('soft-deletes a UI-only dashboard normally', async () => {
        const { service, dashboardPermanentDelete, dashboardSoftDelete } =
            buildService({
                snapshot: undefined,
                softDeleteEnabled: true,
            });

        await expect(
            service.delete(editorUser, dashboardDao.uuid),
        ).resolves.toBeUndefined();
        expect(dashboardSoftDelete).toHaveBeenCalledWith(
            dashboardDao.uuid,
            editorUser.userUuid,
        );
        expect(dashboardPermanentDelete).not.toHaveBeenCalled();
    });

    it('deletes normally when Content as Code sync is disabled', async () => {
        const { service, dashboardPermanentDelete, snapshotGet } = buildService(
            { settings: { syncEnabled: false } },
        );

        await expect(
            service.delete(editorUser, dashboardDao.uuid),
        ).resolves.toBeUndefined();
        expect(snapshotGet).not.toHaveBeenCalled();
        expect(dashboardPermanentDelete).toHaveBeenCalledWith(
            dashboardDao.uuid,
        );
    });

    it('lets a content-as-code manager delete a Git-backed dashboard', async () => {
        const { service, dashboardPermanentDelete } = buildService();

        await expect(
            service.delete(reviewerUser, dashboardDao.uuid),
        ).resolves.toBeUndefined();
        expect(dashboardPermanentDelete).toHaveBeenCalledWith(
            dashboardDao.uuid,
        );
    });

    it.each(['softDelete', 'permanentDelete'] as const)(
        'does not let an internal %s call bypass the Git-backed policy',
        async (method) => {
            const { service, dashboardPermanentDelete, dashboardSoftDelete } =
                buildService();

            await expect(
                service[method](editorUser, dashboardDao.uuid, {
                    bypassPermissions: true,
                }),
            ).rejects.toThrow('This dashboard is managed by Content as Code');
            expect(dashboardPermanentDelete).not.toHaveBeenCalled();
            expect(dashboardSoftDelete).not.toHaveBeenCalled();
        },
    );
});

describe('DashboardService draft overlay is opt-in', () => {
    afterEach(() => vi.clearAllMocks());

    const buildReadService = (
        draftFieldsForRead: object = { name: 'Weekly KPIs (drafted)' },
    ) => {
        const findOpenDraft = vi.fn(
            async (
                _projectUuid: string,
                _contentType: string,
                _contentUuid: string,
                authorUserUuid: string,
            ) =>
                authorUserUuid === 'author-uuid'
                    ? {
                          uuid: 'draft-uuid',
                          draft: draftFieldsForRead,
                      }
                    : undefined,
        );
        const findLatestDismissedDraft = vi.fn().mockResolvedValue(undefined);
        const updateDraft = vi.fn();
        const { service } = buildService();
        // Replace the collaborators the read path needs
        (service as AnyType).contentDraftModel = {
            findOpenDraft,
            findLatestDismissedDraft,
            update: updateDraft,
        };
        (service as AnyType).dashboardModel = {
            getByIdOrSlug: vi.fn().mockResolvedValue(dashboardDao),
        };
        (service as AnyType).analyticsModel = {
            addDashboardViewEvent: vi.fn().mockResolvedValue(undefined),
        };
        (service as AnyType).logDashboardLoadedEvent = vi
            .fn()
            .mockResolvedValue(undefined);
        const viewer = {
            userUuid: 'author-uuid',
            ability: new Ability<PossibleAbilities>([
                { action: 'view', subject: 'Dashboard' },
            ]),
        } as unknown as SessionUser;
        return {
            service,
            viewer,
            findOpenDraft,
            findLatestDismissedDraft,
            updateDraft,
        };
    };

    it('getByIdOrSlug returns the published dashboard and never reads drafts', async () => {
        const { service, viewer, findOpenDraft } = buildReadService();

        const dashboard = await service.getByIdOrSlug(viewer, 'weekly-kpis');

        expect(dashboard.name).toBe('Weekly KPIs');
        expect(dashboard.hasUnpublishedChanges).toBeUndefined();
        expect(findOpenDraft).not.toHaveBeenCalled();
    });

    it('getByIdOrSlugForViewer applies the caller own draft', async () => {
        const { service, viewer } = buildReadService();

        const dashboard = await service.getByIdOrSlugForViewer(
            viewer,
            'weekly-kpis',
        );

        expect(dashboard.name).toBe('Weekly KPIs (drafted)');
        expect(dashboard.hasUnpublishedChanges).toBe(true);
    });

    it('returns published content with a typed failure when the author draft is corrupt', async () => {
        const { service, viewer, updateDraft } = buildReadService({
            tiles: 'not-an-array',
        });

        const dashboard = await service.getByIdOrSlugForViewer(
            viewer,
            'weekly-kpis',
        );

        expect(dashboard).toMatchObject({
            name: 'Weekly KPIs',
            tiles: [],
            draftOverlayError: {
                code: 'invalid_dashboard_draft',
                draftUuid: 'draft-uuid',
            },
        });
        expect(dashboard.hasUnpublishedChanges).toBeUndefined();
        expect(updateDraft).not.toHaveBeenCalled();
    });

    it('lets an author discover their dismissed draft from the published dashboard', async () => {
        const { service, viewer, findOpenDraft, findLatestDismissedDraft } =
            buildReadService();
        findOpenDraft.mockResolvedValue(undefined);
        findLatestDismissedDraft.mockResolvedValue({
            uuid: 'dismissed-draft-uuid',
            status: 'dismissed',
        });

        const dashboard = await service.getByIdOrSlugForViewer(
            viewer,
            'weekly-kpis',
        );

        expect(dashboard).toMatchObject({
            name: 'Weekly KPIs',
            dismissedDraftUuid: 'dismissed-draft-uuid',
        });
        expect(findLatestDismissedDraft).toHaveBeenCalledWith(
            PROJECT_UUID,
            'dashboard',
            'dashboard-uuid',
            'author-uuid',
        );
    });

    it('does not expose another author dismissed draft', async () => {
        const { service, viewer, findOpenDraft, findLatestDismissedDraft } =
            buildReadService();
        findOpenDraft.mockResolvedValue(undefined);
        findLatestDismissedDraft.mockImplementation(
            async (
                _projectUuid: string,
                _contentType: string,
                _contentUuid: string,
                authorUserUuid: string,
            ) =>
                authorUserUuid === 'author-uuid'
                    ? { uuid: 'dismissed-draft-uuid', status: 'dismissed' }
                    : undefined,
        );
        const otherViewer = {
            ...viewer,
            userUuid: 'other-viewer-uuid',
        } as SessionUser;

        const dashboard = await service.getByIdOrSlugForViewer(
            otherViewer,
            'weekly-kpis',
        );

        expect(dashboard).not.toHaveProperty('dismissedDraftUuid');
    });

    it('does not expose another author corrupt draft or its failure', async () => {
        const { service, viewer, findOpenDraft } = buildReadService({
            tiles: 'not-an-array',
        });
        const otherViewer = {
            ...viewer,
            userUuid: 'other-viewer-uuid',
        } as SessionUser;

        const dashboard = await service.getByIdOrSlugForViewer(
            otherViewer,
            'weekly-kpis',
        );

        expect(dashboard).toMatchObject({
            name: 'Weekly KPIs',
            tiles: [],
        });
        expect(dashboard).not.toHaveProperty('draftOverlayError');
        expect(findOpenDraft).toHaveBeenCalledWith(
            PROJECT_UUID,
            'dashboard',
            'dashboard-uuid',
            'other-viewer-uuid',
        );
    });
});

describe('DashboardService orphan chart sweep', () => {
    afterEach(() => vi.clearAllMocks());

    it('keeps an orphan chart that an open draft still references', async () => {
        const { service, permanentDelete } = buildService({
            orphanedCharts: [{ uuid: 'chart-in-draft' }],
            openDraftsForContent: [draftWithChartTile('chart-in-draft')],
        });

        await service['deleteOrphanedChartsInDashboards'](
            editorUser,
            PROJECT_UUID,
            dashboardDao.uuid,
        );

        expect(permanentDelete).not.toHaveBeenCalled();
    });

    it('still deletes an orphan chart no draft references', async () => {
        const { service, permanentDelete } = buildService({
            orphanedCharts: [{ uuid: 'chart-in-draft' }, { uuid: 'abandoned' }],
            openDraftsForContent: [draftWithChartTile('chart-in-draft')],
        });

        await service['deleteOrphanedChartsInDashboards'](
            editorUser,
            PROJECT_UUID,
            dashboardDao.uuid,
        );

        expect(permanentDelete).toHaveBeenCalledTimes(1);
        expect(permanentDelete).toHaveBeenCalledWith('abandoned');
    });

    it('ignores draft payloads whose tiles are not the expected shape', async () => {
        const { service, permanentDelete } = buildService({
            orphanedCharts: [{ uuid: 'abandoned' }],
            openDraftsForContent: [
                { draft: { tiles: 'not-an-array' } },
                { draft: { tiles: [null, {}, { properties: null }] } },
                { draft: { name: 'no tiles at all' } },
            ],
        });

        await service['deleteOrphanedChartsInDashboards'](
            editorUser,
            PROJECT_UUID,
            dashboardDao.uuid,
        );

        expect(permanentDelete).toHaveBeenCalledWith('abandoned');
    });
});
