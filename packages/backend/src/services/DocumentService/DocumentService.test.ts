import { Ability, AbilityBuilder } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    parseDocumentContent,
    SpaceMemberRole,
    type Document,
    type MemberAbility,
    type RegisteredAccount,
} from '@lightdash/common';
import { DocumentService } from './DocumentService';

const userUuid = 'document-reader';
const organizationUuid = 'document-organization';
const projectUuid = 'document-project';
const spaceUuid = 'document-space';
const documentUuid = 'document-uuid';

const document: Document = {
    pinnedListUuid: null,
    documentUuid,
    projectUuid,
    organizationUuid,
    spaceUuid,
    name: 'Weekly review',
    slug: 'weekly-review',
    description: 'A durable report',
    createdByUserUuid: userUuid,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    version: {
        versionUuid: 'version-uuid',
        versionNumber: 1,
        schemaVersion: 1,
        content: {
            cells: [
                {
                    type: 'markdown',
                    content: { markdown: '# Findings' },
                },
            ],
        },
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
    },
};

const makeAccount = (
    role = OrganizationMemberRole.VIEWER,
    ability?: MemberAbility,
): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid },
        user: {
            id: userUuid,
            userUuid,
            firstName: 'Document',
            lastName: 'Reader',
            email: 'reader@example.com',
            role,
            ability:
                ability ??
                getUserAbilityBuilder({
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

const makeContext = (
    access: { userUuid: string; role: SpaceMemberRole }[] = [],
    inheritsFromOrgOrProject = true,
) => ({
    organizationUuid,
    projectUuid,
    inheritsFromOrgOrProject,
    access,
});

const setup = ({ softDelete = true }: { softDelete?: boolean } = {}) => {
    const documentModel = {
        getLifecycleState: vi.fn().mockResolvedValue({
            ...document,
            deletedAt: null,
            deletedByUserUuid: null,
            spaceDeletedAt: null,
        }),
        softDelete: vi.fn().mockResolvedValue(undefined),
        restore: vi.fn().mockResolvedValue(undefined),
        permanentDelete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(document),
        getBySlug: vi.fn().mockResolvedValue(document),
        list: vi.fn().mockResolvedValue([document]),
        listSpaceUuids: vi.fn().mockResolvedValue([spaceUuid]),
        listSummariesByUuid: vi.fn().mockResolvedValue([]),
        moveToSpace: vi.fn().mockResolvedValue(document),
    };
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ projectUuid, organizationUuid }),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const spacePermissionService = {
        getDocumentDeleteAccessContext: vi
            .fn()
            .mockResolvedValue(makeContext()),
        resolveAccess: vi.fn().mockResolvedValue(makeContext()),
        resolveAccessBatch: vi
            .fn()
            .mockResolvedValue([{ context: makeContext() }]),
    };
    const directAccessService = {
        findSharedWithMeUuids: vi.fn().mockResolvedValue({ document: [] }),
    };
    const spaceModel = {
        find: vi.fn().mockResolvedValue([{ path: 'reports.weekly_review' }]),
    };
    const service = new DocumentService({
        lightdashConfig: { softDelete: { enabled: softDelete } },
        directAccessService,
        documentModel,
        spaceModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    return {
        service,
        spaceModel,
        directAccessService,
        documentModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
    };
};

describe('DocumentService', () => {
    describe('getAsCode', () => {
        test('exports only portable authoring fields for a reader', async () => {
            const { service, spaceModel } = setup();
            const result = await service.getAsCode(
                makeAccount(),
                projectUuid,
                document.slug,
            );
            expect(result).toEqual({
                name: document.name,
                slug: document.slug,
                description: document.description,
                spaceSlug: 'reports/weekly-review',
                schemaVersion: 1,
                content: document.version.content,
            });
            expect(
                parseDocumentContent(result.schemaVersion, result.content),
            ).toEqual(document.version.content);
            expect(spaceModel.find).toHaveBeenCalledWith({
                projectUuid,
                spaceUuids: [document.spaceUuid],
            });
        });

        test('does not read space metadata when Documents are disabled', async () => {
            const { service, featureFlagModel, spaceModel } = setup();
            featureFlagModel.get.mockResolvedValue({ enabled: false });
            await expect(
                service.getAsCode(makeAccount(), projectUuid, document.slug),
            ).rejects.toThrow(ForbiddenError);
            expect(spaceModel.find).not.toHaveBeenCalled();
        });

        test('does not export a private Document without access', async () => {
            const { service, spacePermissionService, spaceModel } = setup();
            spacePermissionService.resolveAccess.mockResolvedValue(
                makeContext([], false),
            );
            await expect(
                service.getAsCode(makeAccount(), projectUuid, document.slug),
            ).rejects.toThrow(NotFoundError);
            expect(spaceModel.find).not.toHaveBeenCalled();
        });

        test('does not export when the source Space is unavailable', async () => {
            const { service, spaceModel } = setup();
            spaceModel.find.mockResolvedValue([]);
            await expect(
                service.getAsCode(makeAccount(), projectUuid, document.slug),
            ).rejects.toThrow(NotFoundError);
        });
    });

    test('UUID read identifiers retain UUID lookup and canonical authorization', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        const identifier = '36d4516a-3af0-48f6-9b47-d50956301501';
        documentModel.get.mockResolvedValue({
            ...document,
            documentUuid: identifier,
        });
        await expect(
            service.getByIdOrSlug(makeAccount(), projectUuid, identifier),
        ).resolves.toMatchObject({ documentUuid: identifier });
        expect(documentModel.get).toHaveBeenCalledWith(projectUuid, identifier);
        expect(documentModel.getBySlug).not.toHaveBeenCalled();
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            {
                type: 'document',
                documentUuid: identifier,
                spaceUuid,
            },
        );
    });

    test('slug read identifiers resolve before permission checks', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        await expect(
            service.getByIdOrSlug(makeAccount(), projectUuid, document.slug),
        ).resolves.toMatchObject(document);
        expect(documentModel.getBySlug).toHaveBeenCalledWith(
            projectUuid,
            document.slug,
        );
        expect(documentModel.get).not.toHaveBeenCalled();
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            {
                type: 'document',
                documentUuid,
                spaceUuid,
            },
        );
    });

    test('slug read identifiers cannot bypass the feature flag', async () => {
        const { service, documentModel, featureFlagModel } = setup();
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(
            service.getByIdOrSlug(makeAccount(), projectUuid, document.slug),
        ).rejects.toThrow(ForbiddenError);
        expect(documentModel.getBySlug).not.toHaveBeenCalled();
    });

    test('slug read identifiers cannot expose inaccessible Documents', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext([], false),
        );
        await expect(
            service.getByIdOrSlug(makeAccount(), projectUuid, document.slug),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('reads an exact project-scoped slug through normal Document authorization', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        await expect(
            service.getBySlug(makeAccount(), projectUuid, document.slug),
        ).resolves.toMatchObject(document);
        expect(documentModel.getBySlug).toHaveBeenCalledWith(
            projectUuid,
            document.slug,
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            { type: 'document', documentUuid, spaceUuid },
        );
    });

    test('slug lookup refuses disabled Documents before resolving the slug', async () => {
        const { service, documentModel, featureFlagModel } = setup();
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(
            service.getBySlug(makeAccount(), projectUuid, document.slug),
        ).rejects.toThrow(ForbiddenError);
        expect(documentModel.getBySlug).not.toHaveBeenCalled();
    });

    test('slug lookup refuses inaccessible projects before resolving the slug', async () => {
        const { service, documentModel } = setup();
        await expect(
            service.getBySlug(
                makeAccount(OrganizationMemberRole.MEMBER),
                projectUuid,
                document.slug,
            ),
        ).rejects.toThrow(new NotFoundError('Project not found'));
        expect(documentModel.getBySlug).not.toHaveBeenCalled();
    });

    test('slug lookup hides private Documents without access', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext([], false),
        );
        await expect(
            service.getBySlug(makeAccount(), projectUuid, document.slug),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('slug lookup preserves missing or deleted Document errors', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        const error = new NotFoundError('Document not found');
        documentModel.getBySlug.mockRejectedValue(error);
        await expect(
            service.getBySlug(makeAccount(), projectUuid, document.slug),
        ).rejects.toBe(error);
        expect(spacePermissionService.resolveAccess).not.toHaveBeenCalled();
    });

    test.each(['delete', 'restore', 'permanentDelete'] as const)(
        '%s refuses feature-off and cross-project callers before lifecycle reads',
        async (method) => {
            const { service, featureFlagModel, documentModel } = setup();
            featureFlagModel.get.mockResolvedValue({ enabled: false });
            await expect(
                service[method](
                    makeAccount(OrganizationMemberRole.ADMIN),
                    projectUuid,
                    documentUuid,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(documentModel.getLifecycleState).not.toHaveBeenCalled();
            featureFlagModel.get.mockResolvedValue({ enabled: true });
            await expect(
                service[method](
                    makeAccount(OrganizationMemberRole.MEMBER),
                    projectUuid,
                    documentUuid,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(documentModel.getLifecycleState).not.toHaveBeenCalled();
        },
    );

    test('delete uses filtered delete access, preserving recoverable versions/grants', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        spacePermissionService.getDocumentDeleteAccessContext.mockResolvedValue(
            makeContext([{ userUuid, role: SpaceMemberRole.ADMIN }], false),
        );
        await service.delete(
            makeAccount(OrganizationMemberRole.EDITOR),
            projectUuid,
            documentUuid,
        );
        expect(documentModel.softDelete).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            userUuid,
            spaceUuid,
        );
        expect(documentModel.permanentDelete).not.toHaveBeenCalled();
        expect(documentModel.get).not.toHaveBeenCalled();
        expect(
            spacePermissionService.getDocumentDeleteAccessContext,
        ).toHaveBeenCalledWith(userUuid, {
            type: 'document',
            documentUuid,
            spaceUuid,
        });
    });

    test('direct-editor deletion fails after the kernel filters its grant', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        spacePermissionService.getDocumentDeleteAccessContext.mockResolvedValue(
            makeContext([], false),
        );
        await expect(
            service.delete(
                makeAccount(OrganizationMemberRole.EDITOR),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(documentModel.softDelete).not.toHaveBeenCalled();
    });

    test('disabled soft-delete config purges only after normal delete authorization', async () => {
        const { service, documentModel, spacePermissionService } = setup({
            softDelete: false,
        });
        spacePermissionService.getDocumentDeleteAccessContext.mockResolvedValue(
            makeContext([{ userUuid, role: SpaceMemberRole.EDITOR }], false),
        );
        await service.delete(
            makeAccount(OrganizationMemberRole.EDITOR),
            projectUuid,
            documentUuid,
        );
        expect(documentModel.permanentDelete).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            { expectedSpaceUuid: spaceUuid, requireDeleted: false },
        );
        expect(documentModel.softDelete).not.toHaveBeenCalled();
    });

    test('full direct grant cannot replace a missing base Document delete scope', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project');
        builder.can('view', 'Document');
        spacePermissionService.getDocumentDeleteAccessContext.mockResolvedValue(
            makeContext([{ userUuid, role: SpaceMemberRole.ADMIN }], false),
        );
        await expect(
            service.delete(
                makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(documentModel.softDelete).not.toHaveBeenCalled();
    });

    test('restore requires existing recovery permission, not deletion ownership or direct access', async () => {
        const { service, documentModel } = setup();
        documentModel.getLifecycleState.mockResolvedValue({
            ...document,
            deletedAt: new Date(),
            deletedByUserUuid: userUuid,
            spaceDeletedAt: null,
        } as never);
        await expect(
            service.restore(
                makeAccount(OrganizationMemberRole.EDITOR),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        await service.restore(
            makeAccount(OrganizationMemberRole.ADMIN),
            projectUuid,
            documentUuid,
        );
        expect(documentModel.restore).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
        );
    });

    test.each([['recovery'], ['document'], ['recovery', 'document']])(
        'permanent deletion requires both recovery and Document management: %j',
        async (...scopes) => {
            const { service, documentModel } = setup();
            documentModel.getLifecycleState.mockResolvedValue({
                ...document,
                deletedAt: new Date(),
                deletedByUserUuid: userUuid,
                spaceDeletedAt: new Date(),
            } as never);
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            builder.can('view', 'Project');
            if (scopes.includes('recovery')) {
                builder.can('manage', 'DeletedContent', { projectUuid });
            }
            if (scopes.includes('document')) {
                builder.can('manage', 'Document', { projectUuid });
            }
            const request = service.permanentDelete(
                makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
                projectUuid,
                documentUuid,
            );
            if (scopes.length === 2) {
                await expect(request).resolves.toBeUndefined();
                expect(documentModel.permanentDelete).toHaveBeenCalledWith(
                    projectUuid,
                    documentUuid,
                );
            } else {
                await expect(request).rejects.toThrow(ForbiddenError);
            }
        },
    );

    test('repeated public delete returns404 without rewriting deletion metadata', async () => {
        const { service, documentModel } = setup();
        documentModel.getLifecycleState.mockResolvedValue({
            ...document,
            deletedAt: new Date(),
            deletedByUserUuid: userUuid,
            spaceDeletedAt: null,
        } as never);
        await expect(
            service.delete(
                makeAccount(OrganizationMemberRole.ADMIN),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(documentModel.softDelete).not.toHaveBeenCalled();
    });
    test('direct-only access returns only the caller access, never Space membership', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext(
                [
                    {
                        userUuid,
                        role: SpaceMemberRole.VIEWER,
                        grantedVia: 'document',
                    },
                    {
                        userUuid: 'private-space-member',
                        role: SpaceMemberRole.ADMIN,
                    },
                ] as never,
                false,
            ),
        );
        const result = await service.get(
            makeAccount(),
            projectUuid,
            documentUuid,
        );
        expect(result.access).toEqual([
            { userUuid, role: SpaceMemberRole.VIEWER, grantedVia: 'document' },
        ]);
        expect(result.directAccessRoles).toEqual([SpaceMemberRole.VIEWER]);
    });

    test('authorizes direct-only candidates separately before union pagination', async () => {
        const {
            service,
            documentModel,
            spacePermissionService,
            directAccessService,
        } = setup();
        directAccessService.findSharedWithMeUuids.mockResolvedValue({
            document: [documentUuid],
        } as never);
        documentModel.listSummariesByUuid.mockResolvedValue([
            document,
        ] as never);
        spacePermissionService.resolveAccessBatch
            .mockResolvedValueOnce([{ context: makeContext([], false) }])
            .mockResolvedValueOnce([
                {
                    context: makeContext(
                        [{ userUuid, role: SpaceMemberRole.VIEWER }],
                        false,
                    ),
                },
            ]);
        await service.list(makeAccount(), projectUuid, { limit: 1, offset: 3 });
        expect(documentModel.list).toHaveBeenCalledWith(projectUuid, {
            spaceUuids: [],
            documentUuids: [documentUuid],
            limit: 2,
            offset: 3,
        });
    });

    test('a stored direct grant does not bypass a custom role without Document view', async () => {
        const {
            service,
            documentModel,
            spacePermissionService,
            directAccessService,
        } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project');
        directAccessService.findSharedWithMeUuids.mockResolvedValue({
            document: [documentUuid],
        } as never);
        documentModel.listSummariesByUuid.mockResolvedValue([
            document,
        ] as never);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                context: makeContext(
                    [{ userUuid, role: SpaceMemberRole.ADMIN }],
                    false,
                ),
            },
        ]);
        await service.list(
            makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
            projectUuid,
        );
        expect(documentModel.list).toHaveBeenCalledWith(projectUuid, {
            spaceUuids: [],
            documentUuids: [],
            limit: 51,
            offset: 0,
        });
    });

    test('direct full access cannot move across Space boundaries even with legacy bypass options', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext([{ userUuid, role: SpaceMemberRole.ADMIN }], false),
        );
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: makeContext([], false) },
            {
                context: makeContext(
                    [{ userUuid, role: SpaceMemberRole.EDITOR }],
                    false,
                ),
            },
        ]);
        await expect(
            service.moveToSpace(
                makeAccount(),
                {
                    projectUuid,
                    itemUuid: documentUuid,
                    targetSpaceUuid: 'destination',
                },
                { checkForAccess: false },
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(documentModel.moveToSpace).not.toHaveBeenCalled();
        expect(spacePermissionService.resolveAccessBatch).toHaveBeenCalledWith(
            userUuid,
            [
                { type: 'space', spaceUuid },
                { type: 'space', spaceUuid: 'destination' },
            ],
            {},
        );
    });

    test('move requires update in source and create in destination, not destination update', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project');
        builder.can('view', 'Document');
        builder.can('update', 'Document', { inheritsFromOrgOrProject: false });
        builder.can('create', 'Document', { inheritsFromOrgOrProject: true });
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: makeContext([], false) },
            { context: makeContext([], true) },
        ]);
        await service.moveToSpace(
            makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
            {
                projectUuid,
                itemUuid: documentUuid,
                targetSpaceUuid: 'destination',
            },
        );
        expect(documentModel.moveToSpace).toHaveBeenCalledWith(
            {
                projectUuid,
                documentUuid,
                sourceSpaceUuid: spaceUuid,
                targetSpaceUuid: 'destination',
            },
            { tx: undefined },
        );
    });

    test('move rejects a cross-project destination', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: makeContext() },
            { context: { ...makeContext(), projectUuid: 'foreign' } },
        ]);
        await expect(
            service.moveToSpace(makeAccount(OrganizationMemberRole.ADMIN), {
                projectUuid,
                itemUuid: documentUuid,
                targetSpaceUuid: 'destination',
            }),
        ).rejects.toThrow(NotFoundError);
        expect(documentModel.moveToSpace).not.toHaveBeenCalled();
    });
    test('returns a document and its latest content to an inherited viewer', async () => {
        const {
            service,
            documentModel,
            spacePermissionService,
            featureFlagModel,
        } = setup();

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).resolves.toMatchObject(document);

        expect(documentModel.get).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            { type: 'document', documentUuid, spaceUuid },
        );
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.Documents,
            user: { userUuid, organizationUuid },
        });
    });

    test.each(['list', 'get'] as const)(
        '%s is unavailable when Documents is disabled',
        async (operation) => {
            const {
                service,
                featureFlagModel,
                documentModel,
                spacePermissionService,
            } = setup();
            featureFlagModel.get.mockResolvedValue({ enabled: false });

            const request =
                operation === 'list'
                    ? service.list(makeAccount(), projectUuid)
                    : service.get(makeAccount(), projectUuid, documentUuid);
            await expect(request).rejects.toThrow(ForbiddenError);
            expect(documentModel.get).not.toHaveBeenCalled();
            expect(documentModel.listSpaceUuids).not.toHaveBeenCalled();
            expect(documentModel.list).not.toHaveBeenCalled();
            expect(spacePermissionService.resolveAccess).not.toHaveBeenCalled();
        },
    );

    test.each(['list', 'get'] as const)(
        '%s hides projects without view permission',
        async (operation) => {
            const { service, documentModel, featureFlagModel } = setup();
            const account = makeAccount(OrganizationMemberRole.MEMBER);

            const request =
                operation === 'list'
                    ? service.list(account, projectUuid)
                    : service.get(account, projectUuid, documentUuid);
            await expect(request).rejects.toThrow(
                new NotFoundError('Project not found'),
            );
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(documentModel.get).not.toHaveBeenCalled();
            expect(documentModel.list).not.toHaveBeenCalled();
        },
    );

    test('does not substitute the actor organization when checking project access', async () => {
        const { service, projectModel, featureFlagModel } = setup();
        projectModel.getSummary.mockResolvedValue({
            projectUuid: 'foreign-project',
            organizationUuid: 'foreign-organization',
        });

        await expect(
            service.get(
                makeAccount(OrganizationMemberRole.ADMIN),
                'foreign-project',
                documentUuid,
            ),
        ).rejects.toThrow(new NotFoundError('Project not found'));
        expect(featureFlagModel.get).not.toHaveBeenCalled();
    });

    test('uses the target project organization to evaluate the feature flag', async () => {
        const { service, projectModel, documentModel, featureFlagModel } =
            setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project', { projectUuid: 'foreign-project' });
        projectModel.getSummary.mockResolvedValue({
            projectUuid: 'foreign-project',
            organizationUuid: 'foreign-organization',
        });
        documentModel.list.mockResolvedValue([]);

        await expect(
            service.list(
                makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
                'foreign-project',
            ),
        ).resolves.toEqual({ items: [], nextOffset: null });
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.Documents,
            user: { userUuid, organizationUuid: 'foreign-organization' },
        });
    });

    test('hides a private document even from its creator without Space access', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext([], false),
        );

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('permits explicit viewer Space access without project inheritance', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext([{ userUuid, role: SpaceMemberRole.VIEWER }], false),
        );

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).resolves.toMatchObject(document);
    });

    test('another user Space access does not authorize this reader', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue(
            makeContext(
                [{ userUuid: 'someone-else', role: SpaceMemberRole.ADMIN }],
                false,
            ),
        );

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('project access alone does not authorize reading a document', async () => {
        const { service } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project', { projectUuid });

        await expect(
            service.get(
                makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('project-scoped document access cannot cross a resource project boundary', async () => {
        const { service, documentModel } = setup();
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('view', 'Project', { projectUuid });
        builder.can('view', 'Document', { projectUuid });
        documentModel.get.mockResolvedValue({
            ...document,
            projectUuid: 'foreign-project',
        });

        await expect(
            service.get(
                makeAccount(OrganizationMemberRole.MEMBER, builder.build()),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('document resource identifiers override an actor-scoped access context', async () => {
        const { service, documentModel } = setup();
        documentModel.get.mockResolvedValue({
            ...document,
            organizationUuid: 'foreign-organization',
        });

        await expect(
            service.get(
                makeAccount(OrganizationMemberRole.ADMIN),
                projectUuid,
                documentUuid,
            ),
        ).rejects.toThrow(new NotFoundError('Document not found'));
    });

    test('selects authorized Spaces before fetching a bounded page of document summaries', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        const shared = {
            ...document,
            documentUuid: 'shared',
            spaceUuid: 'shared-space',
        };
        documentModel.listSpaceUuids.mockResolvedValue([
            spaceUuid,
            'private-space',
            'missing-space',
            'shared-space',
        ]);
        documentModel.list.mockResolvedValue([document, shared]);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: makeContext() },
            { context: makeContext([], false) },
            { context: undefined },
            {
                context: makeContext(
                    [{ userUuid, role: SpaceMemberRole.VIEWER }],
                    false,
                ),
            },
        ]);

        await expect(service.list(makeAccount(), projectUuid)).resolves.toEqual(
            { items: [document, shared], nextOffset: null },
        );
        expect(documentModel.listSpaceUuids).toHaveBeenCalledWith(projectUuid);
        expect(documentModel.list).toHaveBeenCalledWith(projectUuid, {
            documentUuids: [],
            spaceUuids: [spaceUuid, 'shared-space'],
            limit: 51,
            offset: 0,
        });
        expect(spacePermissionService.resolveAccessBatch).toHaveBeenCalledWith(
            userUuid,
            [spaceUuid, 'private-space', 'missing-space', 'shared-space'].map(
                (uuid) => ({ type: 'space', spaceUuid: uuid }),
            ),
        );
    });

    test('returns the requested page and a continuation offset when an extra item exists', async () => {
        const { service, documentModel } = setup();
        const second = { ...document, documentUuid: 'second' };
        const lookahead = { ...document, documentUuid: 'lookahead' };
        documentModel.list.mockResolvedValue([document, second, lookahead]);

        await expect(
            service.list(makeAccount(), projectUuid, { limit: 2, offset: 10 }),
        ).resolves.toEqual({ items: [document, second], nextOffset: 12 });
        expect(documentModel.list).toHaveBeenCalledWith(projectUuid, {
            documentUuids: [],
            spaceUuids: [spaceUuid],
            limit: 3,
            offset: 10,
        });
    });

    test('passes an empty allowed-Space set when the reader cannot access any document', async () => {
        const { service, documentModel, spacePermissionService } = setup();
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { context: makeContext([], false) },
        ]);
        documentModel.list.mockResolvedValue([]);

        await expect(service.list(makeAccount(), projectUuid)).resolves.toEqual(
            { items: [], nextOffset: null },
        );
        expect(documentModel.list).toHaveBeenCalledWith(projectUuid, {
            documentUuids: [],
            spaceUuids: [],
            limit: 51,
            offset: 0,
        });
    });

    test('does not advertise another page when the exact page size is returned', async () => {
        const { service } = setup();

        await expect(
            service.list(makeAccount(), projectUuid, { limit: 1, offset: 0 }),
        ).resolves.toEqual({ items: [document], nextOffset: null });
    });

    test('returns an empty terminal page when the model has no matching documents', async () => {
        const { service, documentModel } = setup();
        documentModel.list.mockResolvedValue([]);

        await expect(
            service.list(makeAccount(), projectUuid, {
                limit: 10,
                offset: 100,
            }),
        ).resolves.toEqual({ items: [], nextOffset: null });
    });

    test.each([
        { limit: 0, offset: 0 },
        { limit: -1, offset: 0 },
        { limit: 101, offset: 0 },
        { limit: 1.5, offset: 0 },
        { limit: NaN, offset: 0 },
        { limit: Infinity, offset: 0 },
        { limit: 50, offset: -1 },
        { limit: 50, offset: 0.5 },
        { limit: 50, offset: NaN },
        { limit: 50, offset: Infinity },
        { limit: 50, offset: Number.MAX_SAFE_INTEGER + 1 },
    ])(
        'rejects invalid pagination %j before querying document rows',
        async (pagination) => {
            const { service, documentModel } = setup();

            await expect(
                service.list(makeAccount(), projectUuid, pagination),
            ).rejects.toThrow(ParameterError);
            expect(documentModel.list).not.toHaveBeenCalled();
            expect(documentModel.listSpaceUuids).not.toHaveBeenCalled();
        },
    );

    test.each(['missing', 'deleted', 'invalid'])(
        'preserves the model not-found outcome for a %s document',
        async () => {
            const { service, documentModel, spacePermissionService } = setup();
            const error = new NotFoundError('Document not found');
            documentModel.get.mockRejectedValue(error);

            await expect(
                service.get(makeAccount(), projectUuid, documentUuid),
            ).rejects.toBe(error);
            expect(spacePermissionService.resolveAccess).not.toHaveBeenCalled();
        },
    );

    test('propagates a missing Space access context without returning the document', async () => {
        const { service, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockRejectedValue(
            new NotFoundError('Space not found'),
        );

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).rejects.toThrow(NotFoundError);
    });
});
