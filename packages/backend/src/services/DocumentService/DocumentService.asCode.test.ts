import {
    ConflictError,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    PromotionAction,
    SpaceMemberRole,
    type Document,
    type DocumentAsCode,
    type RegisteredAccount,
} from '@lightdash/common';
import { DocumentService } from './DocumentService';

const userUuid = 'document-author';
const organizationUuid = 'document-organization';
const projectUuid = 'document-project';
const spaceUuid = 'document-space';
const otherSpaceUuid = 'other-space';
const documentUuid = 'document-uuid';
const versionUuid = 'document-version';

const document: Document = {
    pinnedListUuid: null,
    verification: null,
    createdBy: null,
    owner: null,
    documentUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    name: 'Review',
    slug: 'review',
    description: 'Quarterly review',
    createdByUserUuid: userUuid,
    ownerUserUuid: null,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    version: {
        versionUuid,
        versionNumber: 1,
        schemaVersion: 2,
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
        content: { markdown: '# Findings', charts: {} },
    },
};

const asCode: DocumentAsCode = {
    name: document.name,
    slug: document.slug,
    description: document.description,
    spaceSlug: 'reports',
    schemaVersion: 2,
    ...document.version.content,
};

const spaces = [
    { uuid: spaceUuid, path: 'reports' },
    { uuid: otherSpaceUuid, path: 'archive' },
];

const makeAccount = (role = OrganizationMemberRole.EDITOR): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid },
        user: {
            id: userUuid,
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
    const documentModel = {
        get: vi.fn().mockResolvedValue(document),
        getBySlug: vi.fn().mockResolvedValue(document),
        list: vi.fn().mockResolvedValue([document]),
        listSpaceUuids: vi.fn().mockResolvedValue([spaceUuid]),
        create: vi.fn().mockResolvedValue(document),
        updateMetadata: vi.fn().mockResolvedValue(document),
        updateContent: vi.fn().mockResolvedValue(document),
        moveToSpace: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
        projectUuid,
        organizationUuid,
        inheritsFromOrgOrProject: true,
        access: [{ userUuid, role: SpaceMemberRole.EDITOR }],
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue(context),
        resolveAccessBatch: vi.fn(async (_user: string, items: unknown[]) =>
            items.map(() => ({ context })),
        ),
    };
    const service = new DocumentService({
        contentVerificationModel: {
            getByContent: vi.fn().mockResolvedValue(null),
            verify: vi.fn(),
            unverify: vi.fn(),
        },
        analytics: { track: vi.fn() },
        documentModel,
        featureFlagModel,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ projectUuid, organizationUuid }),
        },
        spaceModel: {
            find: vi.fn(
                async (filters: { path?: string; spaceUuids?: string[] }) =>
                    spaces.filter(
                        ({ uuid, path }) =>
                            path === filters.path ||
                            filters.spaceUuids?.includes(uuid),
                    ),
            ),
        },
        spacePermissionService,
        directAccessService: {
            findSharedWithMeUuids: vi.fn().mockResolvedValue({ document: [] }),
        },
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    return {
        service,
        documentModel,
        featureFlagModel,
        spacePermissionService,
        context,
    };
};

const writes = (documentModel: ReturnType<typeof setup>['documentModel']) => [
    documentModel.create,
    documentModel.updateMetadata,
    documentModel.updateContent,
    documentModel.moveToSpace,
];

describe('DocumentService.upsertAsCode', () => {
    it('leaves an unchanged download untouched', async () => {
        const { service, documentModel } = setup();

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', asCode),
        ).resolves.toBe(PromotionAction.NO_CHANGES);

        writes(documentModel).forEach((write) =>
            expect(write).not.toHaveBeenCalled(),
        );
    });

    it('creates a Document with the file slug in the named space', async () => {
        const { service, documentModel } = setup();
        documentModel.getBySlug.mockRejectedValue(
            new NotFoundError('Document not found'),
        );

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', asCode),
        ).resolves.toBe(PromotionAction.CREATE);

        expect(documentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: 'review',
                spaceUuid,
                name: 'Review',
                content: document.version.content,
            }),
        );
    });

    it('saves changed content as a new version of the version it read', async () => {
        const { service, documentModel } = setup();
        const content = { markdown: 'Updated', charts: {} };

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', {
                ...asCode,
                ...content,
            }),
        ).resolves.toBe(PromotionAction.UPDATE);

        expect(documentModel.updateContent).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            expect.objectContaining({ baseVersionUuid: versionUuid, content }),
            userUuid,
        );
        expect(documentModel.updateMetadata).not.toHaveBeenCalled();
        expect(documentModel.moveToSpace).not.toHaveBeenCalled();
    });

    it('updates metadata and moves the Document to the named space', async () => {
        const { service, documentModel } = setup();

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', {
                ...asCode,
                name: 'Renamed',
                spaceSlug: 'archive',
            }),
        ).resolves.toBe(PromotionAction.UPDATE);

        expect(documentModel.updateContent).not.toHaveBeenCalled();
        expect(documentModel.updateMetadata).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            expect.objectContaining({ name: 'Renamed' }),
        );
        expect(documentModel.moveToSpace).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceSpaceUuid: spaceUuid,
                targetSpaceUuid: otherSpaceUuid,
            }),
            expect.anything(),
        );
    });

    it('writes nothing when the named space does not allow the move', async () => {
        const { service, documentModel, spacePermissionService, context } =
            setup();
        spacePermissionService.resolveAccess.mockImplementation(
            async (_user: string, target: { spaceUuid: string }) =>
                target.spaceUuid === otherSpaceUuid
                    ? {
                          ...context,
                          isPrivate: true,
                          inheritsFromOrgOrProject: false,
                          access: [{ userUuid, role: SpaceMemberRole.VIEWER }],
                      }
                    : context,
        );

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', {
                ...asCode,
                spaceSlug: 'archive',
                markdown: '',
            }),
        ).rejects.toThrow(ForbiddenError);

        writes(documentModel).forEach((write) =>
            expect(write).not.toHaveBeenCalled(),
        );
    });

    it('rejects a write when the Document changed after it was read', async () => {
        const { service, documentModel } = setup();
        documentModel.get.mockResolvedValue({
            ...document,
            version: { ...document.version, versionUuid: 'newer-version' },
        });

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', {
                ...asCode,
                name: 'Renamed',
                markdown: '',
            }),
        ).rejects.toThrow(ConflictError);

        writes(documentModel).forEach((write) =>
            expect(write).not.toHaveBeenCalled(),
        );
    });

    it.each([
        ['a viewer', () => makeAccount(OrganizationMemberRole.VIEWER)],
        ['a disabled Documents flag', () => makeAccount()],
    ])('writes nothing for %s', async (label, account) => {
        const { service, documentModel, featureFlagModel } = setup();
        if (label === 'a disabled Documents flag') {
            featureFlagModel.get.mockResolvedValue({ enabled: false });
        }

        await expect(
            service.upsertAsCode(account(), projectUuid, 'review', {
                ...asCode,
                name: 'Renamed',
            }),
        ).rejects.toThrow(ForbiddenError);

        writes(documentModel).forEach((write) =>
            expect(write).not.toHaveBeenCalled(),
        );
    });

    it.each([
        ['a path slug that differs from the file', 'other', asCode],
        ['an unknown field', 'review', { ...asCode, uuid: documentUuid }],
        [
            'an unsupported schema version',
            'review',
            { ...asCode, schemaVersion: 3 },
        ],
        [
            'a schema version 1 file with cells',
            'review',
            {
                name: asCode.name,
                slug: asCode.slug,
                description: asCode.description,
                spaceSlug: asCode.spaceSlug,
                schemaVersion: 1,
                content: { cells: [] },
            },
        ],
        [
            'a chart tag without a chart',
            'review',
            { ...asCode, markdown: '<document-chart id="c1">' },
        ],
    ])('rejects %s', async (_label, slug, input) => {
        const { service, documentModel } = setup();

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, slug, input),
        ).rejects.toThrow(ParameterError);

        writes(documentModel).forEach((write) =>
            expect(write).not.toHaveBeenCalled(),
        );
    });

    it('asks for the space to be uploaded when it does not exist', async () => {
        const { service } = setup();

        await expect(
            service.upsertAsCode(makeAccount(), projectUuid, 'review', {
                ...asCode,
                spaceSlug: 'missing',
            }),
        ).rejects.toThrow('Upload the space before its Documents');
    });
});

describe('DocumentService.listAsCode', () => {
    it('downloads every viewable Document a page at a time', async () => {
        const { service } = setup();

        await expect(
            service.listAsCode(makeAccount(), projectUuid),
        ).resolves.toEqual({
            documents: [asCode],
            missingSlugs: [],
            nextOffset: null,
        });
    });

    it('reports requested slugs that are missing or hidden', async () => {
        const { service, documentModel } = setup();
        documentModel.getBySlug.mockImplementation(
            async (_project: string, slug: string) => {
                if (slug === 'review') {
                    return document;
                }
                throw new NotFoundError('Document not found');
            },
        );

        await expect(
            service.listAsCode(makeAccount(), projectUuid, {
                slugs: ['review', 'hidden'],
            }),
        ).resolves.toEqual({
            documents: [asCode],
            missingSlugs: ['hidden'],
            nextOffset: null,
        });
    });

    it('requires content-as-code access', async () => {
        const { service } = setup();

        await expect(
            service.listAsCode(
                makeAccount(OrganizationMemberRole.VIEWER),
                projectUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
