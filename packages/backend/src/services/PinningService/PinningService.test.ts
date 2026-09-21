import {
    DirectAccessResourceType,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ResourceViewItemType,
    SpaceMemberRole,
    type RegisteredAccount,
    type ResourceViewDocumentItem,
} from '@lightdash/common';
import { DocumentService } from '../DocumentService/DocumentService';
import { PinningService } from './PinningService';

const projectUuid = 'project';
const organizationUuid = 'organization';
const documentUuid = 'document';
const pinnedListUuid = 'pinned-list';
const userUuid = 'reader';
const document = {
    documentUuid,
    projectUuid,
    organizationUuid,
    spaceUuid: 'space',
    name: 'Private report',
    slug: 'private-report',
    pinnedListUuid,
};
const pinnedDocument: ResourceViewDocumentItem = {
    type: ResourceViewItemType.DOCUMENT,
    data: {
        uuid: documentUuid,
        projectUuid,
        organizationUuid,
        spaceUuid: 'space',
        name: 'Private report',
        slug: 'private-report',
        description: '',
        createdByUserUuid: userUuid,
        updatedAt: new Date(),
        directAccessRoles: [],
        views: 0,
        firstViewedAt: null,
        pinnedListUuid,
        pinnedListOrder: 1,
        verification: null,
    },
};
const accountFor = (role = OrganizationMemberRole.ADMIN): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid },
        user: {
            userUuid,
            role,
            ability: getUserAbilityBuilder({
                user: { userUuid, organizationUuid, role },
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
    const context = {
        projectUuid,
        organizationUuid,
        inheritsFromOrgOrProject: true,
        access: [],
    };
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ projectUuid, organizationUuid }),
        get: vi.fn().mockResolvedValue({
            projectUuid,
            organizationUuid,
            pinnedListUuid,
        }),
    };
    const documentModel = {
        getBySlug: vi.fn().mockResolvedValue(document),
        listSummariesByUuid: vi.fn().mockResolvedValue([document]),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue(context),
        resolveAccessBatch: vi.fn().mockResolvedValue([{ context }]),
        getAccessibleSpaceUuids: vi.fn().mockResolvedValue([]),
        getDirectAccessUserUuids: vi.fn().mockResolvedValue({}),
    };
    const directAccessService = {
        findSharedWithMeAccess: vi.fn().mockResolvedValue({
            uuidsByType: {
                [DirectAccessResourceType.DOCUMENT]: [documentUuid],
            },
            rolesByType: {
                [DirectAccessResourceType.DOCUMENT]: {
                    [documentUuid]: [SpaceMemberRole.VIEWER],
                },
            },
        }),
    };
    const documentService = new DocumentService({
        documentModel,
        featureFlagModel,
        projectModel,
        spacePermissionService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    const resourceViewItemModel = {
        getPinnedDocuments: vi.fn().mockResolvedValue([pinnedDocument]),
        getAllSpacesByPinnedListUuid: vi.fn().mockResolvedValue([]),
        getAllowedChartsAndDashboards: vi
            .fn()
            .mockResolvedValue({ charts: [], dashboards: [], apps: [] }),
    };
    const pinnedListModel = {
        addItem: vi.fn().mockResolvedValue(undefined),
        deleteItem: vi.fn().mockResolvedValue(undefined),
        getPinnedListAndItems: vi.fn().mockResolvedValue({ pinnedListUuid }),
        updatePinnedItemsOrder: vi.fn().mockResolvedValue(undefined),
    };
    const service = new PinningService({
        documentService,
        projectModel,
        spacePermissionService,
        directAccessService,
        resourceViewItemModel,
        pinnedListModel,
        spaceModel: { find: vi.fn().mockResolvedValue([]) },
    } as unknown as ConstructorParameters<typeof PinningService>[0]);
    return {
        service,
        documentModel,
        featureFlagModel,
        spacePermissionService,
        resourceViewItemModel,
        pinnedListModel,
        projectModel,
    };
};

describe('Document pins', () => {
    it('pins and unpins a canonical document UUID resolved from its slug', async () => {
        const {
            service,
            documentModel,
            projectModel,
            resourceViewItemModel,
            pinnedListModel,
        } = setup();
        documentModel.getBySlug.mockResolvedValueOnce({
            ...document,
            pinnedListUuid: null,
        });
        await expect(
            service.toggleDocumentPin(accountFor(), projectUuid, document.slug),
        ).resolves.toEqual({
            projectUuid,
            spaceUuid: 'space',
            pinnedListUuid,
            isPinned: true,
        });
        expect(pinnedListModel.addItem).toHaveBeenCalledWith({
            projectUuid,
            documentUuid,
        });
        await expect(
            service.toggleDocumentPin(accountFor(), projectUuid, document.slug),
        ).resolves.toMatchObject({ isPinned: false });
        expect(pinnedListModel.deleteItem).toHaveBeenCalledWith({
            pinnedListUuid,
            documentUuid,
        });
        expect(projectModel.get).not.toHaveBeenCalled();
        expect(resourceViewItemModel.getPinnedDocuments).not.toHaveBeenCalled();
    });

    it('loads the existing pinned content while Document access is still resolving', async () => {
        const {
            service,
            documentModel,
            resourceViewItemModel,
            spacePermissionService,
        } = setup();
        spacePermissionService.getAccessibleSpaceUuids.mockResolvedValue([
            'space',
        ]);
        let resolveDocuments = () => {};
        const documents = new Promise<(typeof document)[]>((resolve) => {
            resolveDocuments = () => resolve([document]);
        });
        documentModel.listSummariesByUuid.mockReturnValue(documents);
        const result = service.getPinnedItems(
            accountFor(),
            projectUuid,
            pinnedListUuid,
        );
        try {
            await vi.waitFor(() => {
                expect(documentModel.listSummariesByUuid).toHaveBeenCalled();
                expect(
                    resourceViewItemModel.getAllowedChartsAndDashboards,
                ).toHaveBeenCalled();
            });
        } finally {
            resolveDocuments();
        }
        expect((await result).map(({ data }) => data.uuid)).toEqual([
            documentUuid,
        ]);
    });

    it('denies pin mutations to a document reader without manage PinnedItems', async () => {
        const { service, pinnedListModel } = setup();
        await expect(
            service.toggleDocumentPin(
                accountFor(OrganizationMemberRole.VIEWER),
                projectUuid,
                document.slug,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(pinnedListModel.addItem).not.toHaveBeenCalled();
        expect(pinnedListModel.deleteItem).not.toHaveBeenCalled();
    });

    it('returns directly shared document pins with their roles without a space access path', async () => {
        const { service, spacePermissionService, resourceViewItemModel } =
            setup();
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                context: {
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
                },
            },
        ]);
        const result = await service.getPinnedItems(
            accountFor(OrganizationMemberRole.VIEWER),
            projectUuid,
            pinnedListUuid,
        );
        expect(
            resourceViewItemModel.getAllowedChartsAndDashboards,
        ).not.toHaveBeenCalled();
        expect(
            resourceViewItemModel.getAllSpacesByPinnedListUuid,
        ).not.toHaveBeenCalled();
        expect(result).toEqual([
            {
                ...pinnedDocument,
                data: {
                    ...pinnedDocument.data,
                    directAccessRoles: [SpaceMemberRole.VIEWER],
                },
            },
        ]);
    });

    it('hides pins and rejects pin/reorder mutations when Documents is disabled', async () => {
        const { service, featureFlagModel, pinnedListModel } = setup();
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(
            service.getPinnedItems(accountFor(), projectUuid, pinnedListUuid),
        ).resolves.toEqual([]);
        await expect(
            service.toggleDocumentPin(accountFor(), projectUuid, document.slug),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.updatePinnedItemsOrder(
                accountFor(),
                projectUuid,
                pinnedListUuid,
                [pinnedDocument],
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(pinnedListModel.updatePinnedItemsOrder).not.toHaveBeenCalled();
    });

    it('omits deleted Documents and rejects reordering stale membership', async () => {
        const { service, documentModel } = setup();
        documentModel.listSummariesByUuid.mockResolvedValue([]);
        documentModel.getBySlug.mockRejectedValue(
            new NotFoundError('Document not found'),
        );
        await expect(
            service.getPinnedItems(accountFor(), projectUuid, pinnedListUuid),
        ).resolves.toEqual([]);
        await expect(
            service.toggleDocumentPin(accountFor(), projectUuid, document.slug),
        ).rejects.toThrow(NotFoundError);
        await expect(
            service.updatePinnedItemsOrder(
                accountFor(),
                projectUuid,
                pinnedListUuid,
                [pinnedDocument],
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('omits inaccessible and cross-project document contexts', async () => {
        const { service, spacePermissionService, resourceViewItemModel } =
            setup();
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                context: {
                    projectUuid,
                    organizationUuid,
                    inheritsFromOrgOrProject: false,
                    access: [],
                },
            },
        ]);
        await expect(
            service.getPinnedItems(
                accountFor(OrganizationMemberRole.VIEWER),
                projectUuid,
                pinnedListUuid,
            ),
        ).resolves.toEqual([]);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                context: {
                    projectUuid: 'other-project',
                    organizationUuid,
                    inheritsFromOrgOrProject: true,
                    access: [],
                },
            },
        ]);
        await expect(
            service.getPinnedItems(accountFor(), projectUuid, pinnedListUuid),
        ).resolves.toEqual([]);
    });

    it('rejects reordering another project list before any write', async () => {
        const { service, pinnedListModel } = setup();
        await expect(
            service.updatePinnedItemsOrder(
                accountFor(),
                projectUuid,
                'other-list',
                [pinnedDocument],
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(pinnedListModel.updatePinnedItemsOrder).not.toHaveBeenCalled();
    });

    it('preserves mixed resource order and permits reordering visible document pins', async () => {
        const {
            service,
            resourceViewItemModel,
            pinnedListModel,
            spacePermissionService,
        } = setup();
        spacePermissionService.getAccessibleSpaceUuids.mockResolvedValue([
            'space',
        ]);
        const app = {
            type: ResourceViewItemType.DATA_APP,
            data: { uuid: 'app', pinnedListOrder: 0 },
        };
        resourceViewItemModel.getAllowedChartsAndDashboards.mockResolvedValue({
            charts: [],
            dashboards: [],
            apps: [app],
        });
        const result = await service.updatePinnedItemsOrder(
            accountFor(),
            projectUuid,
            pinnedListUuid,
            [pinnedDocument],
        );
        expect(result.map(({ data }) => data.uuid)).toEqual([
            'app',
            documentUuid,
        ]);
        expect(pinnedListModel.updatePinnedItemsOrder).toHaveBeenCalledWith(
            projectUuid,
            pinnedListUuid,
            [pinnedDocument],
        );
    });
});
