import {
    ChartType,
    ConflictError,
    ContentType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QuerySurface,
    type Document,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../services/AiAccessService/agentActionTestUtils.mock';
import {
    AiAgentToolsService,
    type AiAgentToolsRuntimeContext,
} from './AiAgentToolsService';

const projectUuid = 'project';
const projectSlug = 'jaffle-shop';
const documentUrl = `/projects/${projectSlug}/documents/weekly-review`;
const spaceUuid = 'space';
const versionUuid = '0dc37ee3-264a-488b-a485-4379125afbf1';
const chart = {
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
};
const markdown = '## Findings';
const document: Document = {
    pinnedListUuid: null,
    verification: null,
    createdBy: null,
    owner: null,
    documentUuid: 'document',
    projectUuid,
    organizationUuid: 'organization',
    spaceUuid,
    name: 'Weekly review',
    slug: 'weekly-review',
    description: 'Findings',
    createdByUserUuid: 'user',
    ownerUserUuid: null,
    createdAt: new Date('2026-09-16'),
    updatedAt: new Date('2026-09-16'),
    version: {
        versionUuid,
        versionNumber: 1,
        schemaVersion: 2,
        content: { markdown, charts: {} },
        createdByUserUuid: 'user',
        createdAt: new Date('2026-09-16'),
    },
};
const metadata = {
    name: document.name,
    slug: document.slug,
    description: document.description,
    spaceSlug: 'reports',
    schemaVersion: 2 as const,
};
const content = { ...metadata, markdown, charts: {} };
const readContent = { ...metadata, markdown, chart: null };
const withChart = {
    ...document,
    version: {
        ...document.version,
        content: {
            markdown: `${markdown}\n\n<document-chart id="c1">`,
            charts: { c1: chart },
        },
    },
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
        moveToSpace: vi.fn().mockResolvedValue(undefined),
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
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ projectUuid, slug: projectSlug }),
    };
    const service = new AiAgentToolsService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        projectModel,
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
        querySurface: QuerySurface.MCP,
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
        projectModel,
    };
};

describe('MCP Document runtime', () => {
    test.each(['read', 'list', 'find'] as const)(
        '%s uses the canonical UUID when a document slug looks like another UUID',
        async (operation) => {
            const { runtime, documentService, contentService } = setup();
            const documentUuid = '36d4516a-3af0-48f6-9b47-d50956301501';
            const slug = '7b923cd0-371b-4d99-94ef-515267bfae57';
            documentService.getBySlug.mockResolvedValue({
                ...document,
                documentUuid,
                slug,
            });
            contentService.find.mockResolvedValue({
                data: [
                    {
                        contentType: ContentType.DOCUMENT,
                        uuid: documentUuid,
                        slug,
                        name: document.name,
                        description: document.description,
                        space: {
                            uuid: spaceUuid,
                            name: 'Reports',
                            path: 'reports',
                        },
                    },
                ],
                pagination: {
                    page: 1,
                    pageSize: 25,
                    totalResults: 1,
                    totalPageCount: 1,
                },
            });
            const expected = {
                uuid: documentUuid,
                href: `/projects/${projectSlug}/documents/${documentUuid}`,
            };
            if (operation === 'read') {
                await expect(
                    runtime.readDocumentContent(slug, null),
                ).resolves.toMatchObject(expected);
            } else if (operation === 'list') {
                await expect(
                    runtime.listContent({ spaceSlug: 'reports', page: 1 }),
                ).resolves.toMatchObject({
                    items: [expect.objectContaining(expected)],
                });
            } else {
                await expect(
                    runtime.findContent({
                        searchQuery: { label: 'weekly' },
                        spaceSlug: null,
                        verifiedOnly: false,
                    }),
                ).resolves.toMatchObject({
                    content: [expect.objectContaining(expected)],
                });
            }
        },
    );

    test.each(['read', 'list', 'find'] as const)(
        '%s keeps a working project UUID URL when project metadata has no slug',
        async (operation) => {
            const { runtime, projectModel } = setup();
            projectModel.getSummary.mockResolvedValue({ projectUuid });
            const href = `/projects/${projectUuid}/documents/${document.slug}`;
            if (operation === 'read') {
                await expect(
                    runtime.readDocumentContent(document.slug, null),
                ).resolves.toMatchObject({ href });
            } else if (operation === 'list') {
                await expect(
                    runtime.listContent({ spaceSlug: 'reports', page: 1 }),
                ).resolves.toMatchObject({
                    items: [expect.objectContaining({ href })],
                });
            } else {
                await expect(
                    runtime.findContent({
                        searchQuery: { label: 'weekly' },
                        spaceSlug: null,
                        verifiedOnly: false,
                    }),
                ).resolves.toMatchObject({
                    content: [expect.objectContaining({ href })],
                });
            }
        },
    );

    test.each(['list', 'find'] as const)(
        '%s builds slug URLs with one project lookup for multiple Documents',
        async (operation) => {
            const { runtime, contentService, projectModel } = setup();
            const documents = ['first-report', 'second-report'].map((slug) => ({
                contentType: ContentType.DOCUMENT,
                uuid: `${slug}-uuid`,
                slug,
                name: slug,
                description: null,
                space: { uuid: spaceUuid, path: 'reports', name: 'Reports' },
            }));
            contentService.find.mockResolvedValue({
                data: documents,
                pagination: {
                    page: 1,
                    pageSize: 25,
                    totalResults: 2,
                    totalPageCount: 1,
                },
            });
            const items =
                operation === 'list'
                    ? (
                          await runtime.listContent({
                              spaceSlug: 'reports',
                              page: 1,
                          })
                      ).items
                    : (
                          await runtime.findContent({
                              searchQuery: { label: 'report' },
                              spaceSlug: null,
                              verifiedOnly: false,
                          })
                      ).content;
            expect(
                items.filter(
                    (item) => item.contentType === ContentType.DOCUMENT,
                ),
            ).toEqual(
                documents.map(({ uuid, slug }) =>
                    expect.objectContaining({
                        uuid,
                        slug,
                        href: `/projects/${projectSlug}/documents/${slug}`,
                    }),
                ),
            );
            expect(projectModel.getSummary).toHaveBeenCalledExactlyOnceWith(
                projectUuid,
            );
        },
    );

    test('AI Agent generic tools reuse Document persistence without artifact methods', async () => {
        const { service, context, documentService } = setup([spaceUuid]);
        const runtime = service.createRuntime({
            ...context,
            source: 'ai_agent',
            promptUuid: 'prompt-uuid',
            threadUuid: 'thread-uuid',
            enableDocuments: true,
        });
        const created = await runtime.createContent({
            type: 'document',
            content,
        });
        expect(created).toMatchObject({
            type: 'document',
            uuid: document.documentUuid,
            versionUuid,
            href: documentUrl,
        });
        expect(documentService.create).toHaveBeenCalledOnce();
        expect(documentService.create.mock.calls[0][3]).toEqual({
            source: 'ai_agent',
            aiPromptUuid: 'prompt-uuid',
            aiThreadUuid: 'thread-uuid',
        });
        const read = await runtime.readContent({
            type: 'document',
            slug: document.slug,
            chartId: null,
        });
        expect(read).toMatchObject({
            type: 'document',
            content: readContent,
            href: documentUrl,
        });
        const edited = await runtime.editContent({
            type: 'document',
            slug: document.slug,
            documentEdit: {
                type: 'content',
                baseVersionUuid: versionUuid,
                markdown,
                charts: {},
            },
        });
        expect(edited).toMatchObject({
            uuid: document.documentUuid,
            href: documentUrl,
        });
        expect(documentService.updateContent).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            { baseVersionUuid: versionUuid, content: { markdown, charts: {} } },
            {
                allowedSpaceUuids: [spaceUuid],
                change: {
                    source: 'ai_agent',
                    aiPromptUuid: 'prompt-uuid',
                    aiThreadUuid: 'thread-uuid',
                },
            },
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
                content,
            }),
        ).rejects.toThrow(NotFoundError);
        await expect(
            runtime.readContent({
                type: 'document',
                slug: document.slug,
                chartId: null,
            }),
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
                href: documentUrl,
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
                href: documentUrl,
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

    test('native search without Documents enabled does not discover Documents', async () => {
        const { service, context, contentService } = setup();
        await expect(
            service
                .createRuntime({ ...context, source: 'ai_agent' })
                .findContent({
                    searchQuery: { label: 'weekly' },
                    spaceSlug: null,
                    verifiedOnly: false,
                }),
        ).resolves.toEqual({ content: [] });
        expect(contentService.find).not.toHaveBeenCalled();
    });

    test('verified search returns only verified Documents', async () => {
        const { runtime, contentService } = setup();
        const space = { uuid: spaceUuid, path: 'reports', name: 'Reports' };
        contentService.find.mockResolvedValue({
            data: [
                {
                    contentType: ContentType.DOCUMENT,
                    uuid: 'verified-uuid',
                    slug: 'verified-report',
                    name: 'Verified report',
                    description: null,
                    space,
                    verification: {
                        verifiedBy: {
                            userUuid: 'admin-uuid',
                            firstName: 'Ada',
                            lastName: 'Admin',
                        },
                        verifiedAt: new Date('2026-10-01'),
                    },
                },
                {
                    contentType: ContentType.DOCUMENT,
                    uuid: 'draft-uuid',
                    slug: 'draft-report',
                    name: 'Draft report',
                    description: null,
                    space,
                    verification: null,
                },
            ],
            pagination: {
                page: 1,
                pageSize: 25,
                totalResults: 2,
                totalPageCount: 1,
            },
        });
        const { content: found } = await runtime.findContent({
            searchQuery: { label: 'report' },
            spaceSlug: null,
            verifiedOnly: true,
        });
        expect(
            found
                .filter((item) => item.contentType === ContentType.DOCUMENT)
                .map((item) => item.uuid),
        ).toEqual(['verified-uuid']);
    });

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
            runtime.readDocumentContent(document.slug, null),
        ).resolves.toEqual({
            type: 'document',
            uuid: document.documentUuid,
            href: documentUrl,
            versionUuid,
            content: readContent,
        });
        expect(documentService.getBySlug).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.slug,
        );
        expect(documentService.get).not.toHaveBeenCalled();
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
        const bySlug = await runtime.readDocumentContent(identifier, null);
        expect(bySlug.uuid).toBe(document.documentUuid);
        expect(bySlug.content.slug).toBe(identifier);
        expect(documentService.getBySlug).toHaveBeenCalledWith(
            account,
            projectUuid,
            identifier,
        );
        expect(documentService.get).not.toHaveBeenCalled();
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
                schemaVersion: 2,
                content: { markdown, charts: {} },
            },
            { source: 'mcp' },
            { uniqueSlug: true },
        );
    });

    test.each(['read', 'content', 'metadata'] as const)(
        '%s rejects Documents outside effective MCP Space scope',
        async (operation) => {
            const { runtime, documentService } = setup(['different-space']);
            const request =
                operation === 'read'
                    ? runtime.readDocumentContent(document.slug, null)
                    : runtime.editDocumentContent(
                          document.slug,
                          operation === 'metadata'
                              ? { type: 'metadata', name: 'Changed' }
                              : {
                                    type: 'content',
                                    baseVersionUuid: versionUuid,
                                    markdown: '',
                                    charts: {},
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

    test('create resolves a Space by the name the user gave', async () => {
        const { runtime, spaceModel, documentService } = setup([spaceUuid]);
        spaceModel.find.mockResolvedValueOnce([]);
        await runtime.createDocumentContent({
            ...content,
            spaceSlug: ' reports ',
        });
        spaceModel.find.mockResolvedValueOnce([]);
        await runtime.createDocumentContent({
            ...content,
            spaceSlug: 'Reports',
        });
        expect(documentService.create).toHaveBeenCalledTimes(2);
        expect(documentService.create.mock.calls[1][2]).toMatchObject({
            spaceUuid,
        });
    });

    test('create lists accessible Spaces instead of guessing on a miss', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        await expect(
            runtime.createDocumentContent({
                ...content,
                spaceSlug: 'Quarterly Reports',
            }),
        ).rejects.toThrow(
            'Space "Quarterly Reports" was not found. Closest Spaces; confirm one with the user before using it:\n- Reports (spaceSlug: reports)',
        );
        expect(documentService.create).not.toHaveBeenCalled();
    });

    test('content edits keep charts placed by tag and forward version and Space scope', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        documentService.getBySlug.mockResolvedValue(withChart);
        await runtime.editDocumentContent(document.slug, {
            type: 'content',
            baseVersionUuid: versionUuid,
            markdown: '<document-chart id="c1">\n\n# Changed narrative',
            charts: {},
        });
        expect(documentService.updateContent).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            {
                baseVersionUuid: versionUuid,
                content: {
                    markdown: '<document-chart id="c1">\n\n# Changed narrative',
                    charts: { c1: chart },
                },
            },
            { allowedSpaceUuids: [spaceUuid], change: { source: 'mcp' } },
        );
        expect(documentService.updateMetadata).not.toHaveBeenCalled();
    });

    test('content edits add new charts by key and drop charts no longer placed', async () => {
        const { runtime, documentService } = setup();
        documentService.getBySlug.mockResolvedValue(withChart);
        await runtime.editDocumentContent(document.slug, {
            type: 'content',
            baseVersionUuid: versionUuid,
            markdown: 'Only new\n\n<document-chart id="fresh">',
            charts: { fresh: chart },
        });
        expect(documentService.updateContent.mock.calls[0][3].content).toEqual({
            markdown: 'Only new\n\n<document-chart id="fresh">',
            charts: { fresh: chart },
        });
    });

    test('chart edits patch one chart and keep the rest of the Document', async () => {
        const { runtime, documentService } = setup();
        documentService.getBySlug.mockResolvedValue(withChart);
        await runtime.editDocumentContent(document.slug, {
            type: 'chart',
            baseVersionUuid: versionUuid,
            chartId: 'c1',
            patch: [{ op: 'replace', path: '/chart/name', value: 'Renamed' }],
        });
        const saved = documentService.updateContent.mock.calls[0][3].content;
        expect(saved.markdown).toBe(withChart.version.content.markdown);
        expect(saved.charts.c1.chart.name).toBe('Renamed');
    });

    test('chart edits reject an unknown chart id', async () => {
        const { runtime, documentService } = setup();
        documentService.getBySlug.mockResolvedValue(withChart);
        await expect(
            runtime.editDocumentContent(document.slug, {
                type: 'chart',
                baseVersionUuid: versionUuid,
                chartId: 'c9',
                patch: [],
            }),
        ).rejects.toThrow('Document chart "c9" not found');
        expect(documentService.updateContent).not.toHaveBeenCalled();
    });

    test('reads charts as short tags, or one chart in full', async () => {
        const { runtime, documentService } = setup();
        documentService.getBySlug.mockResolvedValue(withChart);
        const summary = await runtime.readDocumentContent(document.slug, null);
        expect(summary.content).toMatchObject({
            markdown: `${markdown}\n\n<document-chart id="c1" title="Orders" type="table" explore="orders">`,
            chart: null,
        });
        const single = await runtime.readDocumentContent(document.slug, 'c1');
        expect(single.content).toMatchObject({
            markdown: null,
            chart: { id: 'c1', ...chart },
        });
        await expect(
            runtime.readDocumentContent(document.slug, 'c9'),
        ).rejects.toThrow('Chart ids: c1');
    });

    test('rejects conversation tags outside an AI agent conversation', async () => {
        const { runtime, documentService } = setup();
        await expect(
            runtime.createDocumentContent({
                ...content,
                markdown:
                    '<artifact-chart version="0b4f6c2e-55a7-4f0e-9f1e-0d3c3b9e8a11">',
            }),
        ).rejects.toThrow('only available inside an AI agent conversation');
        expect(documentService.create).not.toHaveBeenCalled();
    });

    test('metadata edits remain separate from version writes and forward Space scope', async () => {
        const { runtime, documentService } = setup([spaceUuid]);
        documentService.updateMetadata.mockResolvedValue({
            ...document,
            name: 'Updated',
            slug: 'updated-report',
        });
        const result = await runtime.editDocumentContent(document.slug, {
            type: 'metadata',
            name: 'Updated',
        });
        expect(result).toMatchObject({
            uuid: document.documentUuid,
            href: `/projects/${projectSlug}/documents/updated-report`,
        });
        expect(documentService.updateMetadata).toHaveBeenCalledWith(
            account,
            projectUuid,
            document.documentUuid,
            { name: 'Updated' },
            { allowedSpaceUuids: [spaceUuid], change: { source: 'mcp' } },
        );
        expect(documentService.updateContent).not.toHaveBeenCalled();
    });

    describe('personal Documents', () => {
        const personal: Document = { ...document, spaceUuid: null };

        test('are created without a Space, even under a Space scope', async () => {
            const { runtime, documentService } = setup([spaceUuid]);
            documentService.create.mockResolvedValue(personal);

            await expect(
                runtime.createDocumentContent({ ...content, spaceSlug: null }),
            ).resolves.toMatchObject({
                uuid: personal.documentUuid,
                content: { spaceSlug: null },
            });
            expect(documentService.create).toHaveBeenCalledWith(
                account,
                projectUuid,
                expect.objectContaining({ spaceUuid: undefined }),
                { source: 'mcp' },
                { uniqueSlug: true },
            );
        });

        test('are readable only by the user who created them', async () => {
            const { runtime, documentService } = setup();
            documentService.getBySlug.mockResolvedValueOnce(personal);
            await expect(
                runtime.readDocumentContent(personal.slug, null),
            ).resolves.toMatchObject({ content: { spaceSlug: null } });

            documentService.getBySlug.mockResolvedValueOnce({
                ...personal,
                createdByUserUuid: 'someone-else',
            });
            await expect(
                runtime.readDocumentContent(personal.slug, null),
            ).rejects.toThrow(NotFoundError);
        });

        test('are edited without the Space scope', async () => {
            const { runtime, documentService } = setup(['different-space']);
            documentService.getBySlug.mockResolvedValue(personal);
            documentService.updateContent.mockResolvedValue(personal);

            await runtime.editDocumentContent(personal.slug, {
                type: 'content',
                baseVersionUuid: versionUuid,
                markdown: '# Revised',
                charts: {},
            });

            expect(documentService.updateContent).toHaveBeenCalledWith(
                account,
                projectUuid,
                personal.documentUuid,
                expect.any(Object),
                { allowedSpaceUuids: undefined, change: { source: 'mcp' } },
            );
        });

        test('are saved into a Space named by the user', async () => {
            const { runtime, documentService } = setup([spaceUuid]);
            documentService.getBySlug.mockResolvedValue(personal);

            await expect(
                runtime.editDocumentContent(personal.slug, {
                    type: 'metadata',
                    spaceSlug: 'Reports',
                }),
            ).resolves.toMatchObject({ content: { spaceSlug: 'reports' } });
            expect(documentService.moveToSpace).toHaveBeenCalledWith(
                account,
                {
                    projectUuid,
                    itemUuid: personal.documentUuid,
                    targetSpaceUuid: spaceUuid,
                },
                { change: { source: 'mcp' } },
            );
            expect(documentService.updateMetadata).not.toHaveBeenCalled();
        });

        test('are renamed within the Space they were just saved to', async () => {
            const { runtime, documentService } = setup([spaceUuid]);
            documentService.getBySlug.mockResolvedValue(personal);

            await runtime.editDocumentContent(personal.slug, {
                type: 'metadata',
                spaceSlug: 'reports',
                name: 'Renamed',
            });

            expect(documentService.updateMetadata).toHaveBeenCalledWith(
                account,
                projectUuid,
                personal.documentUuid,
                { name: 'Renamed' },
                { allowedSpaceUuids: [spaceUuid], change: { source: 'mcp' } },
            );
        });

        test('only personal Documents can be saved to a Space', async () => {
            const { runtime, documentService } = setup();

            await expect(
                runtime.editDocumentContent(document.slug, {
                    type: 'metadata',
                    spaceSlug: 'reports',
                }),
            ).rejects.toThrow(ParameterError);
            expect(documentService.moveToSpace).not.toHaveBeenCalled();
        });
    });

    test('stale version conflicts are forwarded without retrying the write', async () => {
        const { runtime, documentService } = setup();
        const error = new ConflictError('Document has changed');
        documentService.updateContent.mockRejectedValue(error);
        await expect(
            runtime.editDocumentContent(document.slug, {
                type: 'content',
                baseVersionUuid: versionUuid,
                markdown: '',
                charts: {},
            }),
        ).rejects.toBe(error);
        expect(documentService.updateContent).toHaveBeenCalledOnce();
    });

    test('preserves DocumentService authorization or feature flag denial', async () => {
        const { runtime, documentService } = setup();
        const error = new ForbiddenError('Documents are not enabled');
        documentService.getBySlug.mockRejectedValue(error);
        await expect(
            runtime.readDocumentContent(document.slug, null),
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

describe.each(agentActionTestCases)(
    'document scope ledger: %s',
    (_, surface, enabled, count) => {
        test.each([
            'content',
            'metadata',
            'personal',
            'destination',
            'destination-name',
            'read',
        ] as const)('%s records one deciding refusal', async (operation) => {
            const { runtime, service, context, documentService, spaceModel } =
                setup(['allowed']);
            if (operation === 'personal')
                documentService.getBySlug.mockResolvedValue({
                    ...document,
                    spaceUuid: null,
                    createdByUserUuid: 'other',
                });
            if (operation === 'destination' || operation === 'destination-name')
                documentService.getBySlug.mockResolvedValue({
                    ...document,
                    spaceUuid: null,
                });
            if (operation === 'destination-name')
                spaceModel.find.mockResolvedValue([]);
            const run = () =>
                operation === 'read'
                    ? runtime.readDocumentContent(document.slug, null)
                    : runtime.editContent({
                          type: 'document',
                          slug: document.slug,
                          documentEdit:
                              operation === 'content'
                                  ? {
                                        type: 'content',
                                        baseVersionUuid: versionUuid,
                                        markdown: '',
                                        charts: {},
                                    }
                                  : {
                                        type: 'metadata',
                                        name: 'private name',
                                        ...([
                                            'destination',
                                            'destination-name',
                                        ].includes(operation)
                                            ? { spaceSlug: 'reports' }
                                            : {}),
                                    },
                      });
            await expect(
                withAgentActionScope(
                    {
                        ...context.user,
                        organizationUuid: context.organizationUuid,
                    },
                    surface,
                    enabled,
                    run,
                ),
            ).rejects.toThrow(NotFoundError);
            const insert = vi.mocked(service['agentActionLogModel'].insert);
            expect(insert).toHaveBeenCalledTimes(count);
            if (count)
                expect(insert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        object_type: 'document',
                        object_uuid: document.documentUuid,
                        action: operation === 'read' ? 'read' : 'update',
                        outcome: 'denied',
                        policy_layer: 'agent_scope',
                        reason_code: {
                            personal: 'personal_document_outside_agent_scope',
                            destination:
                                'document_destination_outside_agent_scope',
                            'destination-name':
                                'document_destination_outside_agent_scope',
                            read: 'document_outside_agent_scope',
                            content: 'document_outside_agent_scope',
                            metadata: 'document_outside_agent_scope',
                        }[operation],
                    }),
                );
            expect(documentService.updateContent).not.toHaveBeenCalled();
            expect(documentService.updateMetadata).not.toHaveBeenCalled();
            expect(documentService.moveToSpace).not.toHaveBeenCalled();
            expect(JSON.stringify(insert.mock.calls)).not.toContain(
                'private name',
            );
        });
        test('missing destination remains a lookup failure', async () => {
            const { runtime, service, context, documentService, spaceModel } =
                setup(['allowed']);
            documentService.getBySlug.mockResolvedValue({
                ...document,
                spaceUuid: null,
            });
            spaceModel.find.mockResolvedValue([]);
            await expect(
                withAgentActionScope(
                    {
                        ...context.user,
                        organizationUuid: context.organizationUuid,
                    },
                    surface,
                    enabled,
                    () =>
                        runtime.editContent({
                            type: 'document',
                            slug: document.slug,
                            documentEdit: {
                                type: 'metadata',
                                spaceSlug: 'missing',
                            },
                        }),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(
                service['agentActionLogModel'].insert,
            ).not.toHaveBeenCalled();
            expect(documentService.moveToSpace).not.toHaveBeenCalled();
        });
        test('missing document remains a lookup failure', async () => {
            const { runtime, service, context, documentService } = setup([
                'allowed',
            ]);
            documentService.getBySlug.mockRejectedValue(
                new NotFoundError('Document not found'),
            );
            await expect(
                withAgentActionScope(
                    {
                        ...context.user,
                        organizationUuid: context.organizationUuid,
                    },
                    surface,
                    enabled,
                    () =>
                        runtime.editContent({
                            type: 'document',
                            slug: 'missing',
                            documentEdit: { type: 'metadata', name: 'new' },
                        }),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(
                service['agentActionLogModel'].insert,
            ).not.toHaveBeenCalled();
        });
    },
);
