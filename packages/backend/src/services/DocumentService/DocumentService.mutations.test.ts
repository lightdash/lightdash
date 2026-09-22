import {
    assertUnreachable,
    ChartType,
    ConflictError,
    ForbiddenError,
    getUserAbilityBuilder,
    MergeJoinType,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    parseDocumentContent,
    SpaceMemberRole,
    type CreateDocumentRequest,
    type Document,
    type DocumentCell,
    type RegisteredAccount,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { DocumentService } from './DocumentService';

const userUuid = 'document-author';
const organizationUuid = 'document-organization';
const projectUuid = 'document-project';
const spaceUuid = 'document-space';
const documentUuid = 'document-uuid';
const baseVersionUuid = 'document-version';

const markdown: DocumentCell = {
    type: 'markdown',
    content: { markdown: '# Findings' },
};
const chart: SemanticChartAsCode = {
    name: 'Orders',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 100,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
};
const semantic: DocumentCell = {
    type: 'chart',
    content: { source: 'semantic', chart },
};
const merge: DocumentCell = {
    type: 'chart',
    content: {
        source: 'merge',
        chart: {
            ...chart,
            merge: {
                primarySourceId: 'a',
                sources: [
                    { id: 'a', kind: 'chart' },
                    {
                        id: 'b',
                        kind: 'query',
                        metricQuery: { ...chart.metricQuery, filters: {} },
                    },
                ],
                joinType: MergeJoinType.FULL,
                joinKey: [
                    {
                        name: 'status',
                        fieldIdBySourceId: {
                            a: 'orders_status',
                            b: 'orders_status',
                        },
                    },
                ],
                tableCalculations: [],
            },
        },
    },
};

describe('Document as-code chart round-trip', () => {
    test.each([semantic, merge])(
        'preserves durable $content.source charts',
        async (cell) => {
            const content = { cells: [markdown, cell] };
            const service = new DocumentService({
                spaceModel: {
                    find: vi.fn().mockResolvedValue([{ path: 'reports' }]),
                },
            } as unknown as ConstructorParameters<typeof DocumentService>[0]);
            vi.spyOn(service, 'getByIdOrSlug').mockResolvedValue({
                name: 'Report',
                slug: 'report',
                description: 'Description',
                spaceUuid,
                version: { schemaVersion: 1, content },
            } as Document);
            const result = await service.getAsCode(
                {} as RegisteredAccount,
                projectUuid,
                'report',
            );
            expect(result.content).toEqual(content);
            expect(
                parseDocumentContent(result.schemaVersion, result.content),
            ).toEqual(content);
        },
    );
});

const document: Document = {
    pinnedListUuid: null,
    createdBy: null,
    documentUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    name: 'Review',
    slug: 'review',
    description: '',
    createdByUserUuid: userUuid,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    version: {
        versionUuid: baseVersionUuid,
        versionNumber: 1,
        schemaVersion: 1,
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
        content: { cells: [markdown] },
    },
};
const createInput: CreateDocumentRequest = {
    name: document.name,
    description: document.description,
    spaceUuid,
    schemaVersion: 1,
    content: document.version.content,
};

const makeAccount = (role = OrganizationMemberRole.EDITOR): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid },
        user: {
            id: userUuid,
            userUuid,
            firstName: 'Document',
            lastName: 'Author',
            email: 'author@example.com',
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
        create: vi.fn().mockResolvedValue(document),
        updateMetadata: vi.fn().mockResolvedValue(document),
        updateContent: vi.fn().mockResolvedValue(document),
    };
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
        inheritsFromOrgOrProject: true,
        access: [{ userUuid, role: SpaceMemberRole.EDITOR }],
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue(context),
    };
    const projectService = {
        compileQuery: vi.fn().mockResolvedValue({
            compilationErrors: [],
            missingParameterReferences: new Set<string>(),
        }),
        compileMergeQuery: vi.fn().mockResolvedValue({ errors: [] }),
    };
    const service = new DocumentService({
        documentModel,
        projectModel,
        featureFlagModel,
        spacePermissionService,
        projectService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    return {
        service,
        documentModel,
        featureFlagModel,
        spacePermissionService,
        projectService,
        context,
    };
};

const mutations = [
    'create',
    'metadata',
    'content',
    'replacement',
    'duplicate',
] as const;
const mutate = (
    service: DocumentService,
    mutation: (typeof mutations)[number],
    account = makeAccount(),
) => {
    switch (mutation) {
        case 'create':
            return service.create(account, projectUuid, createInput);
        case 'duplicate':
            return service.duplicate(account, projectUuid, document.slug, {
                name: 'Copy of Review',
                spaceUuid,
            });
        case 'metadata':
            return service.updateMetadata(account, projectUuid, documentUuid, {
                name: 'Updated',
            });
        case 'content':
            return service.updateContent(account, projectUuid, documentUuid, {
                baseVersionUuid,
                content: {
                    cells: [
                        { type: 'markdown', content: { markdown: 'Done' } },
                    ],
                },
            });
        case 'replacement':
            return service.updateContent(account, projectUuid, documentUuid, {
                baseVersionUuid,
                content: { cells: [semantic] },
            });
        default:
            return assertUnreachable(mutation, 'Unknown Document mutation');
    }
};

describe('DocumentService mutations', () => {
    test.each([semantic, merge])(
        'duplicates current $content.source content without identity, grants or history',
        async (cell) => {
            const { service, documentModel, projectService } = setup();
            const source = {
                ...document,
                description: 'Source description',
                directAccessRoles: [SpaceMemberRole.ADMIN],
                version: {
                    ...document.version,
                    versionNumber: 5,
                    content: { cells: [markdown, cell] },
                },
            };
            documentModel.getBySlug.mockResolvedValue(source);
            const input = {
                name: 'Copy of Review',
                spaceUuid: 'destination-space',
            };
            await service.duplicate(
                makeAccount(),
                projectUuid,
                source.slug,
                input,
            );
            expect(documentModel.create).toHaveBeenCalledWith({
                ...input,
                projectUuid,
                createdByUserUuid: userUuid,
                description: source.description,
                schemaVersion: 1,
                content: source.version.content,
            });
            expect(source.version.versionNumber).toBe(5);
            expect(source.version.content).toEqual({ cells: [markdown, cell] });
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
            expect(projectService.compileQuery).toHaveBeenCalled();
        },
    );

    test('duplicate may override description with an empty value', async () => {
        const { service, documentModel } = setup();
        documentModel.getBySlug.mockResolvedValue({
            ...document,
            description: 'Original',
        });
        await service.duplicate(makeAccount(), projectUuid, document.slug, {
            name: 'Copy',
            spaceUuid,
            description: '',
        });
        expect(documentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ description: '' }),
        );
    });

    test('duplicate rejects a source the caller cannot view', async () => {
        const { service, documentModel, spacePermissionService, context } =
            setup();
        spacePermissionService.resolveAccess.mockResolvedValueOnce({
            ...context,
            inheritsFromOrgOrProject: false,
            access: [],
        });
        await expect(mutate(service, 'duplicate')).rejects.toThrow(
            NotFoundError,
        );
        expect(documentModel.create).not.toHaveBeenCalled();
    });

    test.each(['private', 'foreign-project', 'foreign-organization'])(
        'duplicate rejects %s destination before writing',
        async (destination) => {
            const { service, documentModel, spacePermissionService, context } =
                setup();
            spacePermissionService.resolveAccess
                .mockResolvedValueOnce(context)
                .mockResolvedValueOnce({
                    ...context,
                    projectUuid:
                        destination === 'foreign-project'
                            ? destination
                            : projectUuid,
                    organizationUuid:
                        destination === 'foreign-organization'
                            ? destination
                            : organizationUuid,
                    inheritsFromOrgOrProject: false,
                    access: [],
                });
            await expect(mutate(service, 'duplicate')).rejects.toThrow(
                destination === 'private' ? ForbiddenError : NotFoundError,
            );
            expect(documentModel.create).not.toHaveBeenCalled();
        },
    );

    test('direct source viewer can duplicate into a Space where they can create', async () => {
        const { service, documentModel, spacePermissionService, context } =
            setup();
        spacePermissionService.resolveAccess.mockResolvedValueOnce({
            ...context,
            inheritsFromOrgOrProject: false,
            access: [
                {
                    userUuid,
                    role: SpaceMemberRole.VIEWER,
                    grantedVia: 'document',
                },
            ],
        } as never);
        await expect(mutate(service, 'duplicate')).resolves.toMatchObject(
            document,
        );
        expect(documentModel.create).toHaveBeenCalled();
    });

    test.each(['metadata', 'content'] as const)(
        '%s edits recheck caller Space scope against the current Document',
        async (mutation) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                spaceUuid: 'moved-outside-scope',
            });
            const options = { allowedSpaceUuids: [spaceUuid] };
            const request =
                mutation === 'metadata'
                    ? service.updateMetadata(
                          makeAccount(),
                          projectUuid,
                          documentUuid,
                          { name: 'Updated' },
                          options,
                      )
                    : service.updateContent(
                          makeAccount(),
                          projectUuid,
                          documentUuid,
                          {
                              baseVersionUuid,
                              content: { cells: [] },
                          },
                          options,
                      );
            await expect(request).rejects.toThrow(
                new NotFoundError('Document not found'),
            );
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
            expect(projectService.compileQuery).not.toHaveBeenCalled();
        },
    );

    test.each([undefined, [], [spaceUuid]])(
        'metadata edits retain unrestricted or matching Space scope: %j',
        async (allowedSpaceUuids) => {
            const { service, documentModel } = setup();
            await service.updateMetadata(
                makeAccount(),
                projectUuid,
                documentUuid,
                { name: 'Updated' },
                { allowedSpaceUuids },
            );
            expect(documentModel.updateMetadata).toHaveBeenCalledWith(
                projectUuid,
                documentUuid,
                {
                    name: 'Updated',
                    expectedSpaceUuid: spaceUuid,
                },
            );
        },
    );

    test.each(['metadata', 'content'] as const)(
        'uses the resolved authorization context for %s updates',
        async (mutation) => {
            const { service, spacePermissionService, context, documentModel } =
                setup();
            spacePermissionService.resolveAccess
                .mockResolvedValueOnce(context)
                .mockResolvedValue({
                    ...context,
                    organizationUuid: 'another-organization',
                });

            await expect(mutate(service, mutation)).rejects.toThrow(
                ForbiddenError,
            );
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
        },
    );

    test.each([
        SpaceMemberRole.VIEWER,
        SpaceMemberRole.EDITOR,
        SpaceMemberRole.ADMIN,
    ])('direct %s grants enforce document-local editing', async (role) => {
        const { service, spacePermissionService, documentModel } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue({
            projectUuid,
            organizationUuid,
            inheritsFromOrgOrProject: false,
            access: [{ userUuid, role, grantedVia: 'document' }],
        } as never);
        const request = service.updateMetadata(
            makeAccount(),
            projectUuid,
            documentUuid,
            { name: 'Edited' },
        );
        if (role === SpaceMemberRole.VIEWER) {
            await expect(request).rejects.toThrow(ForbiddenError);
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
        } else {
            await expect(request).resolves.toMatchObject({
                directAccessRoles: [role],
            });
        }
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            userUuid,
            { type: 'document', documentUuid, spaceUuid },
        );
    });
    test.each(mutations)(
        'denies %s to an inherited viewer before writing or compiling',
        async (mutation) => {
            const { service, documentModel, projectService } = setup();

            await expect(
                mutate(
                    service,
                    mutation,
                    makeAccount(OrganizationMemberRole.VIEWER),
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(documentModel.create).not.toHaveBeenCalled();
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
            expect(projectService.compileQuery).not.toHaveBeenCalled();
        },
    );

    test.each(mutations)(
        'allows %s for an editor with editor Space access',
        async (mutation) => {
            const { service } = setup();
            await expect(mutate(service, mutation)).resolves.toMatchObject(
                document,
            );
        },
    );

    test.each(mutations)(
        'allows %s for organization admin without explicit Space membership',
        async (mutation) => {
            const { service, spacePermissionService, context } = setup();
            spacePermissionService.resolveAccess.mockResolvedValue({
                ...context,
                access: [],
                inheritsFromOrgOrProject: false,
            });

            await expect(
                mutate(
                    service,
                    mutation,
                    makeAccount(OrganizationMemberRole.ADMIN),
                ),
            ).resolves.toMatchObject(document);
        },
    );

    test.each(mutations)(
        'rejects %s while the Documents flag is off',
        async (mutation) => {
            const { service, featureFlagModel, documentModel } = setup();
            featureFlagModel.get.mockResolvedValue({ enabled: false });

            await expect(mutate(service, mutation)).rejects.toThrow(
                ForbiddenError,
            );
            expect(documentModel.create).not.toHaveBeenCalled();
            expect(documentModel.get).not.toHaveBeenCalled();
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
        },
    );

    test.each([
        { projectUuid: 'foreign-project', organizationUuid },
        { projectUuid, organizationUuid: 'foreign-organization' },
    ])(
        'cannot create in a foreign destination %j even as admin',
        async (foreign) => {
            const { service, spacePermissionService, context, documentModel } =
                setup();
            spacePermissionService.resolveAccess.mockResolvedValue({
                ...context,
                ...foreign,
            });

            await expect(
                service.create(
                    makeAccount(OrganizationMemberRole.ADMIN),
                    projectUuid,
                    createInput,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(documentModel.create).not.toHaveBeenCalled();
        },
    );

    test.each([
        {},
        { name: '' },
        { name: '  ' },
        { name: 'x'.repeat(256) },
        { slug: '' },
        { slug: 'UpperCase' },
        { slug: '-leading' },
        { slug: 'double--hyphen' },
        { slug: 'x'.repeat(256) },
    ])(
        'rejects invalid or empty metadata %j without writing',
        async (metadata) => {
            const { service, documentModel } = setup();

            await expect(
                service.updateMetadata(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    metadata,
                ),
            ).rejects.toThrow(ParameterError);
            expect(documentModel.updateMetadata).not.toHaveBeenCalled();
        },
    );

    test('updates metadata without compiling or creating a content version', async () => {
        const { service, documentModel, projectService } = setup();
        const metadata = { name: 'Updated', slug: 'updated', description: '' };

        await expect(
            service.updateMetadata(
                makeAccount(),
                projectUuid,
                documentUuid,
                metadata,
            ),
        ).resolves.toMatchObject(document);
        expect(documentModel.updateMetadata).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            { ...metadata, expectedSpaceUuid: spaceUuid },
        );
        expect(documentModel.updateContent).not.toHaveBeenCalled();
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
    });

    test.each([{ content: { cells: [semantic] } }])(
        'rejects stale base versions before chart compilation: %j',
        async (replacement) => {
            const { service, documentModel, projectService } = setup();

            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    {
                        baseVersionUuid: 'stale',
                        ...replacement,
                    },
                ),
            ).rejects.toThrow(ConflictError);
            expect(documentModel.updateContent).not.toHaveBeenCalled();
            expect(projectService.compileQuery).not.toHaveBeenCalled();
        },
    );

    test.each([
        { cells: [markdown, semantic, markdown] },
        { cells: [semantic, markdown] },
        { cells: [semantic] },
    ])(
        'does not recompile unchanged charts when replacing content with %j',
        async (content) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                version: {
                    ...document.version,
                    content: { cells: [markdown, semantic] },
                },
            });
            const request = { baseVersionUuid, content };

            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    request,
                ),
            ).resolves.toMatchObject(document);
            expect(projectService.compileQuery).not.toHaveBeenCalled();
            expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
            expect(documentModel.updateContent).toHaveBeenCalledWith(
                projectUuid,
                documentUuid,
                { ...request, expectedSpaceUuid: spaceUuid },
                userUuid,
            );
        },
    );

    test('creates markdown-only content with authenticated authorship and no compile', async () => {
        const { service, documentModel, projectService } = setup();

        await expect(
            service.create(makeAccount(), projectUuid, createInput),
        ).resolves.toMatchObject(document);
        expect(documentModel.create).toHaveBeenCalledWith({
            ...createInput,
            projectUuid,
            createdByUserUuid: userUuid,
        });
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
    });

    test.each([semantic, merge])(
        'whole-content replacement does not recompile retained charts',
        async (cell) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                version: {
                    ...document.version,
                    content: { cells: [cell, markdown] },
                },
            });
            projectService.compileQuery.mockRejectedValue(
                new ForbiddenError('No chart authoring'),
            );
            projectService.compileMergeQuery.mockRejectedValue(
                new ForbiddenError('No chart authoring'),
            );
            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    {
                        baseVersionUuid,
                        content: {
                            cells: [
                                {
                                    ...markdown,
                                    content: { markdown: '# Revised' },
                                },
                                cell,
                            ],
                        },
                    },
                ),
            ).resolves.toMatchObject(document);
            expect(projectService.compileQuery).not.toHaveBeenCalled();
            expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
        },
    );

    test('reauthorizes changed charts even at the same array position', async () => {
        const { service, documentModel, projectService } = setup();
        documentModel.get.mockResolvedValue({
            ...document,
            version: { ...document.version, content: { cells: [semantic] } },
        });
        projectService.compileQuery.mockRejectedValue(
            new ForbiddenError('No chart authoring'),
        );
        await expect(
            service.updateContent(makeAccount(), projectUuid, documentUuid, {
                baseVersionUuid,
                content: {
                    cells: [
                        {
                            type: 'chart',
                            content: {
                                source: 'semantic',
                                chart: {
                                    ...chart,
                                    metricQuery: {
                                        ...chart.metricQuery,
                                        metrics: ['orders_secret'],
                                    },
                                },
                            },
                        },
                    ],
                },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(projectService.compileQuery).toHaveBeenCalledOnce();
        expect(documentModel.updateContent).not.toHaveBeenCalled();
    });

    test.each([semantic, merge])(
        'rejects unsupported chart content properties before compilation or persistence',
        async (cell) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                version: { ...document.version, content: { cells: [cell] } },
            });
            const request = {
                baseVersionUuid,
                content: {
                    cells: [
                        {
                            ...cell,
                            content: {
                                ...cell.content,
                                title: 'Updated section',
                            },
                        },
                    ],
                },
            };
            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    request,
                ),
            ).rejects.toThrow(ParameterError);
            expect(projectService.compileQuery).not.toHaveBeenCalled();
            expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
        },
    );

    test('compiles semantic chart definitions through the canonical project compiler before persistence', async () => {
        const { service, projectService, documentModel } = setup();
        const account = makeAccount();
        const input = { ...createInput, content: { cells: [semantic] } };

        await service.create(account, projectUuid, input);

        expect(projectService.compileQuery).toHaveBeenCalledWith({
            account,
            projectUuid,
            exploreName: 'orders',
            body: {
                ...chart.metricQuery,
                filters: {
                    dimensions: undefined,
                    metrics: undefined,
                    tableCalculations: undefined,
                },
                parameters: undefined,
            },
            usePreAggregateCache: false,
        });
        expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
        expect(documentModel.create).toHaveBeenCalledWith({
            ...input,
            projectUuid,
            createdByUserUuid: userUuid,
        });
    });

    test.each([
        new ParameterError('Unknown field'),
        new ForbiddenError('Custom SQL authoring is not allowed'),
    ])(
        'does not persist after semantic compiler rejection %s',
        async (error) => {
            const { service, projectService, documentModel } = setup();
            projectService.compileQuery.mockRejectedValue(error);

            await expect(
                service.create(makeAccount(), projectUuid, {
                    ...createInput,
                    content: { cells: [semantic] },
                }),
            ).rejects.toBe(error);
            expect(documentModel.create).not.toHaveBeenCalled();
        },
    );

    test.each([
        {
            compilationErrors: ['Unknown orders_missing dimension'],
            missingParameterReferences: new Set<string>(),
            expectedMessage: 'Unknown orders_missing dimension',
        },
        {
            compilationErrors: [],
            missingParameterReferences: new Set(['region']),
            expectedMessage: 'region',
        },
    ])(
        'rejects returned compiler errors or missing parameters: $expectedMessage',
        async ({ expectedMessage, ...compiled }) => {
            const { service, projectService, documentModel } = setup();
            projectService.compileQuery.mockResolvedValue(compiled);

            await expect(
                service.create(makeAccount(), projectUuid, {
                    ...createInput,
                    content: { cells: [semantic] },
                }),
            ).rejects.toThrow(ParameterError);
            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    {
                        baseVersionUuid,
                        content: { cells: [semantic] },
                    },
                ),
            ).rejects.toThrow(expectedMessage);
            expect(documentModel.create).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
        },
    );

    test('limits concurrent chart compiler work while validating every changed chart', async () => {
        const { service, projectService } = setup();
        let active = 0;
        let peakActive = 0;
        projectService.compileQuery.mockImplementation(async () => {
            active += 1;
            peakActive = Math.max(peakActive, active);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1);
            });
            active -= 1;
            return {
                compilationErrors: [],
                missingParameterReferences: new Set<string>(),
            };
        });
        const cells = Array.from({ length: 9 }, () => ({
            ...semantic,
        }));

        await service.create(makeAccount(), projectUuid, {
            ...createInput,
            content: { cells },
        });

        expect(projectService.compileQuery).toHaveBeenCalledTimes(9);
        expect(peakActive).toBeLessThanOrEqual(4);
    });

    test('compile failures during content updates do not append a new version', async () => {
        const { service, projectService, documentModel } = setup();
        const error = new ForbiddenError('Custom SQL authoring is not allowed');
        projectService.compileQuery.mockRejectedValue(error);

        await expect(
            service.updateContent(makeAccount(), projectUuid, documentUuid, {
                baseVersionUuid,
                content: { cells: [semantic] },
            }),
        ).rejects.toBe(error);
        expect(documentModel.updateContent).not.toHaveBeenCalled();
    });

    test('delegates merge chart validation to the canonical merge compiler', async () => {
        const { service, projectService, documentModel } = setup();
        const account = makeAccount();

        await service.create(account, projectUuid, {
            ...createInput,
            content: { cells: [merge] },
        });

        expect(projectService.compileMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                account,
                projectUuid,
                userAttributeOverrides: {},
                mergeQuery: expect.objectContaining({
                    joinType: MergeJoinType.FULL,
                    sources: expect.arrayContaining([
                        expect.objectContaining({ id: 'a' }),
                        expect.objectContaining({ id: 'b' }),
                    ]),
                }),
            }),
        );
        expect(projectService.compileQuery).toHaveBeenCalledTimes(2);
        expect(documentModel.create).toHaveBeenCalledOnce();
    });

    test.each(['create', 'update'] as const)(
        'rejects a nonthrowing second-leg compilation error during merge %s',
        async (operation) => {
            const { service, projectService, documentModel } = setup();
            projectService.compileQuery
                .mockResolvedValueOnce({
                    compilationErrors: [],
                    missingParameterReferences: new Set<string>(),
                })
                .mockResolvedValueOnce({
                    compilationErrors: ['Unknown field in second merge source'],
                    missingParameterReferences: new Set<string>(),
                });
            projectService.compileMergeQuery.mockResolvedValue({ errors: [] });

            const request =
                operation === 'create'
                    ? service.create(makeAccount(), projectUuid, {
                          ...createInput,
                          content: { cells: [merge] },
                      })
                    : service.updateContent(
                          makeAccount(),
                          projectUuid,
                          documentUuid,
                          {
                              baseVersionUuid,
                              content: { cells: [merge] },
                          },
                      );
            await expect(request).rejects.toThrow(
                'Unknown field in second merge source',
            );
            expect(projectService.compileQuery).toHaveBeenCalledTimes(2);
            expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
            expect(documentModel.create).not.toHaveBeenCalled();
            expect(documentModel.updateContent).not.toHaveBeenCalled();
        },
    );

    test('merge compiler errors prevent persistence', async () => {
        const { service, projectService, documentModel } = setup();
        projectService.compileMergeQuery.mockResolvedValue({
            errors: [{ message: 'Join key does not exist' }],
        });

        await expect(
            service.create(makeAccount(), projectUuid, {
                ...createInput,
                content: { cells: [merge] },
            }),
        ).rejects.toThrow('Join key does not exist');
        expect(documentModel.create).not.toHaveBeenCalled();
    });

    test.each([
        { ...createInput, schemaVersion: 4 },
        { ...createInput, schemaVersion: 2 },
        { ...createInput, schemaVersion: 3 },
        {
            ...createInput,
            content: {
                cells: [{ ...semantic, content: { source: 'sql', chart } }],
            },
        },
    ])(
        'rejects unsupported schema or chart source before compilation',
        async (input) => {
            const { service, projectService, documentModel } = setup();

            await expect(
                service.create(
                    makeAccount(),
                    projectUuid,
                    input as CreateDocumentRequest,
                ),
            ).rejects.toThrow(ParameterError);
            expect(projectService.compileQuery).not.toHaveBeenCalled();
            expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
            expect(documentModel.create).not.toHaveBeenCalled();
        },
    );

    test('rejects chart tableName and exploreName mismatch before compiling', async () => {
        const { service, projectService, documentModel } = setup();
        const cell: DocumentCell = {
            ...semantic,
            type: 'chart',
            content: {
                source: 'semantic',
                chart: { ...chart, tableName: 'different' },
            },
        };

        await expect(
            service.create(makeAccount(), projectUuid, {
                ...createInput,
                content: { cells: [cell] },
            }),
        ).rejects.toThrow('tableName must match its exploreName');
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(documentModel.create).not.toHaveBeenCalled();
    });

    test('propagates an atomic model conflict after successful validation', async () => {
        const { service, documentModel } = setup();
        const error = new ConflictError('Concurrent update');
        documentModel.updateContent.mockRejectedValue(error);

        await expect(mutate(service, 'content')).rejects.toBe(error);
        expect(documentModel.updateContent).toHaveBeenCalledOnce();
    });
});
