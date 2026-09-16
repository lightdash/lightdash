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
    SpaceMemberRole,
    type CreateDocumentRequest,
    type Document,
    type DocumentCellOperation,
    type DocumentCellV3,
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

const markdown: DocumentCellV3 = {
    id: 'intro',
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
const semantic: DocumentCellV3 = {
    id: 'orders',
    type: 'chart',
    content: { source: 'semantic', chart },
};
const merge: DocumentCellV3 = {
    id: 'merge',
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

const document: Document = {
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
        schemaVersion: 3,
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
        content: { cells: [markdown] },
    },
};
const createInput: CreateDocumentRequest = {
    name: document.name,
    description: document.description,
    spaceUuid,
    schemaVersion: 3,
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

const mutations = ['create', 'metadata', 'content'] as const;
const mutate = (
    service: DocumentService,
    mutation: (typeof mutations)[number],
    account = makeAccount(),
) => {
    switch (mutation) {
        case 'create':
            return service.create(account, projectUuid, createInput);
        case 'metadata':
            return service.updateMetadata(account, projectUuid, documentUuid, {
                name: 'Updated',
            });
        case 'content':
            return service.updateContent(account, projectUuid, documentUuid, {
                baseVersionUuid,
                operations: [
                    {
                        type: 'append',
                        cell: {
                            id: 'ending',
                            type: 'markdown',
                            content: { markdown: 'Done' },
                        },
                    },
                ],
            });
        default:
            return assertUnreachable(mutation, 'Unknown Document mutation');
    }
};

describe('DocumentService mutations', () => {
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
            await expect(mutate(service, mutation)).resolves.toEqual(document);
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
            ).resolves.toEqual(document);
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
        ).resolves.toEqual(document);
        expect(documentModel.updateMetadata).toHaveBeenCalledWith(
            projectUuid,
            documentUuid,
            { ...metadata, expectedSpaceUuid: spaceUuid },
        );
        expect(documentModel.updateContent).not.toHaveBeenCalled();
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
    });

    test('rejects stale base versions before chart compilation', async () => {
        const { service, documentModel, projectService } = setup();

        await expect(
            service.updateContent(makeAccount(), projectUuid, documentUuid, {
                baseVersionUuid: 'stale',
                operations: [{ type: 'append', cell: semantic }],
            }),
        ).rejects.toThrow(ConflictError);
        expect(documentModel.updateContent).not.toHaveBeenCalled();
        expect(projectService.compileQuery).not.toHaveBeenCalled();
    });

    test.each<DocumentCellOperation[]>([
        [
            {
                type: 'append',
                cell: {
                    id: 'end',
                    type: 'markdown',
                    content: { markdown: 'Conclusion' },
                },
            },
        ],
        [{ type: 'move_before', cellId: 'orders', targetCellId: 'intro' }],
        [{ type: 'replace', cellId: 'orders', cell: semantic }],
    ])(
        'does not recompile unchanged charts when applying %j',
        async (...operations) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                version: {
                    ...document.version,
                    content: { cells: [markdown, semantic] },
                },
            });
            const request = { baseVersionUuid, operations };

            await expect(
                service.updateContent(
                    makeAccount(),
                    projectUuid,
                    documentUuid,
                    request,
                ),
            ).resolves.toEqual(document);
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
        ).resolves.toEqual(document);
        expect(documentModel.create).toHaveBeenCalledWith({
            ...createInput,
            projectUuid,
            createdByUserUuid: userUuid,
        });
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(projectService.compileMergeQuery).not.toHaveBeenCalled();
    });

    test.each([semantic, merge])(
        'rejects retired section titles before compilation or persistence',
        async (cell) => {
            const { service, documentModel, projectService } = setup();
            documentModel.get.mockResolvedValue({
                ...document,
                version: { ...document.version, content: { cells: [cell] } },
            });
            const request = {
                baseVersionUuid,
                operations: [
                    {
                        type: 'replace' as const,
                        cellId: cell.id,
                        cell: {
                            ...cell,
                            content: {
                                ...cell.content,
                                title: 'Updated section',
                            },
                        },
                    },
                ],
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
                        operations: [{ type: 'append', cell: semantic }],
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
        const cells = Array.from({ length: 9 }, (_, index) => ({
            ...semantic,
            id: `chart-${index}`,
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
                operations: [{ type: 'append', cell: semantic }],
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
                              operations: [{ type: 'append', cell: merge }],
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
        { ...createInput, schemaVersion: 1 },
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
        const cell: DocumentCellV3 = {
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
