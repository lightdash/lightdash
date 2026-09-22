import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ContentType,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type Document,
    type MemberAbility,
    type RegisteredAccount,
} from '@lightdash/common';
import { DocumentService } from '../DocumentService/DocumentService';
import { FavoritesService } from './FavoritesService';

const projectUuid = '00000000-0000-4000-8000-000000000001';
const documentUuid = '00000000-0000-4000-8000-000000000002';
const organizationUuid = 'organization';
const userUuid = 'reader';
const spaceUuid = 'space';
const document: Document = {
    pinnedListUuid: null,
    createdBy: null,
    documentUuid,
    projectUuid,
    organizationUuid,
    spaceUuid,
    name: 'Weekly report',
    slug: 'weekly-report',
    description: 'Results',
    createdByUserUuid: userUuid,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 1,
        content: {
            cells: [{ type: 'markdown', content: { markdown: '# Report' } }],
        },
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
    },
};

const makeAccount = (
    id = userUuid,
    ability?: MemberAbility,
    role = OrganizationMemberRole.VIEWER,
): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid },
        user: {
            id,
            userUuid: id,
            ability:
                ability ??
                getUserAbilityBuilder({
                    user: {
                        userUuid: id,
                        organizationUuid,
                        role,
                    },
                    projectProfiles: [],
                    permissionsConfig: {
                        pat: { enabled: false, allowedOrgRoles: [] },
                    },
                }).builder.build(),
        },
        isAnonymousUser: () => false,
        isServiceAccount: () => false,
    }) as unknown as RegisteredAccount;

const setup = () => {
    const stored = new Map<
        string,
        { contentType: ContentType; contentUuid: string }[]
    >();
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ projectUuid, organizationUuid }),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const context = {
        projectUuid,
        organizationUuid,
        spaceUuid,
        inheritsFromOrgOrProject: true,
        access: [],
    };
    const spacePermissionService = {
        can: vi.fn().mockResolvedValue(true),
        getAccessibleSpaceUuids: vi.fn().mockResolvedValue([spaceUuid]),
        getDirectAccessUserUuids: vi.fn().mockResolvedValue({}),
        resolveAccess: vi.fn().mockResolvedValue(context),
        resolveAccessBatch: vi.fn().mockResolvedValue([{ context }]),
    };
    const documentModel = {
        get: vi.fn().mockResolvedValue(document),
        getBySlug: vi.fn().mockResolvedValue(document),
        listSummariesByUuid: vi.fn().mockResolvedValue([document]),
    };
    const documentService = new DocumentService({
        documentModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    const directAccessService = {
        findSharedWithMeAccess: vi.fn().mockResolvedValue({
            uuidsByType: { chart: [], dashboard: [], app: [], document: [] },
            rolesByType: { document: {} },
        }),
    };
    const userFavoritesModel = {
        isFavorite: vi.fn(
            async (user: string, type: ContentType, uuid: string) =>
                (stored.get(user) ?? []).some(
                    (row) =>
                        row.contentType === type && row.contentUuid === uuid,
                ),
        ),
        addFavorite: vi.fn(
            async (
                user: string,
                _project: string,
                contentType: ContentType,
                contentUuid: string,
            ) => {
                stored.set(user, [
                    ...(stored.get(user) ?? []),
                    { contentType, contentUuid },
                ]);
            },
        ),
        removeFavorite: vi.fn(
            async (user: string, type: ContentType, uuid: string) => {
                stored.set(
                    user,
                    (stored.get(user) ?? []).filter(
                        (row) =>
                            row.contentType !== type ||
                            row.contentUuid !== uuid,
                    ),
                );
            },
        ),
        getFavoriteUuids: vi.fn(async (user: string) => stored.get(user) ?? []),
        getFavoriteCharts: vi.fn().mockResolvedValue([]),
        getFavoriteDashboards: vi.fn().mockResolvedValue([]),
        getFavoriteApps: vi.fn().mockResolvedValue([]),
        getFavoriteSpaces: vi.fn().mockResolvedValue([]),
        getFavoriteDocuments: vi.fn(async (_project: string, uuids: string[]) =>
            uuids.map((uuid) => ({
                type: ContentType.DOCUMENT,
                data: {
                    uuid,
                    name: document.name,
                    slug: document.slug,
                    directAccessRoles: [],
                },
            })),
        ),
    };
    const service = new FavoritesService({
        analytics: { track: vi.fn() },
        userFavoritesModel,
        projectModel,
        spaceModel: { find: vi.fn().mockResolvedValue([{ uuid: spaceUuid }]) },
        spacePermissionService,
        directAccessService,
        documentService,
        savedChartModel: {
            get: vi
                .fn()
                .mockResolvedValue({ uuid: 'chart', spaceUuid, name: 'Chart' }),
        },
        dashboardModel: {
            getByIdOrSlug: vi.fn().mockResolvedValue({
                uuid: 'dashboard',
                spaceUuid,
                name: 'Dashboard',
            }),
        },
        appModel: {
            getApp: vi.fn().mockResolvedValue({
                app_id: 'app',
                space_uuid: spaceUuid,
                created_by_user_uuid: 'app-owner',
            }),
        },
    } as unknown as ConstructorParameters<typeof FavoritesService>[0]);
    return {
        service,
        stored,
        documentModel,
        featureFlagModel,
        spacePermissionService,
        directAccessService,
        userFavoritesModel,
    };
};

describe('Document favorites', () => {
    it.each([
        [ContentType.CHART, 'chart'],
        [ContentType.DASHBOARD, 'dashboard'],
        [ContentType.DATA_APP, 'app'],
    ])(
        'preserves %s canonical toggles and denies inaccessible resources',
        async (contentType, uuid) => {
            const { service, spacePermissionService, stored } = setup();
            const account = makeAccount(
                userUuid,
                undefined,
                OrganizationMemberRole.INTERACTIVE_VIEWER,
            );
            expect(
                await service.toggleFavorite(
                    account,
                    projectUuid,
                    contentType,
                    'resource-slug',
                ),
            ).toEqual({
                isFavorite: true,
                contentType,
                contentUuid: uuid,
            });
            expect(
                await service.toggleFavorite(
                    account,
                    projectUuid,
                    contentType,
                    uuid,
                ),
            ).toMatchObject({ isFavorite: false });
            spacePermissionService.resolveAccess.mockResolvedValue({
                projectUuid,
                organizationUuid,
                inheritsFromOrgOrProject: false,
                access: [],
            });
            await expect(
                service.toggleFavorite(account, projectUuid, contentType, uuid),
            ).rejects.toThrow(ForbiddenError);
            expect(stored.get(userUuid)).toEqual([]);
        },
    );

    it('resolves a slug to the canonical UUID and keeps toggles personal', async () => {
        const { service } = setup();
        expect(
            await service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.DOCUMENT,
                document.slug,
            ),
        ).toEqual({
            isFavorite: true,
            contentType: ContentType.DOCUMENT,
            contentUuid: documentUuid,
        });
        expect(
            await service.getFavorites(makeAccount('other'), projectUuid),
        ).toEqual([]);
        await service.toggleFavorite(
            makeAccount('other'),
            projectUuid,
            ContentType.DOCUMENT,
            documentUuid,
        );
        expect(
            await service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.DOCUMENT,
                documentUuid,
            ),
        ).toMatchObject({ isFavorite: false });
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual(
            [],
        );
        expect(
            await service.getFavorites(makeAccount('other'), projectUuid),
        ).toEqual([
            expect.objectContaining({
                type: ContentType.DOCUMENT,
                data: expect.objectContaining({ uuid: documentUuid }),
            }),
        ]);
    });

    it('preserves existing Space toggles and results', async () => {
        const { service, userFavoritesModel } = setup();
        const space = {
            type: ContentType.SPACE,
            data: { uuid: spaceUuid, name: 'Reports' },
        };
        userFavoritesModel.getFavoriteSpaces.mockResolvedValue([space]);
        expect(
            await service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.SPACE,
                spaceUuid,
            ),
        ).toMatchObject({ isFavorite: true });
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual([
            {
                ...space,
                data: { ...space.data, access: [], accessListLength: 0 },
            },
        ]);
        expect(
            await service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.SPACE,
                spaceUuid,
            ),
        ).toMatchObject({ isFavorite: false });
    });

    it('hides disabled Documents without failing other favorites or removing stored rows', async () => {
        const { service, featureFlagModel, stored, userFavoritesModel } =
            setup();
        await service.toggleFavorite(
            makeAccount(),
            projectUuid,
            ContentType.DOCUMENT,
            documentUuid,
        );
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        const chart = { type: ContentType.CHART, data: { uuid: 'chart' } };
        userFavoritesModel.getFavoriteCharts.mockResolvedValue([chart]);
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual([
            chart,
        ]);
        await expect(
            service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.DOCUMENT,
                documentUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(stored.get(userUuid)).toHaveLength(1);
        featureFlagModel.get.mockResolvedValue({ enabled: true });
        expect(
            await service.getFavorites(makeAccount(), projectUuid),
        ).toHaveLength(2);
    });

    it('requires Document view permission even when Space view is allowed', async () => {
        const { service, stored, userFavoritesModel } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project');
        builder.can('view', 'Space');
        const account = makeAccount(userUuid, builder.build());
        stored.set(userUuid, [
            { contentType: ContentType.DOCUMENT, contentUuid: documentUuid },
        ]);
        expect(await service.getFavorites(account, projectUuid)).toEqual([]);
        await expect(
            service.toggleFavorite(
                account,
                projectUuid,
                ContentType.DOCUMENT,
                documentUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(userFavoritesModel.removeFavorite).not.toHaveBeenCalled();
    });

    it('keeps direct-only Documents visible with their role, then hides them after access is revoked', async () => {
        const { service, spacePermissionService, directAccessService, stored } =
            setup();
        const context = {
            projectUuid,
            organizationUuid,
            inheritsFromOrgOrProject: false,
            access: [
                {
                    userUuid,
                    role: SpaceMemberRole.VIEWER,
                    grantedVia: 'document',
                },
            ],
        };
        spacePermissionService.getAccessibleSpaceUuids.mockResolvedValue([]);
        spacePermissionService.resolveAccess.mockResolvedValue(context);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context },
        ]);
        directAccessService.findSharedWithMeAccess.mockResolvedValue({
            uuidsByType: {
                chart: [],
                dashboard: [],
                app: [],
                document: [documentUuid],
            },
            rolesByType: {
                document: { [documentUuid]: [SpaceMemberRole.VIEWER] },
            },
        });
        await service.toggleFavorite(
            makeAccount(),
            projectUuid,
            ContentType.DOCUMENT,
            documentUuid,
        );
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual([
            expect.objectContaining({
                data: expect.objectContaining({
                    directAccessRoles: [SpaceMemberRole.VIEWER],
                }),
            }),
        ]);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: { ...context, access: [] } },
        ]);
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual(
            [],
        );
        expect(stored.get(userUuid)).toHaveLength(1);
    });

    it('omits inactive Documents and propagates project-scoped not-found errors on toggle', async () => {
        const { service, documentModel, stored } = setup();
        stored.set(userUuid, [
            { contentType: ContentType.DOCUMENT, contentUuid: documentUuid },
        ]);
        documentModel.listSummariesByUuid.mockResolvedValue([]);
        expect(await service.getFavorites(makeAccount(), projectUuid)).toEqual(
            [],
        );
        documentModel.get.mockRejectedValue(
            new NotFoundError('Document not found'),
        );
        await expect(
            service.toggleFavorite(
                makeAccount(),
                projectUuid,
                ContentType.DOCUMENT,
                documentUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(documentModel.get).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
        );
    });

    it('does not swallow unexpected Document authorization failures', async () => {
        const { service, featureFlagModel, stored } = setup();
        stored.set(userUuid, [
            { contentType: ContentType.DOCUMENT, contentUuid: documentUuid },
        ]);
        featureFlagModel.get.mockRejectedValue(
            new Error('Database unavailable'),
        );
        await expect(
            service.getFavorites(makeAccount(), projectUuid),
        ).rejects.toThrow('Database unavailable');
    });
});
