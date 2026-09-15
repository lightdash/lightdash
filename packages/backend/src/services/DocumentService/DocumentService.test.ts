import { Ability, AbilityBuilder } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
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
        schemaVersion: 2,
        content: {
            cells: [
                {
                    id: 'intro',
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

const setup = () => {
    const documentModel = {
        get: vi.fn().mockResolvedValue(document),
        list: vi.fn().mockResolvedValue([document]),
        listSpaceUuids: vi.fn().mockResolvedValue([spaceUuid]),
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
        resolveAccess: vi.fn().mockResolvedValue(makeContext()),
        resolveAccessBatch: vi
            .fn()
            .mockResolvedValue([{ context: makeContext() }]),
    };
    const service = new DocumentService({
        documentModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    return {
        service,
        documentModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
    };
};

describe('DocumentService', () => {
    test('returns a document and its latest content to an inherited viewer', async () => {
        const {
            service,
            documentModel,
            spacePermissionService,
            featureFlagModel,
        } = setup();

        await expect(
            service.get(makeAccount(), projectUuid, documentUuid),
        ).resolves.toEqual(document);

        expect(documentModel.get).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            { type: 'space', spaceUuid },
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
        ).resolves.toEqual(document);
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
