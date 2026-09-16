import {
    ChartType,
    ConflictError,
    ContentType,
    ForbiddenError,
    NotFoundError,
    QueryExecutionContext,
    type Document,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import {
    AiAgentToolsService,
    type AiAgentToolsRuntimeContext,
} from './AiAgentToolsService';

const projectUuid = 'project';
const spaceUuid = 'space';
const versionUuid = '0dc37ee3-264a-488b-a485-4379125afbf1';
const cell = {
    id: 'intro',
    type: 'markdown' as const,
    content: { markdown: '## Findings' },
};
const document: Document = {
    documentUuid: 'document',
    projectUuid,
    organizationUuid: 'organization',
    spaceUuid,
    name: 'Weekly review',
    slug: 'weekly-review',
    description: 'Findings',
    createdByUserUuid: 'user',
    createdAt: new Date('2026-09-16'),
    updatedAt: new Date('2026-09-16'),
    version: {
        versionUuid,
        versionNumber: 1,
        schemaVersion: 3,
        content: { cells: [cell] },
        createdByUserUuid: 'user',
        createdAt: new Date('2026-09-16'),
    },
};
const content = {
    name: document.name,
    slug: document.slug,
    description: document.description,
    spaceSlug: 'reports',
    schemaVersion: 3,
    content: { cells: [{ type: cell.type, content: cell.content }] },
};
const account = {
    user: { type: 'registered', id: 'user', userUuid: 'user' },
} as unknown as RegisteredAccount;
const setup = (spaceAccess: string[] | null = null) => {
    const documentService = {
        get: vi.fn().mockResolvedValue(document),
        getBySlug: vi.fn().mockResolvedValue(document),
        create: vi.fn().mockResolvedValue(document),
        updateContent: vi.fn().mockResolvedValue(document),
        updateMetadata: vi.fn().mockResolvedValue(document),
    };
    const spaceModel = {
        find: vi.fn().mockResolvedValue([{ uuid: spaceUuid, path: 'reports' }]),
        hasSpaceWithPathAndUuids: vi.fn().mockResolvedValue(true),
    };
    const space = { uuid: spaceUuid, path: 'reports', name: 'Reports' };
    const contentService = {
        find: vi.fn().mockResolvedValue({
            data: [
                {
                    contentType: ContentType.DOCUMENT,
                    uuid: document.documentUuid,
                    slug: document.slug,
                    name: document.name,
                    description: document.description,
                    space,
                },
            ],
            pagination: {
                page: 1,
                pageSize: 25,
                totalResults: 1,
                totalPageCount: 1,
            },
        }),
    };
    const service = new AiAgentToolsService({
        documentService,
        spaceModel,
        contentService,
        projectService: { getSpaces: vi.fn().mockResolvedValue([space]) },
        searchService: {
            findContent: vi.fn().mockResolvedValue({ content: [] }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentToolsService>[0]);
    const context: AiAgentToolsRuntimeContext & { source: 'mcp' } = {
        user: { userUuid: 'user' } as SessionUser,
        account,
        projectUuid,
        organizationUuid: document.organizationUuid,
        source: 'mcp',
        catalogSearchContext: CatalogSearchContext.MCP,
        defaultQueryExecutionContext:
            QueryExecutionContext.MCP_RUN_METRIC_QUERY,
        tags: null,
        spaceAccess,
    };
    return {
        service,
        context,
        runtime: service.createRuntime(context),
        documentService,
        spaceModel,
        contentService,
    };
};

describe('MCP Document runtime', () => {
    test('AI Agent generic tools reuse Document persistence without artifact methods', async () => {
        const { service, context, documentService } = setup([spaceUuid]);
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
            enableDocuments: true,
        });
        const created = await runtime.createContent({
            type: 'document',
            content: { ...content, schemaVersion: 3 },
        });
        expect(created).toMatchObject({
            type: 'document',
            uuid: document.documentUuid,
            versionUuid,
        });
        expect(documentService.create).toHaveBeenCalledOnce();
        const read = await runtime.readContent({
            type: 'document',
            documentUuid: document.documentUuid,
        });
        expect(read).toMatchObject({ type: 'document', content });
        await runtime.editContent({
            type: 'document',
            slug: document.slug,
            documentEdit: {
                type: 'content',
                baseVersionUuid: versionUuid,
                content: content.content,
            },
        });
        expect(documentService.updateContent).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            { baseVersionUuid: versionUuid, content: { cells: [cell] } },
            { allowedSpaceUuids: [spaceUuid] },
        );
    });

    test('enabled AI Agent discovery includes Documents', async () => {
        const { service, context } = setup([spaceUuid]);
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
            enableDocuments: true,
        });
        expect(
            await runtime.listContent({ spaceSlug: 'reports', page: 1 }),
        ).toMatchObject({
            items: [{ contentType: 'document', slug: document.slug }],
        });
        expect(
            await runtime.findContent({
                searchQuery: { label: 'weekly' },
                spaceSlug: null,
                verifiedOnly: false,
            }),
        ).toMatchObject({
            content: [{ contentType: 'document', slug: document.slug }],
        });
    });

    test('AI Agent Document reads and writes preserve Space restrictions', async () => {
        const { service, context, documentService } = setup([
            'different-space',
        ]);
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
            enableDocuments: true,
        });
        await expect(
            runtime.createContent({
                type: 'document',
                content: { ...content, schemaVersion: 3 },
            }),
        ).rejects.toThrow(NotFoundError);
        await expect(
            runtime.readContent({ type: 'document', slug: document.slug }),
        ).rejects.toThrow(NotFoundError);
        await expect(
            runtime.editContent({
                type: 'document',
                slug: document.slug,
                documentEdit: { type: 'metadata', name: 'New title' },
            }),
        ).rejects.toThrow(NotFoundError);
        expect(documentService.create).not.toHaveBeenCalled();
        expect(documentService.updateMetadata).not.toHaveBeenCalled();
    });
    test('MCP Space listing includes lightweight Document references', async () => {
        const { runtime, contentService, documentService } = setup([spaceUuid]);
        const result = await runtime.listContent({
            spaceSlug: 'reports',
            page: 1,
        });
        expect(result.items).toEqual([
            {
                contentType: ContentType.DOCUMENT,
                uuid: document.documentUuid,
                name: document.name,
                slug: document.slug,
                href: `/projects/${projectUuid}/documents/${document.documentUuid}`,
            },
        ]);
        expect(contentService.find).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                spaceUuids: [spaceUuid],
                contentTypes: expect.arrayContaining([ContentType.DOCUMENT]),
            }),
            {},
            { page: 1, pageSize: 25 },
        );
        expect(documentService.getBySlug).not.toHaveBeenCalled();
    });

    test('native Space listing excludes Documents even when a content response includes one', async () => {
        const { service, context, contentService, documentService } = setup();
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
        });
        await expect(
            runtime.listContent({ spaceSlug: 'reports', page: 1 }),
        ).resolves.toMatchObject({ items: [] });
        expect(contentService.find).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                contentTypes: expect.not.arrayContaining([
                    ContentType.DOCUMENT,
                ]),
            }),
            {},
            { page: 1, pageSize: 25 },
        );
        expect(documentService.getBySlug).not.toHaveBeenCalled();
    });

    test('Space listing denies destinations outside MCP scope before content lookup', async () => {
        const { runtime, contentService } = setup(['different-space']);
        await expect(
            runtime.listContent({ spaceSlug: 'reports', page: 1 }),
        ).rejects.toThrow(NotFoundError);
        expect(contentService.find).not.toHaveBeenCalled();
    });

    test('MCP search includes Document identity with its effective Space filter', async () => {
        const { runtime, contentService, documentService } = setup([spaceUuid]);
        const result = await runtime.findContent({
            searchQuery: { label: 'weekly' },
            spaceSlug: null,
            verifiedOnly: false,
        });
        expect(result.content).toEqual([
            expect.objectContaining({
                contentType: 'document',
                uuid: document.documentUuid,
                slug: document.slug,
                verification: null,
                href: `/projects/${projectUuid}/documents/${document.documentUuid}`,
            }),
        ]);
        expect(contentService.find).toHaveBeenCalledWith(
            expect.anything(),
            {
                projectUuids: [projectUuid],
                contentTypes: [ContentType.DOCUMENT],
                spaceUuids: [spaceUuid],
                search: 'weekly',
            },
            {},
            { page: 1, pageSize: 25 },
        );
        expect(documentService.getBySlug).not.toHaveBeenCalled();
        expect(result.content[0]).not.toHaveProperty('versionUuid');
    });

    test.each(['native', 'verified'] as const)(
        '%s search does not discover Documents',
        async (mode) => {
            const { runtime, service, context, contentService } = setup();
            const target =
                mode === 'native'
                    ? service.createRuntime({ ...context, source: 'ai_agent' })
                    : runtime;
            await expect(
                target.findContent({
                    searchQuery: { label: 'weekly' },
                    spaceSlug: null,
                    verifiedOnly: mode === 'verified',
                }),
            ).resolves.toEqual({ content: [] });
            expect(contentService.find).not.toHaveBeenCalled();
        },
    );

    test('search denies an explicitly requested Space outside MCP scope', async () => {
        const { runtime, contentService } = setup(['different-space']);
        await expect(
            runtime.findContent({
                searchQuery: { label: 'weekly' },
                spaceSlug: 'reports',
                verifiedOnly: false,
            }),
        ).rejects.toThrow(NotFoundError);
        expect(contentService.find).not.toHaveBeenCalled();
    });

    test('reads authorized content with its stable version and dedicated URL', async () => {
        const { runtime, documentService } = setup();
        await expect(
            runtime.readDocumentContent({ slug: document.slug }),
        ).resolves.toEqual({
            type: 'document',
            uuid: document.documentUuid,
            href: `/projects/${projectUuid}/documents/${document.documentUuid}`,
            versionUuid,
            content,
        });
        expect(documentService.getBySlug).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.slug,
        );
        expect(documentService.get).not.toHaveBeenCalled();
    });

    test('reads the UUID from a canonical Document URL within the current project', async () => {
        const { runtime, documentService } = setup();
        const documentUuid = '7b923cd0-371b-4d99-94ef-515267bfae57';
        const saved = { ...document, documentUuid };
        documentService.get.mockResolvedValue(saved);
        documentService.getBySlug.mockResolvedValue(saved);
        const bySlug = await runtime.readDocumentContent({
            slug: document.slug,
        });
        documentService.getBySlug.mockClear();
        await expect(
            runtime.readDocumentContent({ documentUuid }),
        ).resolves.toEqual(bySlug);
        expect(documentService.get).toHaveBeenCalledWith(
            account,
            projectUuid,
            documentUuid,
        );
        expect(documentService.getBySlug).not.toHaveBeenCalled();
    });

    test('UUID reads preserve project authorization and effective Space scope', async () => {
        const { runtime, documentService } = setup(['different-space']);
        const documentUuid = '7b923cd0-371b-4d99-94ef-515267bfae57';
        await expect(
            runtime.readDocumentContent({ documentUuid }),
        ).rejects.toThrow(NotFoundError);
        const error = new NotFoundError('Document not found');
        documentService.get.mockRejectedValue(error);
        await expect(
            runtime.readDocumentContent({ documentUuid }),
        ).rejects.toBe(error);
        expect(documentService.get).toHaveBeenCalledWith(
            account,
            projectUuid,
            documentUuid,
        );
        expect(documentService.getBySlug).not.toHaveBeenCalled();
    });

    test('a UUID-looking slug stays an exact slug and cannot select another Document', async () => {
        const { runtime, documentService } = setup();
        const identifier = '7b923cd0-371b-4d99-94ef-515267bfae57';
        documentService.getBySlug.mockResolvedValue({
            ...document,
            slug: identifier,
        });
        documentService.get.mockResolvedValue({
            ...document,
            documentUuid: identifier,
            slug: 'different-document',
        });
        const bySlug = await runtime.readDocumentContent({ slug: identifier });
        expect(bySlug.uuid).toBe(document.documentUuid);
        expect(bySlug.content.slug).toBe(identifier);
        expect(documentService.getBySlug).toHaveBeenCalledWith(
            account,
            projectUuid,
            identifier,
        );
        expect(documentService.get).not.toHaveBeenCalled();
        const byUuid = await runtime.readDocumentContent({
            documentUuid: identifier,
        });
        expect(byUuid.uuid).toBe(identifier);
        expect(byUuid.content.slug).toBe('different-document');
    });

    test('creates directly through DocumentService with a resolved Space UUID', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        await expect(
            runtime.createDocumentContent(content),
        ).resolves.toMatchObject({
            uuid: document.documentUuid,
            versionUuid,
        });
        expect(documentService.create).toHaveBeenCalledWith(
            account,
            projectUuid,
            {
                name: document.name,
                slug: document.slug,
                description: document.description,
                spaceUuid,
                schemaVersion: 3,
                content: { cells: [{ ...cell, id: expect.any(String) }] },
            },
        );
    });

    test.each(['read', 'content', 'metadata'] as const)(
        '%s rejects Documents outside effective MCP Space scope',
        async (operation) => {
            const { runtime, documentService } = setup(['different-space']);
            const request =
                operation === 'read'
                    ? runtime.readDocumentContent({ slug: document.slug })
                    : runtime.editDocumentContent(
                          document.slug,
                          operation === 'metadata'
                              ? { type: 'metadata', name: 'Changed' }
                              : {
                                    type: 'content',
                                    baseVersionUuid: versionUuid,
                                    content: { cells: [] },
                                },
                      );
            await expect(request).rejects.toThrow(NotFoundError);
            expect(documentService.updateMetadata).not.toHaveBeenCalled();
            expect(documentService.updateContent).not.toHaveBeenCalled();
        },
    );

    test('create refuses an out-of-scope destination before persisting', async () => {
        const { runtime, spaceModel, documentService } = setup([
            'allowed-space',
        ]);
        spaceModel.hasSpaceWithPathAndUuids.mockResolvedValue(false);
        await expect(runtime.createDocumentContent(content)).rejects.toThrow(
            NotFoundError,
        );
        expect(documentService.create).not.toHaveBeenCalled();
    });

    test('create checks the resolved Space UUID even when its path matches scope', async () => {
        const { runtime, documentService } = setup(['different-space']);
        await expect(runtime.createDocumentContent(content)).rejects.toThrow(
            NotFoundError,
        );
        expect(documentService.create).not.toHaveBeenCalled();
    });

    test('content edits assign server IDs and forward the complete content, version and Space scope', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        const replacement = {
            cells: [content.content.cells[0], content.content.cells[0]],
        };
        await runtime.editDocumentContent(document.slug, {
            type: 'content',
            baseVersionUuid: versionUuid,
            content: replacement,
        });
        expect(documentService.updateContent).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            {
                baseVersionUuid: versionUuid,
                content: {
                    cells: replacement.cells.map((item) => ({
                        ...item,
                        id: expect.any(String),
                    })),
                },
            },
            { allowedSpaceUuids: [spaceUuid] },
        );
        expect(documentService.updateMetadata).not.toHaveBeenCalled();
        const savedCells =
            documentService.updateContent.mock.calls[0][3].content.cells;
        expect(savedCells[0].id).not.toBe(savedCells[1].id);
    });

    test('metadata edits remain separate from version writes and forward Space scope', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        await runtime.editDocumentContent(document.slug, {
            type: 'metadata',
            name: 'Updated',
        });
        expect(documentService.updateMetadata).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            { name: 'Updated' },
            { allowedSpaceUuids: [spaceUuid] },
        );
        expect(documentService.updateContent).not.toHaveBeenCalled();
    });

    test('reuses retained chart IDs across reordering without exposing IDs to the author', async () => {
        const { runtime, documentService } = setup();
        const chartCell = {
            id: 'existing-chart',
            type: 'chart' as const,
            content: {
                source: 'semantic' as const,
                chart: {
                    name: 'Orders',
                    tableName: 'orders',
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: [],
                        metrics: ['orders_count'],
                        filters: {},
                        sorts: [],
                        limit: 100,
                        tableCalculations: [],
                    },
                    chartConfig: { type: ChartType.TABLE },
                },
            },
        };
        documentService.getBySlug.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: { cells: [cell, chartCell] },
            },
        });
        await runtime.editDocumentContent(document.slug, {
            type: 'content',
            baseVersionUuid: versionUuid,
            content: {
                cells: [
                    { type: chartCell.type, content: chartCell.content },
                    {
                        type: cell.type,
                        content: { markdown: '# Changed narrative' },
                    },
                ],
            },
        });
        const saved =
            documentService.updateContent.mock.calls[0][3].content.cells;
        expect(saved[0]).toEqual(chartCell);
        expect(saved[1].id).not.toBe(cell.id);
    });

    test('stale version conflicts are forwarded without retrying the write', async () => {
        const { runtime, documentService } = setup();
        const error = new ConflictError('Document has changed');
        documentService.updateContent.mockRejectedValue(error);
        await expect(
            runtime.editDocumentContent(document.slug, {
                type: 'content',
                baseVersionUuid: versionUuid,
                content: { cells: [] },
            }),
        ).rejects.toBe(error);
        expect(documentService.updateContent).toHaveBeenCalledOnce();
    });

    test('preserves DocumentService authorization or feature flag denial', async () => {
        const { runtime, documentService } = setup();
        const error = new ForbiddenError('Documents are not enabled');
        documentService.getBySlug.mockRejectedValue(error);
        await expect(
            runtime.readDocumentContent({ slug: document.slug }),
        ).rejects.toBe(error);
    });

    test('native AI runtimes do not expose Document methods', () => {
        const { service, context } = setup();
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
        });
        expect(runtime).not.toHaveProperty('createDocumentContent');
        expect(runtime).not.toHaveProperty('readDocumentContent');
        expect(runtime).not.toHaveProperty('editDocumentContent');
    });
});
