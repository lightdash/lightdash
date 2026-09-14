import {
    Account,
    CatalogType,
    ContentType,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    ForbiddenError,
    JobStatusType,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    RequestMethod,
    SessionUser,
    SourceQuery,
    UnitOfTime,
    WarehouseTypes,
    type DataAppSearchResult,
    type DataAppVizSchema,
    type ExtractedDataReference,
    type PersistedDataAppDataReferences,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { AiAgentContentValidation } from '../ai/utils/AiAgentContentValidation';
import type { DataAppReadSource } from '../AppGenerateService/AppGenerateService';
import {
    AiAgentToolsService,
    type AiAgentToolsRuntimeContext,
} from './AiAgentToolsService';

const location = { path: 'src/App.tsx', line: 1, column: 1 };

const organizationUuid = 'organization-uuid';
const projectUuid = 'project-uuid';
const userUuid = 'user-uuid';

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
} as unknown as SessionUser;

const account = {
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    user: { id: userUuid },
} as unknown as Account;

const makeExplore = ({
    name,
    tags = [],
    requiredAttributes = {},
    dimensions = {},
    metrics = {},
    requiredFilters = [],
}: {
    name: string;
    tags?: string[];
    requiredAttributes?: Record<string, string>;
    dimensions?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
    requiredFilters?: NonNullable<Explore['tables'][string]['requiredFilters']>;
}): Explore =>
    ({
        name,
        label: name,
        tags,
        baseTable: name,
        joinedTables: [],
        tables: {
            [name]: {
                name,
                label: name,
                requiredAttributes,
                anyAttributes: {},
                requiredFilters,
                dimensions,
                metrics,
            },
        },
    }) as unknown as Explore;

const makeService = ({
    explores = {},
    userAttributes = {},
    searchCatalog = vi.fn(),
    verifiedFieldUsage = new Map<string, number>(),
    searchFieldUniqueValues = vi.fn(),
    projectSpaces = [],
    spaceModel = {
        hasSpaceWithPathAndUuids: vi.fn().mockResolvedValue(true),
    },
    dashboardService = {},
    savedChartService = {},
    asyncQueryService = {},
    coderService = {},
    aiAgentContentValidation = {},
    scheduleCompileProject = vi.fn().mockResolvedValue({ jobUuid: 'job-1' }),
    jobModel = { get: vi.fn() },
    aiAgentDocumentModel = {},
    aiDeepResearchRunModel = {},
    featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: false }),
    },
    projectModel = {},
    projectService = {},
    querySourceService = {},
    contentService = {},
    searchService = {},
    appGenerateService = {},
    appModel = {},
    savedChartModel = {},
    dashboardModel = {},
}: {
    explores?: Record<string, Explore>;
    userAttributes?: Record<string, string[]>;
    searchCatalog?: import('vitest').Mock;
    verifiedFieldUsage?: Map<string, number>;
    searchFieldUniqueValues?: import('vitest').Mock;
    projectSpaces?: Array<{ uuid: string; path: string }>;
    spaceModel?: Record<string, unknown>;
    dashboardService?: Record<string, unknown>;
    savedChartService?: Record<string, unknown>;
    asyncQueryService?: Record<string, unknown>;
    coderService?: Record<string, unknown>;
    aiAgentContentValidation?: Record<string, unknown>;
    scheduleCompileProject?: import('vitest').Mock;
    jobModel?: Record<string, unknown>;
    aiAgentDocumentModel?: Record<string, unknown>;
    aiDeepResearchRunModel?: Record<string, unknown>;
    featureFlagService?: Record<string, unknown>;
    projectModel?: Record<string, unknown>;
    projectService?: Record<string, unknown>;
    querySourceService?: Record<string, unknown>;
    contentService?: Record<string, unknown>;
    searchService?: Record<string, unknown>;
    appGenerateService?: Record<string, unknown>;
    appModel?: Record<string, unknown>;
    savedChartModel?: Record<string, unknown>;
    dashboardModel?: Record<string, unknown>;
} = {}) =>
    new AiAgentToolsService({
        builtInSkills: {
            getAiAgentSkills: vi.fn(),
            getAiAgentSkill: vi.fn(),
            listSkillToolReferences: vi.fn(),
            readSkillTool: vi.fn(),
            readSkillToolResource: vi.fn(),
            listMcpResources: vi.fn(),
            getMcpResourceBody: vi.fn(),
        },
        lightdashConfig: {
            siteUrl: 'https://lightdash.example',
            ai: { copilot: { maxQueryLimit: 500 } },
        },
        projectModel: {
            findExploresFromCache: vi.fn(
                async (
                    _projectUuid: string,
                    _sortBy: string,
                    exploreNames?: string[],
                ) =>
                    exploreNames
                        ? Object.fromEntries(
                              Object.entries(explores).filter(([exploreName]) =>
                                  exploreNames.includes(exploreName),
                              ),
                          )
                        : explores,
            ),
            getAllByOrganizationUuid: vi.fn().mockResolvedValue([]),
            get: vi.fn(),
            ...projectModel,
        },
        projectService: {
            searchFieldUniqueValues,
            getSpaces: vi.fn().mockResolvedValue(projectSpaces),
            scheduleCompileProject,
            ...projectService,
        },
        jobModel,
        userAttributesModel: {
            getAttributeValuesForOrgMember: vi
                .fn()
                .mockResolvedValue(userAttributes),
        },
        catalogService: { searchCatalog },
        contentVerificationModel: {
            getVerifiedFieldUsage: vi
                .fn()
                .mockResolvedValue(verifiedFieldUsage),
        },
        searchModel: {},
        searchService,
        spaceService: {},
        spaceModel,
        dashboardService,
        savedChartService,
        coderService,
        contentService,
        aiAgentContentValidation,
        projectContextModel: {},
        aiAgentDocumentModel,
        aiDeepResearchRunModel,
        featureFlagService,
        previewDeploySetupService: {},
        shareService: {},
        asyncQueryService,
        querySourceService,
        appGenerateService,
        appModel,
        savedChartModel,
        dashboardModel,
    } as unknown as ConstructorParameters<typeof AiAgentToolsService>[0]);

function makeRuntimeContext(
    overrides: Partial<AiAgentToolsRuntimeContext> & { source: 'mcp' },
): AiAgentToolsRuntimeContext & { source: 'mcp' };
function makeRuntimeContext(
    overrides?: Partial<AiAgentToolsRuntimeContext> & { source?: 'ai_agent' },
): AiAgentToolsRuntimeContext & { source: 'ai_agent' };
function makeRuntimeContext(
    overrides: Partial<AiAgentToolsRuntimeContext> = {},
): AiAgentToolsRuntimeContext {
    return {
        user,
        account,
        organizationUuid,
        projectUuid,
        source: 'ai_agent',
        catalogSearchContext: CatalogSearchContext.AI_AGENT,
        defaultQueryExecutionContext: QueryExecutionContext.AI,
        tags: null,
        spaceAccess: null,
        ...overrides,
    };
}

describe('AiAgentToolsService', () => {
    const makeProjectSpace = (uuid: string, path: string, name: string) => ({
        uuid,
        path,
        name,
        chartCount: 0,
        dashboardCount: 0,
        childSpaceCount: 0,
        appCount: 1,
        userAccess: undefined,
    });

    const makeDataAppSearchResult = (
        overrides: Partial<
            DataAppSearchResult & { contentType: 'data_app' }
        > = {},
    ): DataAppSearchResult & { contentType: 'data_app' } => ({
        contentType: 'data_app',
        uuid: 'app-uuid',
        slug: 'sales-forecast',
        name: 'Sales forecast',
        description: 'Forecast revenue by region',
        spaceUuid: 'sales-space-uuid',
        projectUuid,
        search_rank: 0.8,
        viewsCount: 12,
        createdBy: {
            firstName: 'Ada',
            lastName: 'Lovelace',
            userUuid,
        },
        ...overrides,
    });

    it('finds Space and personal Data Apps in unrestricted project search', async () => {
        const searchService = {
            findContent: vi.fn().mockResolvedValue({
                content: [
                    makeDataAppSearchResult(),
                    makeDataAppSearchResult({
                        uuid: 'personal-app-uuid',
                        slug: 'personal-forecast',
                        name: 'Personal forecast',
                        spaceUuid: null,
                    }),
                ],
            }),
        };
        const service = makeService({
            projectSpaces: [
                makeProjectSpace('sales-space-uuid', 'sales', 'Sales'),
            ],
            searchService,
        });

        const result = await service
            .createRuntime(makeRuntimeContext())
            .findContent({
                searchQuery: { label: 'forecast revenue' },
                spaceSlug: null,
                verifiedOnly: true,
            });

        expect(result.content).toEqual([
            expect.objectContaining({
                contentType: 'data_app',
                uuid: 'app-uuid',
                space: expect.objectContaining({ slug: 'sales' }),
                verification: null,
            }),
            expect.objectContaining({
                contentType: 'data_app',
                uuid: 'personal-app-uuid',
                space: null,
                verification: null,
            }),
        ]);
        expect(searchService.findContent).toHaveBeenCalledWith(
            user,
            projectUuid,
            'forecast revenue',
            true,
        );
    });

    it('drops apps whose Space is not caller-visible, like charts and dashboards', async () => {
        const searchService = {
            findContent: vi.fn().mockResolvedValue({
                content: [
                    makeDataAppSearchResult({
                        uuid: 'creator-app-uuid',
                        spaceUuid: 'hidden-space-uuid',
                    }),
                ],
            }),
        };
        const service = makeService({ searchService });

        const args = {
            searchQuery: { label: 'forecast' },
            spaceSlug: null,
            verifiedOnly: false,
        } as const;
        const [unrestrictedResult, scopedResult] = await Promise.all([
            service.createRuntime(makeRuntimeContext()).findContent(args),
            service
                .createRuntime(
                    makeRuntimeContext({
                        spaceAccess: ['hidden-space-uuid'],
                    }),
                )
                .findContent(args),
        ]);

        for (const result of [unrestrictedResult, scopedResult]) {
            expect(result.content).toEqual([]);
        }
    });

    it('keeps Data Apps alongside verified dashboards in verified-only search', async () => {
        const searchService = {
            findContent: vi.fn().mockResolvedValue({
                content: [
                    {
                        contentType: 'dashboard',
                        uuid: 'verified-dashboard-uuid',
                        name: 'Verified dashboard',
                        spaceUuid: 'sales-space-uuid',
                        verification: {
                            verifiedBy: {
                                userUuid,
                                firstName: 'Ada',
                                lastName: 'Lovelace',
                            },
                            verifiedAt: new Date('2026-01-01'),
                        },
                    },
                    makeDataAppSearchResult(),
                ],
            }),
        };
        const service = makeService({
            projectSpaces: [
                makeProjectSpace('sales-space-uuid', 'sales', 'Sales'),
            ],
            searchService,
        });

        const result = await service
            .createRuntime(makeRuntimeContext())
            .findContent({
                searchQuery: { label: 'forecast' },
                spaceSlug: null,
                verifiedOnly: true,
            });

        expect(
            result.content.map(({ contentType, uuid }) => ({
                contentType,
                uuid,
            })),
        ).toEqual([
            {
                contentType: 'dashboard',
                uuid: 'verified-dashboard-uuid',
            },
            { contentType: 'data_app', uuid: 'app-uuid' },
        ]);
        expect(searchService.findContent).toHaveBeenCalledWith(
            user,
            projectUuid,
            'forecast',
            true,
        );
    });

    it('limits Data Apps to an explicit Space and descendants', async () => {
        const searchService = {
            findContent: vi.fn().mockResolvedValue({
                content: [
                    makeDataAppSearchResult(),
                    makeDataAppSearchResult({
                        uuid: 'child-app-uuid',
                        spaceUuid: 'child-space-uuid',
                    }),
                    makeDataAppSearchResult({
                        uuid: 'other-app-uuid',
                        spaceUuid: 'other-space-uuid',
                    }),
                    makeDataAppSearchResult({
                        uuid: 'personal-app-uuid',
                        spaceUuid: null,
                    }),
                ],
            }),
        };
        const service = makeService({
            projectSpaces: [
                makeProjectSpace('sales-space-uuid', 'sales', 'Sales'),
                makeProjectSpace(
                    'child-space-uuid',
                    'sales.pipeline',
                    'Pipeline',
                ),
                makeProjectSpace('other-space-uuid', 'finance', 'Finance'),
            ],
            searchService,
        });

        const result = await service
            .createRuntime(makeRuntimeContext())
            .findContent({
                searchQuery: { label: 'forecast' },
                spaceSlug: 'sales',
                verifiedOnly: false,
            });

        expect(result.content.map(({ uuid }) => uuid)).toEqual([
            'app-uuid',
            'child-app-uuid',
        ]);
        expect(result.content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ contentType: 'data_app' }),
            ]),
        );
    });

    it('does not let creator visibility bypass agent Space scope', async () => {
        const searchService = {
            findContent: vi.fn().mockResolvedValue({
                content: [
                    makeDataAppSearchResult(),
                    makeDataAppSearchResult({
                        uuid: 'blocked-app-uuid',
                        spaceUuid: 'blocked-space-uuid',
                    }),
                    makeDataAppSearchResult({
                        uuid: 'creator-personal-app-uuid',
                        spaceUuid: null,
                    }),
                ],
            }),
        };
        const service = makeService({
            projectSpaces: [
                makeProjectSpace('sales-space-uuid', 'sales', 'Sales'),
            ],
            searchService,
        });

        const result = await service
            .createRuntime(
                makeRuntimeContext({ spaceAccess: ['sales-space-uuid'] }),
            )
            .findContent({
                searchQuery: { label: 'forecast' },
                spaceSlug: null,
                verifiedOnly: false,
            });

        expect(result.content.map(({ uuid }) => uuid)).toEqual(['app-uuid']);
        expect(result.content[0]).toEqual(
            expect.objectContaining({ contentType: 'data_app' }),
        );
    });

    it('returns canonical viewer URLs when listing space content', async () => {
        const contentService = {
            find: vi.fn().mockResolvedValue({
                data: [
                    {
                        contentType: ContentType.DASHBOARD,
                        uuid: 'dashboard-uuid',
                        name: 'Dashboard',
                        slug: 'dashboard',
                    },
                    {
                        contentType: ContentType.CHART,
                        uuid: 'chart-uuid',
                        name: 'Chart',
                        slug: 'chart',
                    },
                    {
                        contentType: ContentType.DATA_APP,
                        uuid: 'app-uuid',
                        name: 'Data app',
                        slug: 'data-app',
                    },
                    {
                        contentType: ContentType.SPACE,
                        uuid: 'child-space-uuid',
                        name: 'Child space',
                        path: 'parent.child',
                        chartCount: 0,
                        dashboardCount: 0,
                        childSpaceCount: 0,
                        appCount: 0,
                        access: [userUuid],
                    },
                ],
                pagination: {
                    page: 1,
                    pageSize: 25,
                    totalResults: 4,
                    totalPageCount: 1,
                },
            }),
        };
        const service = makeService({
            spaceModel: {
                find: vi.fn().mockResolvedValue([{ uuid: 'space-uuid' }]),
            },
            contentService,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        const result = await runtime.listContent({
            spaceSlug: 'parent',
            page: 1,
        });

        expect(
            result.items.map(({ contentType, href }) => ({
                contentType,
                href,
            })),
        ).toEqual([
            {
                contentType: ContentType.DASHBOARD,
                href: `/projects/${projectUuid}/dashboards/dashboard-uuid/view#dashboard-link`,
            },
            {
                contentType: ContentType.CHART,
                href: `/projects/${projectUuid}/saved/chart-uuid/view#chart-link`,
            },
            {
                contentType: ContentType.DATA_APP,
                href: `/projects/${projectUuid}/apps/app-uuid/view`,
            },
            {
                contentType: ContentType.SPACE,
                href: `/projects/${projectUuid}/spaces/child-space-uuid`,
            },
        ]);
    });

    it('blocks unbounded dimension-only scans before warehouse execution', async () => {
        const executeMetricQueryAndGetResults = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        status: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            name: 'status',
                            table: 'orders',
                        },
                    },
                }),
            },
            asyncQueryService: { executeMetricQueryAndGetResults },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ source: 'ai_agent' }),
        );

        await expect(
            runtime.runAsyncQuery({
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customMetrics: null,
            }),
        ).rejects.toThrow('distinct values across an entire field');
        expect(executeMetricQueryAndGetResults).not.toHaveBeenCalled();
    });

    describe('describeWarehouseTable scope', () => {
        it('blocks metadata from an excluded default database', async () => {
            const getWarehouseFields = vi.fn();
            const service = makeService({
                projectModel: {
                    getWarehouseCredentialsForProject: vi
                        .fn()
                        .mockResolvedValue({
                            type: WarehouseTypes.POSTGRES,
                            dbname: 'postgres3',
                            schema: 'jaffle',
                        }),
                },
                projectService: { getWarehouseFields },
            });
            const runtime = service.createRuntime(
                makeRuntimeContext({
                    sqlScope: {
                        schemas: [],
                        deniedCatalogs: ['postgres3'],
                    },
                }),
            );

            await expect(
                runtime.describeWarehouseTable({
                    table: 'customer_order_payments',
                    schema: 'jaffle',
                }),
            ).rejects.toThrow(
                'reads from catalog `postgres3`, which is explicitly excluded',
            );
            expect(getWarehouseFields).not.toHaveBeenCalled();
        });

        it('describes a table in an explicitly allowed database', async () => {
            const getWarehouseFields = vi.fn().mockResolvedValue({
                customer_id: DimensionType.STRING,
            });
            const service = makeService({
                projectService: { getWarehouseFields },
            });
            const runtime = service.createRuntime(
                makeRuntimeContext({
                    sqlScope: {
                        schemas: ['jaffle'],
                        catalogs: ['analytics'],
                    },
                }),
            );

            await expect(
                runtime.describeWarehouseTable({
                    table: 'orders',
                    schema: 'jaffle',
                    database: 'analytics',
                }),
            ).resolves.toEqual({
                columns: [{ name: 'customer_id', type: DimensionType.STRING }],
                resolvedSchema: 'jaffle',
                resolvedDatabase: 'analytics',
            });
            expect(getWarehouseFields).toHaveBeenCalledWith(
                user,
                projectUuid,
                QueryExecutionContext.AI,
                'orders',
                'jaffle',
                'analytics',
            );
        });

        it.each([
            { label: 'empty', database: '' },
            { label: 'whitespace-only', database: '   ' },
        ])(
            'treats a $label optional database as the default database',
            async ({ database }) => {
                const getWarehouseFields = vi.fn().mockResolvedValue({
                    customer_id: DimensionType.STRING,
                });
                const service = makeService({
                    projectModel: {
                        getWarehouseCredentialsForProject: vi
                            .fn()
                            .mockResolvedValue({
                                type: WarehouseTypes.POSTGRES,
                                dbname: 'postgres3',
                                schema: 'jaffle',
                            }),
                    },
                    projectService: { getWarehouseFields },
                });
                const runtime = service.createRuntime(makeRuntimeContext());

                await runtime.describeWarehouseTable({
                    table: 'orders',
                    schema: 'jaffle',
                    database,
                });

                expect(getWarehouseFields).toHaveBeenCalledWith(
                    user,
                    projectUuid,
                    QueryExecutionContext.AI,
                    'orders',
                    'jaffle',
                    'postgres3',
                );
            },
        );

        it('uses the Databricks catalog and schema defaults', async () => {
            const getWarehouseFields = vi.fn().mockResolvedValue({
                customer_id: DimensionType.STRING,
            });
            const service = makeService({
                projectModel: {
                    getWarehouseCredentialsForProject: vi
                        .fn()
                        .mockResolvedValue({
                            type: WarehouseTypes.DATABRICKS,
                            catalog: 'main',
                            database: 'analytics',
                        }),
                },
                projectService: { getWarehouseFields },
            });
            const runtime = service.createRuntime(makeRuntimeContext());

            await runtime.describeWarehouseTable({ table: 'orders' });

            expect(getWarehouseFields).toHaveBeenCalledWith(
                user,
                projectUuid,
                QueryExecutionContext.AI,
                'orders',
                'analytics',
                'main',
            );
        });
    });

    it('extends query result retention when the runtime opts in', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
        const executeMetricQueryAndGetResults = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ value: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const extendQueryResultsExpiration = vi
            .fn()
            .mockResolvedValue(undefined);
        const service = makeService({
            explores: { orders: makeExplore({ name: 'orders' }) },
            asyncQueryService: {
                executeMetricQueryAndGetResults,
                extendQueryResultsExpiration,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({
                queryResultsExpirationMs: 31 * 24 * 60 * 60 * 1_000,
            }),
        );

        await runtime.runAsyncQuery({
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
            additionalMetrics: [],
            customMetrics: null,
        });

        expect(extendQueryResultsExpiration).toHaveBeenCalledWith({
            account,
            projectUuid,
            queryUuid: '11111111-1111-4111-8111-111111111111',
            expiresAt: new Date('2026-08-31T12:00:00.000Z'),
        });
        vi.useRealTimers();
    });

    describe('Deep Research knowledge documents', () => {
        const run = {
            ai_deep_research_run_uuid: 'run-uuid',
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            prompt: 'Why did revenue fall?',
            result_markdown: '# Revenue report',
            content_size_bytes: 16,
            created_at: new Date('2026-07-29T10:00:00.000Z'),
            updated_at: new Date('2026-07-29T10:05:00.000Z'),
        };

        it('lists report-bearing runs as virtual thread documents', async () => {
            const service = makeService({
                aiAgentDocumentModel: {
                    findAllForAgent: vi.fn().mockResolvedValue([]),
                },
                aiDeepResearchRunModel: {
                    findReportSummariesByThreadScoped: vi
                        .fn()
                        .mockResolvedValue([run]),
                },
            });
            const runtime = service.createRuntime(
                makeRuntimeContext({
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                }),
            );

            await expect(runtime.listKnowledgeDocuments()).resolves.toEqual([
                expect.objectContaining({
                    uuid: 'run-uuid',
                    name: 'Why did revenue fall?',
                    mimeType: 'text/markdown',
                    alwaysIncludeInContext: false,
                }),
            ]);
        });

        it('reads report Markdown only from the current user and thread scope', async () => {
            const findReportByUuidThreadScoped = vi.fn().mockResolvedValue(run);
            const service = makeService({
                aiAgentDocumentModel: {
                    getContentForAgent: vi.fn().mockResolvedValue(undefined),
                },
                aiDeepResearchRunModel: {
                    findReportByUuidThreadScoped,
                },
            });
            const runtime = service.createRuntime(
                makeRuntimeContext({
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                }),
            );

            await expect(
                runtime.getKnowledgeDocumentContent({
                    documentUuid: 'run-uuid',
                }),
            ).resolves.toEqual({
                uuid: 'run-uuid',
                name: 'Why did revenue fall?',
                mimeType: 'text/markdown',
                content: '# Revenue report',
            });
            expect(findReportByUuidThreadScoped).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-uuid',
                aiThreadUuid: 'thread-uuid',
                organizationUuid,
                projectUuid,
                createdByUserUuid: userUuid,
            });
        });

        it('rejects runs without an accessible report', async () => {
            const service = makeService({
                aiAgentDocumentModel: {
                    getContentForAgent: vi.fn().mockResolvedValue(undefined),
                },
                aiDeepResearchRunModel: {
                    findReportByUuidThreadScoped: vi
                        .fn()
                        .mockResolvedValue(undefined),
                },
            });
            const runtime = service.createRuntime(
                makeRuntimeContext({
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                }),
            );

            await expect(
                runtime.getKnowledgeDocumentContent({
                    documentUuid: 'missing-run',
                }),
            ).rejects.toThrow(
                'Knowledge document missing-run is not accessible to this agent.',
            );
        });
    });

    it.each(['', 'tru', 'FALSE', 'unknown'])(
        'returns the boolean domain for query "%s"',
        async (query) => {
            const searchFieldUniqueValues = vi.fn();
            const service = makeService({
                explores: {
                    orders: makeExplore({
                        name: 'orders',
                        dimensions: {
                            is_completed: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.BOOLEAN,
                                name: 'is_completed',
                                table: 'orders',
                            },
                        },
                    }),
                },
                searchFieldUniqueValues,
            });
            const runtime = service.createRuntime(makeRuntimeContext());

            await expect(
                runtime.searchFieldValues({
                    table: 'orders',
                    fieldId: 'orders_is_completed',
                    query,
                }),
            ).resolves.toEqual([true, false]);
            expect(searchFieldUniqueValues).not.toHaveBeenCalled();
        },
    );

    it('preserves curated boolean values and labels', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        is_completed: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.BOOLEAN,
                            name: 'is_completed',
                            table: 'orders',
                            filterAutocomplete: {
                                fetchFromWarehouse: false,
                                values: [{ value: 'true', label: 'Yes' }],
                            },
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        await expect(
            runtime.searchFieldValues({
                table: 'orders',
                fieldId: 'orders_is_completed',
                query: 'yes',
            }),
        ).resolves.toEqual(['true']);
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('returns a note with the empty result when there is nothing to autocomplete', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                payments: makeExplore({
                    name: 'payments',
                    dimensions: {
                        payment_method: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            name: 'payment_method',
                            table: 'payments',
                            filterAutocomplete: {
                                fetchFromWarehouse: false,
                            },
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        await expect(
            runtime.searchFieldValues({
                table: 'payments',
                fieldId: 'payments_payment_method',
                query: 'credit',
            }),
        ).resolves.toEqual({
            results: [],
            note: expect.stringContaining('Value suggestions are disabled'),
        });
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('returns curated values without a note when values are configured', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        status: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            name: 'status',
                            table: 'orders',
                            filterAutocomplete: {
                                fetchFromWarehouse: false,
                                values: [
                                    { value: 'shipped' },
                                    { value: 'placed' },
                                ],
                            },
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        await expect(
            runtime.searchFieldValues({
                table: 'orders',
                fieldId: 'orders_status',
                query: 'ship',
            }),
        ).resolves.toEqual(['shipped']);
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('returns the boolean domain without applying warehouse filters', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        is_completed: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.BOOLEAN,
                            name: 'is_completed',
                            table: 'orders',
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        await expect(
            runtime.searchFieldValues({
                table: 'orders',
                fieldId: 'orders_is_completed',
                query: '',
                filters: {
                    dimensions: {
                        id: 'filters',
                        and: [
                            {
                                id: 'is-completed-filter',
                                target: { fieldId: 'orders_is_completed' },
                                operator: FilterOperator.EQUALS,
                                values: [true],
                            },
                        ],
                    },
                },
            }),
        ).resolves.toEqual([true, false]);
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('blocks an unbounded value scan for agent runs even when rollout is off', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        status: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            name: 'status',
                            table: 'orders',
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ source: 'ai_agent' }),
        );

        await expect(
            runtime.searchFieldValues({
                table: 'orders',
                fieldId: 'orders_status',
                query: '',
            }),
        ).rejects.toThrow('full-column scan');
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('filters explores by tags and merged user attribute overrides', async () => {
        const service = makeService({
            userAttributes: { access_level: ['1'] },
            explores: {
                public: makeExplore({ name: 'public', tags: ['ai'] }),
                secure: makeExplore({
                    name: 'secure',
                    tags: ['ai'],
                    requiredAttributes: { access_level: '2' },
                }),
                hidden: makeExplore({ name: 'hidden', tags: ['internal'] }),
            },
        });

        await expect(
            service.getAvailableExplores({
                user,
                projectUuid,
                availableTags: ['ai'],
            }),
        ).resolves.toEqual([expect.objectContaining({ name: 'public' })]);

        await expect(
            service.getAvailableExplores({
                user,
                projectUuid,
                availableTags: ['ai'],
                userAttributeOverrides: { access_level: ['2'] },
            }),
        ).resolves.toEqual([
            expect.objectContaining({ name: 'public' }),
            expect.objectContaining({ name: 'secure' }),
        ]);
    });

    it('filters explore fields by tags', async () => {
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        visible_dimension: { tags: ['ai'] },
                        hidden_dimension: { tags: ['internal'] },
                    },
                    metrics: {
                        visible_metric: { tags: ['ai'] },
                        hidden_metric: { tags: ['internal'] },
                    },
                }),
            },
        });

        const [explore] = await service.getAvailableExplores({
            user,
            projectUuid,
            availableTags: ['ai'],
        });

        expect(Object.keys(explore.tables.orders.dimensions)).toEqual([
            'visible_dimension',
        ]);
        expect(Object.keys(explore.tables.orders.metrics)).toEqual([
            'visible_metric',
        ]);
    });

    it('adds verified field usage for AI runtime searches but not MCP searches', async () => {
        const searchCatalog = vi.fn(async ({ catalogSearch }) => ({
            data:
                catalogSearch.type === CatalogType.Table
                    ? [
                          {
                              type: CatalogType.Table,
                              name: 'orders',
                              label: 'Orders',
                              description: null,
                              aiHints: null,
                              searchRank: 1,
                              joinedTables: [],
                          },
                      ]
                    : [
                          {
                              type: CatalogType.Field,
                              name: 'orders_count',
                              label: 'Orders Count',
                              tableName: 'orders',
                              fieldType: 'metric',
                              searchRank: 1,
                              description: null,
                              chartUsage: 3,
                          },
                      ],
            pagination: undefined,
        }));
        const service = makeService({
            explores: { orders: makeExplore({ name: 'orders' }) },
            searchCatalog,
            verifiedFieldUsage: new Map([['orders_orders_count::metric', 7]]),
        });

        const aiRuntime = service.createRuntime(makeRuntimeContext());
        const mcpRuntime = service.createRuntime(
            makeRuntimeContext({
                source: 'mcp',
                catalogSearchContext: CatalogSearchContext.MCP,
                defaultQueryExecutionContext:
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            }),
        );

        await expect(
            aiRuntime.findExplores({
                fieldSearchSize: 50,
                searchQuery: 'orders',
            }),
        ).resolves.toMatchObject({
            topMatchingFields: [
                expect.objectContaining({ verifiedChartUsage: 7 }),
            ],
        });

        const mcpResults = await mcpRuntime.findExplores({
            fieldSearchSize: 50,
            searchQuery: 'orders',
        });
        expect(mcpResults.status).toBe('success');
        if (mcpResults.status === 'success') {
            expect(mcpResults.data.topMatchingFields?.[0]).not.toHaveProperty(
                'verifiedChartUsage',
            );
        }
    });

    it('returns MCP runtime errors from findExplores instead of throwing', async () => {
        const service = makeService({
            explores: { orders: makeExplore({ name: 'orders' }) },
            searchCatalog: vi
                .fn()
                .mockRejectedValue(new Error('Catalog failed')),
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({
                source: 'mcp',
                catalogSearchContext: CatalogSearchContext.MCP,
                defaultQueryExecutionContext:
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            }),
        );

        const result = await runtime.findExplores({
            fieldSearchSize: 50,
            searchQuery: 'orders',
        });

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            throw new Error('Expected explore search to fail');
        }
        expect(result.error).toEqual(new Error('Catalog failed'));
    });

    it('returns MCP runtime errors from getExplore instead of throwing', async () => {
        const service = makeService();
        const runtime = service.createRuntime(
            makeRuntimeContext({
                source: 'mcp',
                catalogSearchContext: CatalogSearchContext.MCP,
                defaultQueryExecutionContext:
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            }),
        );

        const result = await runtime.getExplore({ table: 'orders' });

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            throw new Error('Expected explore lookup to fail');
        }
        expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it('returns MCP runtime per-query errors from findFields instead of throwing', async () => {
        const service = makeService({
            explores: { orders: makeExplore({ name: 'orders' }) },
            searchCatalog: vi
                .fn()
                .mockRejectedValue(new Error('Catalog failed')),
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({
                source: 'mcp',
                catalogSearchContext: CatalogSearchContext.MCP,
                defaultQueryExecutionContext:
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            }),
        );
        const exploreResult = await runtime.getExplore({ table: 'orders' });
        expect(exploreResult.status).toBe('success');
        if (exploreResult.status !== 'success') {
            throw new Error('Expected explore lookup to succeed');
        }

        const result = await runtime.findFields({
            table: 'orders',
            fieldSearchQueries: [{ label: 'orders count' }],
            page: 1,
            pageSize: 15,
            explore: exploreResult.data,
        });

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            throw new Error('Expected field search to return partial results');
        }
        expect(result.data).toEqual([
            {
                status: 'error',
                searchQuery: 'orders count',
                error: 'Catalog failed',
            },
        ]);
    });

    it('adds required filters to AI runtime explore search metadata only', async () => {
        const requiredFilters = [
            {
                id: 'required-created-date',
                target: { fieldRef: 'created_date' },
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days },
                required: true,
            },
        ];
        const searchCatalog = vi.fn(
            async ({
                catalogSearch,
            }: {
                catalogSearch: { type: CatalogType };
            }) => ({
                data:
                    catalogSearch.type === CatalogType.Table
                        ? [
                              {
                                  type: CatalogType.Table,
                                  name: 'orders',
                                  label: 'Orders',
                                  description: null,
                                  aiHints: null,
                                  searchRank: 1,
                                  joinedTables: [],
                              },
                          ]
                        : [
                              {
                                  type: CatalogType.Field,
                                  name: 'created_date',
                                  label: 'Created Date',
                                  tableName: 'orders',
                                  fieldType: 'dimension',
                                  searchRank: 1,
                                  description: null,
                                  chartUsage: 3,
                              },
                          ],
                pagination: undefined,
            }),
        );
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    requiredFilters,
                }),
            },
            searchCatalog,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        const results = await runtime.findExplores({
            fieldSearchSize: 50,
            searchQuery: 'orders',
        });

        expect(results).toMatchObject({
            exploreSearchResults: [
                expect.objectContaining({
                    requiredFilters: [
                        {
                            fieldId: 'orders_created_date',
                            fieldRef: 'created_date',
                            tableName: 'orders',
                            operator: FilterOperator.IN_THE_PAST,
                            values: [30],
                            settings: { unitOfTime: UnitOfTime.days },
                            required: true,
                        },
                    ],
                }),
            ],
        });
        expect(results.topMatchingFields?.[0]).not.toHaveProperty(
            'requiredFilter',
        );
    });

    const denySpaceAccessModel = () => ({
        hasSpaceWithPathAndUuids: vi.fn().mockResolvedValue(false),
    });

    const makeDashboardContent = (spaceSlug: string) => ({
        slug: 'test-dashboard',
        name: 'Test dashboard',
        description: 'Test dashboard',
        spaceSlug,
        version: 1,
        verified: false,
        verification: null,
        tiles: [],
        tabs: [],
        filters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
    });

    it('does not search MCP field values when the field is outside the scoped explore', async () => {
        const searchFieldUniqueValues = vi.fn();
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        status: {
                            name: 'status',
                            table: 'orders',
                            type: 'string',
                        },
                    },
                }),
            },
            searchFieldUniqueValues,
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({
                source: 'mcp',
                catalogSearchContext: CatalogSearchContext.MCP,
                defaultQueryExecutionContext:
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            }),
        );

        await expect(
            runtime.searchFieldValues({
                table: 'orders',
                fieldId: 'orders_hidden',
                query: 'x',
            }),
        ).rejects.toThrow(NotFoundError);
        expect(searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('does not read content outside the scoped agent spaces', async () => {
        const dashboardService = { getByIdOrSlug: vi.fn() };
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            dashboardService,
            coderService: {
                getDashboardsForRead: vi.fn().mockResolvedValue({
                    dashboards: [makeDashboardContent('blocked-space')],
                }),
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.readContent({ slug: 'test-dashboard', type: 'dashboard' }),
        ).rejects.toThrow(NotFoundError);
        expect(dashboardService.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it('does not fetch dashboard charts outside the scoped agent spaces', async () => {
        const getDashboardCharts = vi.fn();
        const service = makeService({
            dashboardService: {
                getByIdOrSlug: vi.fn().mockResolvedValue({
                    spaceUuid: 'blocked-space-uuid',
                }),
                getDashboardCharts,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.getDashboardCharts({
                dashboardUuid: 'blocked-dashboard-uuid',
                page: 1,
                pageSize: 20,
            }),
        ).rejects.toThrow(NotFoundError);
        expect(getDashboardCharts).not.toHaveBeenCalled();
    });

    it('fetches dashboard charts inside the scoped agent spaces', async () => {
        const getDashboardCharts = vi.fn().mockResolvedValue({
            dashboardName: 'Allowed Dashboard',
            charts: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 0,
                totalPageCount: 0,
            },
        });
        const service = makeService({
            dashboardService: {
                getByIdOrSlug: vi.fn().mockResolvedValue({
                    spaceUuid: 'allowed-space-uuid',
                }),
                getDashboardCharts,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.getDashboardCharts({
                dashboardUuid: 'allowed-dashboard-uuid',
                page: 1,
                pageSize: 20,
            }),
        ).resolves.toEqual({
            dashboardName: 'Allowed Dashboard',
            charts: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 0,
                totalPageCount: 0,
            },
        });
        expect(getDashboardCharts).toHaveBeenCalledWith(
            user,
            projectUuid,
            'allowed-dashboard-uuid',
            1,
            20,
        );
    });

    it('does not run saved chart queries outside the scoped agent spaces', async () => {
        const executeSavedChartQueryAndGetResults = vi.fn();
        const service = makeService({
            savedChartService: {
                get: vi.fn().mockResolvedValue({
                    spaceUuid: 'blocked-space-uuid',
                }),
            },
            asyncQueryService: {
                executeSavedChartQueryAndGetResults,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.runSavedChartQuery({
                chartUuid: 'blocked-chart-uuid',
                dashboardSlug: null,
                limit: 100,
            }),
        ).rejects.toThrow(NotFoundError);
        expect(executeSavedChartQueryAndGetResults).not.toHaveBeenCalled();
    });

    it('does not return saved charts outside the scoped agent spaces', async () => {
        const get = vi.fn().mockResolvedValue({
            uuid: 'blocked-chart-uuid',
            spaceUuid: 'blocked-space-uuid',
        });
        const service = makeService({
            savedChartService: { get },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.getSavedChart('blocked-chart-uuid'),
        ).rejects.toThrow(NotFoundError);
    });

    it('returns saved charts inside the scoped agent spaces', async () => {
        const savedChart = {
            uuid: 'allowed-chart-uuid',
            spaceUuid: 'allowed-space-uuid',
        };
        const get = vi.fn().mockResolvedValue(savedChart);
        const service = makeService({
            savedChartService: { get },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(runtime.getSavedChart('allowed-chart-uuid')).resolves.toBe(
            savedChart,
        );
    });

    it('runs saved chart queries inside the scoped agent spaces', async () => {
        const executeSavedChartQueryAndGetResults = vi
            .fn()
            .mockResolvedValue({ rows: [] });
        const service = makeService({
            savedChartService: {
                get: vi.fn().mockResolvedValue({
                    spaceUuid: 'allowed-space-uuid',
                }),
            },
            asyncQueryService: {
                executeSavedChartQueryAndGetResults,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.runSavedChartQuery({
                chartUuid: 'allowed-chart-uuid',
                dashboardSlug: null,
                limit: 100,
            }),
        ).resolves.toEqual({ rows: [] });
        expect(executeSavedChartQueryAndGetResults).toHaveBeenCalledWith({
            account,
            projectUuid,
            chartUuid: 'allowed-chart-uuid',
            limit: 100,
            context: QueryExecutionContext.AI,
        });
    });

    it('checks the warehouse budget at the saved-chart query boundary', async () => {
        const executeSavedChartQueryAndGetResults = vi.fn();
        const onWarehouseQuery = vi
            .fn()
            .mockRejectedValue(
                new Error('Deep Research exceeded its warehouse-query budget'),
            );
        const service = makeService({
            savedChartService: {
                get: vi.fn().mockResolvedValue({
                    spaceUuid: 'allowed-space-uuid',
                }),
            },
            asyncQueryService: {
                executeSavedChartQueryAndGetResults,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({
                spaceAccess: ['allowed-space-uuid'],
                onWarehouseQuery,
            }),
        );

        await expect(
            runtime.runSavedChartQuery({
                chartUuid: 'allowed-chart-uuid',
                dashboardSlug: null,
                limit: 100,
            }),
        ).rejects.toThrow('Deep Research exceeded its warehouse-query budget');
        expect(onWarehouseQuery).toHaveBeenCalledOnce();
        expect(executeSavedChartQueryAndGetResults).not.toHaveBeenCalled();
    });

    it('does not run dashboard chart queries outside the scoped agent spaces', async () => {
        const executeDashboardChartQueryAndGetResults = vi.fn();
        const service = makeService({
            dashboardService: {
                getByIdOrSlug: vi.fn().mockResolvedValue({
                    spaceUuid: 'blocked-space-uuid',
                    tiles: [],
                }),
            },
            asyncQueryService: {
                executeDashboardChartQueryAndGetResults,
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.runSavedChartQuery({
                chartUuid: 'blocked-chart-uuid',
                dashboardSlug: 'blocked-dashboard',
                limit: 100,
            }),
        ).rejects.toThrow(NotFoundError);
        expect(executeDashboardChartQueryAndGetResults).not.toHaveBeenCalled();
    });

    it('does not create content outside the scoped agent spaces', async () => {
        const upsertDashboard = vi.fn();
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            coderService: { upsertDashboard },
            aiAgentContentValidation: { validateContent: vi.fn() },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.createContent({
                type: 'dashboard',
                content: makeDashboardContent('blocked-space'),
            }),
        ).rejects.toThrow(NotFoundError);
        expect(upsertDashboard).not.toHaveBeenCalled();
    });

    it('does not edit content into a space outside the scoped agent spaces', async () => {
        const upsertDashboard = vi.fn();
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            dashboardService: {
                getByIdOrSlug: vi
                    .fn()
                    .mockResolvedValue({ uuid: 'dashboard-uuid' }),
            },
            coderService: {
                getDashboardsForRead: vi.fn().mockResolvedValue({
                    dashboards: [makeDashboardContent('allowed-space')],
                }),
                getCurrentContentVersionBySlug: vi.fn().mockResolvedValue({
                    versionUuid: 'version-before',
                }),
                upsertDashboard,
            },
            aiAgentContentValidation: {
                validatePatch: vi.fn(),
                validateContent: vi.fn(),
            },
        });
        const runtime = service.createRuntime(
            makeRuntimeContext({ spaceAccess: ['allowed-space-uuid'] }),
        );

        await expect(
            runtime.editContent({
                slug: 'test-dashboard',
                type: 'dashboard',
                patch: [
                    {
                        op: 'replace',
                        path: '/spaceSlug',
                        value: 'blocked-space',
                    },
                ],
            }),
        ).rejects.toThrow(NotFoundError);
        expect(upsertDashboard).not.toHaveBeenCalled();
    });

    // Charts (commonly table charts) can be stored with a null chartConfig.config.
    // The chart-as-code schema rejects null, so without normalization any patch —
    // even one that never touches config — fails validation. This exercises the
    // real validator to guard the null -> absent normalization in editContent.
    const makeChartContent = (config: unknown) => ({
        name: 'Null config table chart',
        description: 'Original description',
        tableName: 'orders',
        slug: 'null-config-chart',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: 'table', config },
        tableConfig: { columnOrder: [] },
        spaceSlug: 'allowed-space',
        dashboardSlug: null,
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
    });

    it('edits a chart whose stored chartConfig.config is null', async () => {
        const upsertChart = vi.fn().mockResolvedValue({
            charts: [{ data: { uuid: 'chart-uuid' } }],
        });
        const service = makeService({
            savedChartService: {
                get: vi.fn().mockResolvedValue({ uuid: 'chart-uuid' }),
            },
            coderService: {
                getChartsForRead: vi
                    .fn()
                    .mockResolvedValue({ charts: [makeChartContent(null)] }),
                getCurrentContentVersionBySlug: vi
                    .fn()
                    .mockResolvedValue({ versionUuid: 'version' }),
                upsertChart,
            },
            // Use the real validator so the null-config normalization is exercised.
            aiAgentContentValidation:
                new AiAgentContentValidation() as unknown as Record<
                    string,
                    unknown
                >,
        });
        const runtime = service.createRuntime(makeRuntimeContext());

        await expect(
            runtime.editContent({
                slug: 'null-config-chart',
                type: 'chart',
                patch: [
                    {
                        op: 'replace',
                        path: '/description',
                        value: 'Updated description',
                    },
                ],
            }),
        ).resolves.toBeDefined();
    });

    describe('syncDbtProject', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns success when the compile job reaches DONE without polling', async () => {
            const scheduleCompileProject = vi
                .fn()
                .mockResolvedValue({ jobUuid: 'job-done' });
            const get = vi.fn().mockResolvedValue({
                jobStatus: JobStatusType.DONE,
                steps: [],
            });
            const service = makeService({
                scheduleCompileProject,
                jobModel: { get },
            });

            const result = await service
                .createRuntime(makeRuntimeContext())
                .syncDbtProject({ reason: 'picking up net_revenue' });

            expect(scheduleCompileProject).toHaveBeenCalledWith(
                user,
                projectUuid,
                RequestMethod.BACKEND,
            );
            expect(get).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                status: 'success',
                jobUuid: 'job-done',
                message:
                    'The dbt project compiled successfully and is now up to date.',
            });
        });

        it('returns error with joined step errors when the compile fails', async () => {
            const get = vi.fn().mockResolvedValue({
                jobStatus: JobStatusType.ERROR,
                steps: [
                    { stepError: 'dbt compile failed: model x' },
                    { stepError: null },
                    { stepError: 'ref not found' },
                ],
            });
            const service = makeService({
                scheduleCompileProject: vi
                    .fn()
                    .mockResolvedValue({ jobUuid: 'job-err' }),
                jobModel: { get },
            });

            const result = await service
                .createRuntime(makeRuntimeContext())
                .syncDbtProject({ reason: null });

            expect(result).toEqual({
                status: 'error',
                jobUuid: 'job-err',
                message:
                    'The dbt project sync failed: dbt compile failed: model x; ref not found',
            });
        });

        it('falls back to a generic error message when there are no step errors', async () => {
            const get = vi.fn().mockResolvedValue({
                jobStatus: JobStatusType.ERROR,
                steps: [],
            });
            const service = makeService({
                scheduleCompileProject: vi
                    .fn()
                    .mockResolvedValue({ jobUuid: 'job-err2' }),
                jobModel: { get },
            });

            const result = await service
                .createRuntime(makeRuntimeContext())
                .syncDbtProject({ reason: null });

            expect(result).toEqual({
                status: 'error',
                jobUuid: 'job-err2',
                message: 'The dbt project sync failed during compilation.',
            });
        });

        it('polls while the job is RUNNING and returns success once it is DONE', async () => {
            vi.useFakeTimers();
            try {
                const get = vi
                    .fn()
                    .mockResolvedValueOnce({
                        jobStatus: JobStatusType.RUNNING,
                        steps: [],
                    })
                    .mockResolvedValueOnce({
                        jobStatus: JobStatusType.RUNNING,
                        steps: [],
                    })
                    .mockResolvedValue({
                        jobStatus: JobStatusType.DONE,
                        steps: [],
                    });
                const service = makeService({
                    scheduleCompileProject: vi
                        .fn()
                        .mockResolvedValue({ jobUuid: 'job-poll' }),
                    jobModel: { get },
                });

                const promise = service
                    .createRuntime(makeRuntimeContext())
                    .syncDbtProject({ reason: null });
                await vi.advanceTimersByTimeAsync(6_000);
                const result = await promise;

                expect(get.mock.calls.length).toBeGreaterThan(1);
                expect(result.status).toBe('success');
                expect(result.jobUuid).toBe('job-poll');
            } finally {
                vi.useRealTimers();
            }
        });

        it('returns in_progress when the job is still running at the deadline', async () => {
            vi.useFakeTimers();
            try {
                const get = vi.fn().mockResolvedValue({
                    jobStatus: JobStatusType.RUNNING,
                    steps: [],
                });
                const service = makeService({
                    scheduleCompileProject: vi
                        .fn()
                        .mockResolvedValue({ jobUuid: 'job-running' }),
                    jobModel: { get },
                });

                const promise = service
                    .createRuntime(makeRuntimeContext())
                    .syncDbtProject({ reason: null });
                // Advance past the 90s deadline; the loop polls every 2s but
                // never sees a terminal status, so it must time out.
                await vi.advanceTimersByTimeAsync(90_000);
                const result = await promise;

                expect(result).toEqual({
                    status: 'in_progress',
                    jobUuid: 'job-running',
                    message:
                        'The dbt project is still syncing — the compile has not finished yet.',
                });
            } finally {
                vi.useRealTimers();
            }
        });

        it('propagates a ForbiddenError from scheduleCompileProject without polling', async () => {
            const get = vi.fn();
            const service = makeService({
                scheduleCompileProject: vi
                    .fn()
                    .mockRejectedValue(new ForbiddenError()),
                jobModel: { get },
            });

            await expect(
                service
                    .createRuntime(makeRuntimeContext())
                    .syncDbtProject({ reason: null }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(get).not.toHaveBeenCalled();
        });
    });
});

describe('AiAgentToolsService runComposerQueries', () => {
    const composerQueries = [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total'],
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'joined',
            sql: 'SELECT * FROM orders',
            references: ['orders'],
        },
    ] as SourceQuery[];

    const submissions = [
        {
            nodeId: 'orders',
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            queryUuid: 'query-1',
        },
        {
            nodeId: 'joined',
            sourceType: QuerySourceType.DUCKDB,
            queryUuid: 'query-2',
        },
    ];

    const readyResults = {
        status: QueryHistoryStatus.READY,
        rows: [{ orders_total: { value: { raw: 42, formatted: '42' } } }],
        columns: {
            orders_total: {
                reference: 'orders_total',
                type: DimensionType.NUMBER,
            },
        },
    };

    it('submits the pipeline with the AI context and returns the terminal snapshot', async () => {
        const executeSourceQueries = vi
            .fn()
            .mockResolvedValue({ queries: submissions });
        const getAsyncQueryResults = vi.fn().mockResolvedValue(readyResults);
        const service = makeService({
            querySourceService: { executeSourceQueries },
            asyncQueryService: { getAsyncQueryResults },
        });

        const result = await service
            .createRuntime(makeRuntimeContext())
            .runComposerQueries({
                queries: composerQueries,
                terminalNodeId: 'joined',
            });

        expect(executeSourceQueries).toHaveBeenCalledWith({
            account,
            projectUuid,
            queries: composerQueries,
            context: QueryExecutionContext.AI,
            parameters: {},
            userAttributeOverrides: {},
            invalidateCache: false,
        });
        expect(getAsyncQueryResults).toHaveBeenCalledWith(
            expect.objectContaining({ queryUuid: 'query-2', page: 1 }),
        );
        expect(result.submissions).toEqual(submissions);
        expect(result.terminal).toEqual({
            queryUuid: 'query-2',
            columns: readyResults.columns,
            rows: [{ orders_total: 42 }],
            rowCount: 1,
        });
    });

    it('carries the runtime user attribute overrides into the pipeline', async () => {
        const executeSourceQueries = vi
            .fn()
            .mockResolvedValue({ queries: submissions });
        const getAsyncQueryResults = vi.fn().mockResolvedValue(readyResults);
        const service = makeService({
            querySourceService: { executeSourceQueries },
            asyncQueryService: { getAsyncQueryResults },
        });

        await service
            .createRuntime(
                makeRuntimeContext({
                    userAttributeOverrides: { tenant: ['acme'] },
                }),
            )
            .runComposerQueries({
                queries: composerQueries,
                terminalNodeId: 'joined',
            });

        expect(executeSourceQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                userAttributeOverrides: { tenant: ['acme'] },
            }),
        );
    });

    it('emits per-node status transitions while the pipeline executes', async () => {
        vi.useFakeTimers();
        try {
            const executeSourceQueries = vi
                .fn()
                .mockResolvedValue({ queries: submissions });
            const getAsyncQueryResults = vi
                .fn()
                .mockResolvedValueOnce({ status: QueryHistoryStatus.EXECUTING })
                .mockResolvedValue(readyResults);
            // While the terminal is still running, the upstream node has
            // already finished.
            const getSourceQueryStatuses = vi.fn().mockResolvedValue({
                statuses: [
                    {
                        queryUuid: 'query-1',
                        status: QueryHistoryStatus.READY,
                        error: null,
                    },
                    {
                        queryUuid: 'query-2',
                        status: QueryHistoryStatus.EXECUTING,
                        error: null,
                    },
                ],
            });
            const service = makeService({
                querySourceService: {
                    executeSourceQueries,
                    getSourceQueryStatuses,
                },
                asyncQueryService: { getAsyncQueryResults },
            });

            const onNodeStatus = vi.fn();
            const promise = service
                .createRuntime(makeRuntimeContext())
                .runComposerQueries({
                    queries: composerQueries,
                    terminalNodeId: 'joined',
                    onNodeStatus,
                });
            await vi.advanceTimersByTimeAsync(2_000);
            await promise;

            expect(onNodeStatus.mock.calls.map(([update]) => update)).toEqual([
                {
                    nodeId: 'orders',
                    queryUuid: 'query-1',
                    status: 'running',
                    errorMessage: null,
                },
                {
                    nodeId: 'joined',
                    queryUuid: 'query-2',
                    status: 'running',
                    errorMessage: null,
                },
                {
                    nodeId: 'orders',
                    queryUuid: 'query-1',
                    status: 'success',
                    errorMessage: null,
                },
                {
                    nodeId: 'joined',
                    queryUuid: 'query-2',
                    status: 'success',
                    errorMessage: null,
                },
            ]);
            // Only the still-pending nodes are batch-polled.
            expect(getSourceQueryStatuses).toHaveBeenCalledWith(
                account,
                projectUuid,
                ['query-1', 'query-2'],
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('emits error statuses for failing nodes before throwing', async () => {
        const executeSourceQueries = vi
            .fn()
            .mockResolvedValue({ queries: submissions });
        const getAsyncQueryResults = vi.fn().mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            error: 'referenced query failed',
        });
        const getSourceQueryStatuses = vi.fn().mockResolvedValue({
            statuses: [
                {
                    queryUuid: 'query-1',
                    status: QueryHistoryStatus.ERROR,
                    error: 'relation does not exist',
                },
                {
                    queryUuid: 'query-2',
                    status: QueryHistoryStatus.ERROR,
                    error: 'referenced query failed',
                },
            ],
        });
        const service = makeService({
            querySourceService: {
                executeSourceQueries,
                getSourceQueryStatuses,
            },
            asyncQueryService: { getAsyncQueryResults },
        });

        const onNodeStatus = vi.fn();
        await expect(
            service.createRuntime(makeRuntimeContext()).runComposerQueries({
                queries: composerQueries,
                terminalNodeId: 'joined',
                onNodeStatus,
            }),
        ).rejects.toThrow(/"orders" \(relation does not exist\)/);

        expect(onNodeStatus.mock.calls.map(([update]) => update)).toEqual([
            {
                nodeId: 'orders',
                queryUuid: 'query-1',
                status: 'running',
                errorMessage: null,
            },
            {
                nodeId: 'joined',
                queryUuid: 'query-2',
                status: 'running',
                errorMessage: null,
            },
            {
                nodeId: 'orders',
                queryUuid: 'query-1',
                status: 'error',
                errorMessage: 'relation does not exist',
            },
            {
                nodeId: 'joined',
                queryUuid: 'query-2',
                status: 'error',
                errorMessage: 'referenced query failed',
            },
        ]);
    });

    it('rejects a terminal node that was not part of the submission', async () => {
        const executeSourceQueries = vi
            .fn()
            .mockResolvedValue({ queries: submissions });
        const service = makeService({
            querySourceService: { executeSourceQueries },
        });

        await expect(
            service.createRuntime(makeRuntimeContext()).runComposerQueries({
                queries: composerQueries,
                terminalNodeId: 'unknown_node',
            }),
        ).rejects.toThrow('unknown_node');
    });

    it('names the failing node when the terminal query errors', async () => {
        const executeSourceQueries = vi
            .fn()
            .mockResolvedValue({ queries: submissions });
        const getAsyncQueryResults = vi.fn().mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            error: 'referenced query failed',
        });
        const getSourceQueryStatuses = vi.fn().mockResolvedValue({
            statuses: [
                {
                    queryUuid: 'query-1',
                    status: QueryHistoryStatus.ERROR,
                    error: 'relation does not exist',
                },
                {
                    queryUuid: 'query-2',
                    status: QueryHistoryStatus.ERROR,
                    error: 'referenced query failed',
                },
            ],
        });
        const service = makeService({
            querySourceService: {
                executeSourceQueries,
                getSourceQueryStatuses,
            },
            asyncQueryService: { getAsyncQueryResults },
        });

        await expect(
            service.createRuntime(makeRuntimeContext()).runComposerQueries({
                queries: composerQueries,
                terminalNodeId: 'joined',
            }),
        ).rejects.toThrow(/"orders" \(relation does not exist\)/);
    });
});

describe('AiAgentToolsService readContent data_app', () => {
    const dataReferences: PersistedDataAppDataReferences = {
        references: [
            {
                kind: 'query',
                explore: 'orders',
                dimensions: ['orders_region'],
                metrics: ['orders_revenue'],
                dimensionFilterFields: ['orders_date'],
                metricFilterFields: [],
                sortFields: ['orders_revenue'],
                parameterKeys: ['region'],
                localFields: [],
                customSql: {
                    tableCalculations: ['SUM(${orders.revenue}) / 2'],
                    customDimensions: [],
                    additionalMetrics: [],
                },
                unresolved: [],
                location,
            },
            {
                kind: 'query',
                explore: 'customers',
                dimensions: ['customers_segment'],
                metrics: ['customers_count'],
                dimensionFilterFields: [],
                metricFilterFields: [],
                sortFields: [],
                parameterKeys: [],
                localFields: [],
                unresolved: ['filters'],
                location,
            },
            {
                kind: 'savedChart',
                chartUuid: 'chart-1',
                filterFields: ['orders_date'],
                unresolved: [],
                location,
            },
            {
                kind: 'externalFetch',
                alias: 'crm',
                path: '/accounts',
                unresolved: [],
                location,
            },
        ],
        parseErrors: [],
        stats: {
            callSites: 4,
            fullyResolved: 3,
            partiallyResolved: 1,
            unresolved: 0,
        },
    };

    const makeReadSource = (
        overrides: Partial<DataAppReadSource> = {},
    ): DataAppReadSource => ({
        app: {
            uuid: 'app-uuid',
            slug: 'sales-forecast',
            name: 'Sales forecast',
            description: 'Forecast revenue by region',
            template: 'dashboard',
            spaceUuid: 'sales-space-uuid',
        },
        spaceSlug: 'sales',
        externalConnections: [{ alias: 'crm', connectionSlug: 'hubspot' }],
        vizSchema: null,
        version: 3,
        versionCount: 4,
        newerVersion: { version: 4, status: 'building' },
        createdBy: { userUuid, firstName: 'Ada', lastName: 'Lovelace' },
        resources: {
            images: [{ imageId: 'image-1' }],
            files: [
                {
                    fileId: 'file-1',
                    filename: 'brief.pdf',
                    mimeType: 'application/pdf',
                },
            ],
            charts: [
                {
                    chartUuid: 'chart-1',
                    chartName: 'Revenue by month',
                    chartKind: 'line',
                    linkLive: true,
                },
                {
                    chartUuid: 'deleted-chart',
                    chartName: 'Deleted chart',
                    chartKind: null,
                },
            ],
            externalConnections: [
                {
                    externalConnectionUuid: 'connection-1',
                    name: 'HubSpot',
                    alias: 'crm',
                },
            ],
            dashboardName: 'Sales overview',
            dashboardUuid: 'dashboard-1',
            clarifications: [
                { question: 'Which region first?', answer: 'EMEA' },
            ],
        },
        dataReferences,
        ...overrides,
    });

    const makeReadService = ({
        source = makeReadSource(),
        spaceModel,
    }: {
        source?: DataAppReadSource;
        spaceModel?: Record<string, unknown>;
    } = {}) => {
        const appGenerateService = {
            readDataApp: vi.fn().mockResolvedValue(source),
        };
        const savedChartModel = {
            getSlugsByUuids: vi
                .fn()
                .mockResolvedValue({ 'chart-1': 'revenue-by-month' }),
        };
        const dashboardModel = {
            getSlugsForUuids: vi
                .fn()
                .mockResolvedValue({ 'dashboard-1': 'sales-overview' }),
        };
        const service = makeService({
            appGenerateService,
            savedChartModel,
            dashboardModel,
            spaceModel,
        });
        return { service, appGenerateService, savedChartModel };
    };

    it('reads the latest ready version as a code-free manifest-shaped view', async () => {
        const { service, appGenerateService, savedChartModel } =
            makeReadService();

        const result = await service
            .createRuntime(makeRuntimeContext())
            .readContent({ slug: 'sales-forecast', type: 'data_app' });

        expect(appGenerateService.readDataApp).toHaveBeenCalledWith(
            user,
            projectUuid,
            'sales-forecast',
        );
        expect(result).toEqual({
            type: 'data_app',
            href: '/projects/project-uuid/apps/app-uuid/view',
            content: {
                slug: 'sales-forecast',
                name: 'Sales forecast',
                description: 'Forecast revenue by region',
                template: 'dashboard',
                version: 3,
                spaceSlug: 'sales',
                externalConnections: [
                    { alias: 'crm', connectionSlug: 'hubspot' },
                ],
                vizSchema: null,
                createdBy: {
                    userUuid,
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                },
                versionCount: 4,
                newerVersion: { version: 4, status: 'building' },
                context: {
                    charts: [
                        {
                            slug: 'revenue-by-month',
                            name: 'Revenue by month',
                            kind: 'line',
                            linkLive: true,
                        },
                    ],
                    dashboard: {
                        slug: 'sales-overview',
                        name: 'Sales overview',
                    },
                    files: ['brief.pdf'],
                    imageCount: 1,
                    externalConnectionAliases: ['crm'],
                },
                dataReferences: {
                    explores: [
                        {
                            name: 'orders',
                            dimensions: ['orders_region'],
                            metrics: ['orders_revenue'],
                            filterFields: ['orders_date'],
                            sortFields: ['orders_revenue'],
                            parameterKeys: ['region'],
                            localFields: [],
                            customSqlFieldCount: 1,
                        },
                        {
                            name: 'customers',
                            dimensions: ['customers_segment'],
                            metrics: ['customers_count'],
                            filterFields: [],
                            sortFields: [],
                            parameterKeys: [],
                            localFields: [],
                            customSqlFieldCount: 0,
                        },
                    ],
                    linkedCharts: [
                        {
                            slug: 'revenue-by-month',
                            filterFields: ['orders_date'],
                        },
                    ],
                    externalConnections: [
                        { alias: 'crm', paths: ['/accounts'] },
                    ],
                    stats: dataReferences.stats,
                    unresolved: ['filters'],
                },
            },
        });
        // One batched lookup covers context charts and linked chart references.
        expect(savedChartModel.getSlugsByUuids).toHaveBeenCalledTimes(1);
        expect(savedChartModel.getSlugsByUuids).toHaveBeenCalledWith([
            'chart-1',
            'deleted-chart',
        ]);
        const serialized = JSON.stringify(result.content);
        expect(serialized).not.toContain('Which region first?');
        expect(serialized).not.toContain('SUM(');
        expect(serialized).not.toContain('src/App.tsx');
    });

    it('includes the viz schema of a project chart type', async () => {
        const vizSchema: DataAppVizSchema = {
            fields: [],
            configOptions: [],
            colorPalette: null,
        };
        const { service } = makeReadService({
            source: makeReadSource({
                app: {
                    uuid: 'viz-uuid',
                    slug: 'funnel-viz',
                    name: 'Funnel',
                    description: '',
                    template: 'data_app_viz',
                    spaceUuid: null,
                },
                spaceSlug: null,
                vizSchema,
                resources: null,
                dataReferences: null,
            }),
        });

        const result = await service
            .createRuntime(makeRuntimeContext())
            .readContent({ slug: 'funnel-viz', type: 'data_app' });

        expect(result.type).toBe('data_app');
        if (result.type !== 'data_app') return;
        expect(result.content.vizSchema).toEqual(vizSchema);
        expect(result.content.spaceSlug).toBeNull();
        expect(result.content.dataReferences).toBeNull();
        expect(result.content.context).toEqual({
            charts: [],
            dashboard: null,
            files: [],
            imageCount: 0,
            externalConnectionAliases: [],
        });
    });

    it('hides personal apps from space-scoped agents', async () => {
        const personal = makeReadSource({
            app: { ...makeReadSource().app, spaceUuid: null },
            spaceSlug: null,
        });
        const { service } = makeReadService({ source: personal });

        await expect(
            service
                .createRuntime(
                    makeRuntimeContext({ spaceAccess: ['sales-space-uuid'] }),
                )
                .readContent({ slug: 'sales-forecast', type: 'data_app' }),
        ).rejects.toThrow(NotFoundError);

        const unrestricted = await service
            .createRuntime(makeRuntimeContext())
            .readContent({ slug: 'sales-forecast', type: 'data_app' });
        expect(unrestricted.type).toBe('data_app');
    });

    it('does not read apps in spaces outside the scoped agent spaces', async () => {
        const { service } = makeReadService();

        await expect(
            service
                .createRuntime(
                    makeRuntimeContext({ spaceAccess: ['other-space-uuid'] }),
                )
                .readContent({ slug: 'sales-forecast', type: 'data_app' }),
        ).rejects.toThrow(NotFoundError);

        const inScope = await service
            .createRuntime(
                makeRuntimeContext({ spaceAccess: ['sales-space-uuid'] }),
            )
            .readContent({ slug: 'sales-forecast', type: 'data_app' });
        expect(inScope.type).toBe('data_app');
    });
});

const query = (
    overrides: Partial<Extract<ExtractedDataReference, { kind: 'query' }>>,
): ExtractedDataReference => ({
    kind: 'query',
    explore: 'orders',
    dimensions: [],
    metrics: [],
    dimensionFilterFields: [],
    metricFilterFields: [],
    sortFields: [],
    parameterKeys: [],
    localFields: [],
    unresolved: [],
    location,
    ...overrides,
});

const persisted = (
    references: ExtractedDataReference[],
    stats = {
        callSites: references.length,
        fullyResolved: references.length,
        partiallyResolved: 0,
        unresolved: 0,
    },
): PersistedDataAppDataReferences => ({
    references,
    parseErrors: [],
    stats,
});

describe('AiAgentToolsService.aggregateDataAppDataReferences', () => {
    it('unions fields across call sites of the same explore', () => {
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted([
                query({
                    dimensions: ['orders_status'],
                    metrics: ['orders_total'],
                    dimensionFilterFields: ['orders_date'],
                    sortFields: ['orders_total'],
                }),
                query({
                    dimensions: ['orders_status', 'orders_region'],
                    metrics: ['orders_count'],
                    metricFilterFields: ['orders_total'],
                    parameterKeys: ['region'],
                    localFields: ['margin'],
                }),
                query({ explore: 'customers', dimensions: ['customers_id'] }),
            ]),
            {},
        );

        expect(result.explores).toEqual([
            {
                name: 'orders',
                dimensions: ['orders_status', 'orders_region'],
                metrics: ['orders_total', 'orders_count'],
                filterFields: ['orders_date', 'orders_total'],
                sortFields: ['orders_total'],
                parameterKeys: ['region'],
                localFields: ['margin'],
                customSqlFieldCount: 0,
            },
            {
                name: 'customers',
                dimensions: ['customers_id'],
                metrics: [],
                filterFields: [],
                sortFields: [],
                parameterKeys: [],
                localFields: [],
                customSqlFieldCount: 0,
            },
        ]);
    });

    it('folds global filters into the matching explore filter fields', () => {
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted([
                query({ dimensions: ['orders_status'] }),
                {
                    kind: 'globalFilter',
                    explore: 'orders',
                    field: null,
                    fields: ['orders_region', 'orders_status'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'globalFilter',
                    explore: 'orders',
                    field: 'orders_status',
                    unresolved: [],
                    location,
                },
            ]),
            {},
        );

        expect(result.explores).toHaveLength(1);
        expect(result.explores[0].filterFields).toEqual([
            'orders_region',
            'orders_status',
        ]);
    });

    it('reduces custom SQL to a count and drops locations', () => {
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted([
                query({
                    customSql: {
                        tableCalculations: ['SUM(x)'],
                        customDimensions: [{ sql: 'a', table: 'orders' }],
                        additionalMetrics: [
                            { sql: 'b', table: 'orders' },
                            { sql: 'c', table: 'orders' },
                        ],
                    },
                }),
            ]),
            {},
        );

        expect(result.explores[0].customSqlFieldCount).toBe(4);
        expect(JSON.stringify(result)).not.toContain('SUM(x)');
        expect(JSON.stringify(result)).not.toContain('src/App.tsx');
    });

    it('resolves linked charts by slug and drops charts that no longer exist', () => {
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted([
                {
                    kind: 'savedChart',
                    chartUuid: 'chart-1',
                    filterFields: ['orders_date'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'savedChart',
                    chartUuid: 'chart-1',
                    filterFields: ['orders_region'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'savedChart',
                    chartUuid: 'deleted-chart',
                    filterFields: [],
                    unresolved: [],
                    location,
                },
            ]),
            { 'chart-1': 'revenue-by-month' },
        );

        expect(result.linkedCharts).toEqual([
            {
                slug: 'revenue-by-month',
                filterFields: ['orders_date', 'orders_region'],
            },
        ]);
    });

    it('groups external fetch paths by alias', () => {
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted([
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: '/accounts',
                    unresolved: [],
                    location,
                },
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: null,
                    unresolved: [],
                    location,
                },
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: '/deals',
                    unresolved: [],
                    location,
                },
            ]),
            {},
        );

        expect(result.externalConnections).toEqual([
            { alias: 'crm', paths: ['/accounts', '/deals'] },
        ]);
    });

    it('keeps stats and the union of unresolved part names', () => {
        const stats = {
            callSites: 3,
            fullyResolved: 1,
            partiallyResolved: 1,
            unresolved: 1,
        };
        const result = AiAgentToolsService.aggregateDataAppDataReferences(
            persisted(
                [
                    query({ dimensions: ['orders_status'] }),
                    query({ unresolved: ['filters', 'sorts'] }),
                    query({
                        explore: null,
                        unresolved: ['explore', 'filters'],
                    }),
                ],
                stats,
            ),
            {},
        );

        expect(result.stats).toEqual(stats);
        expect(result.unresolved).toEqual(['explore', 'filters', 'sorts']);
        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
        ]);
    });
});

describe('AiAgentToolsService generateDataApp', () => {
    const makeAppGenerateService = ({
        enabled = true,
        canCreate = true,
    }: { enabled?: boolean; canCreate?: boolean } = {}) => ({
        dataAppsEnabledFor: vi.fn().mockResolvedValue(enabled),
        canCreateDataApp: vi.fn().mockResolvedValue(canCreate),
        generateApp: vi
            .fn()
            .mockResolvedValue({ appUuid: 'app-uuid', version: 1 }),
    });

    const dashboardService = {
        getByIdOrSlug: vi.fn().mockResolvedValue({
            uuid: 'dashboard-uuid',
            spaceUuid: 'sales-space-uuid',
        }),
    };
    const savedChartService = {
        get: vi.fn().mockResolvedValue({
            uuid: 'chart-uuid',
            spaceUuid: 'sales-space-uuid',
        }),
    };

    const runGenerate = (
        service: AiAgentToolsService,
        context: AiAgentToolsRuntimeContext & { source: 'ai_agent' },
        args: Partial<
            Parameters<
                ReturnType<typeof service.createRuntime>['generateDataApp']
            >[0]
        > = {},
    ) =>
        service.createRuntime(context).generateDataApp({
            prompt: 'Build a revenue app',
            template: null,
            dashboardSlug: null,
            chartSlugs: null,
            toolCallId: 'tool-call-1',
            ...args,
        });

    describe('gating', () => {
        it.each([
            [true, true, true],
            [false, true, false],
            [true, false, false],
        ])(
            'enabled=%s canCreate=%s → %s',
            async (enabled, canCreate, expected) => {
                const service = makeService({
                    appGenerateService: makeAppGenerateService({
                        enabled,
                        canCreate,
                    }),
                });
                expect(
                    await service.canGenerateDataApp({ user, projectUuid }),
                ).toBe(expected);
            },
        );
    });

    it('starts a personal ai_agent build linked to the tool call', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({ appGenerateService });

        const result = await runGenerate(
            service,
            makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
            { template: 'slideshow' },
        );

        expect(result).toEqual({ appUuid: 'app-uuid', version: 1 });
        const [
            calledUser,
            calledProject,
            prompt,
            ,
            ,
            ,
            ,
            template,
            ,
            ,
            ,
            opts,
        ] = appGenerateService.generateApp.mock.calls[0];
        expect(calledUser).toBe(user);
        expect(calledProject).toBe(projectUuid);
        expect(prompt).toBe('Build a revenue app');
        expect(template).toBe('slideshow');
        expect(opts).toEqual({
            creationExperience: 'ai_agent',
            aiAgentToolCall: {
                promptUuid: 'prompt-uuid',
                toolCallId: 'tool-call-1',
            },
        });
    });

    it('resolves dashboard and chart slugs to references', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            dashboardService,
            savedChartService,
        });

        await runGenerate(
            service,
            makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
            { dashboardSlug: 'sales-overview', chartSlugs: ['revenue'] },
        );

        expect(dashboardService.getByIdOrSlug).toHaveBeenCalledWith(
            user,
            'sales-overview',
            { projectUuid },
        );
        expect(savedChartService.get).toHaveBeenCalledWith('revenue', account, {
            projectUuid,
        });
        const [, , , , , charts, dashboard] =
            appGenerateService.generateApp.mock.calls[0];
        expect(charts).toEqual([
            { uuid: 'chart-uuid', includeSampleData: true, linkLive: true },
        ]);
        expect(dashboard).toEqual({
            uuid: 'dashboard-uuid',
            includeSampleData: true,
        });
    });

    it('does not build on charts outside the scoped agent spaces', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({ appGenerateService, savedChartService });

        await expect(
            runGenerate(
                service,
                makeRuntimeContext({
                    promptUuid: 'prompt-uuid',
                    spaceAccess: ['other-space-uuid'],
                }),
                { chartSlugs: ['revenue'] },
            ),
        ).rejects.toThrow(NotFoundError);
        expect(appGenerateService.generateApp).not.toHaveBeenCalled();
    });

    it('requires a prompt to link the build to', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({ appGenerateService });

        await expect(
            runGenerate(service, makeRuntimeContext()),
        ).rejects.toThrow('generateDataApp requires a prompt');
        expect(appGenerateService.generateApp).not.toHaveBeenCalled();
    });

    it.each([
        ['pdf', 'pdf'],
        [null, undefined],
    ] as const)(
        'starts the build with template %s → %s',
        async (template, expected) => {
            const appGenerateService = makeAppGenerateService();
            const service = makeService({ appGenerateService });

            await runGenerate(
                service,
                makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
                { template },
            );

            const [, , , , , , , builderTemplate] =
                appGenerateService.generateApp.mock.calls[0];
            expect(builderTemplate).toBe(expected);
        },
    );

    it('names an unknown dashboard slug and starts no build', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            dashboardService: {
                getByIdOrSlug: vi
                    .fn()
                    .mockRejectedValue(
                        new NotFoundError('Dashboard not found'),
                    ),
            },
        });

        await expect(
            runGenerate(
                service,
                makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
                { dashboardSlug: 'no-such-dashboard' },
            ),
        ).rejects.toThrow('Dashboard "no-such-dashboard" was not found');
        expect(appGenerateService.generateApp).not.toHaveBeenCalled();
    });

    it('names the unknown chart slug among known ones and starts no build', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            savedChartService: {
                get: vi.fn().mockImplementation(async (slug: string) => {
                    if (slug === 'revenue') {
                        return {
                            uuid: 'chart-uuid',
                            spaceUuid: 'sales-space-uuid',
                        };
                    }
                    throw new NotFoundError('Saved chart not found');
                }),
            },
        });

        await expect(
            runGenerate(
                service,
                makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
                { chartSlugs: ['revenue', 'no-such-chart'] },
            ),
        ).rejects.toThrow('Chart "no-such-chart" was not found');
        expect(appGenerateService.generateApp).not.toHaveBeenCalled();
    });
});

describe('AiAgentToolsService iterateDataApp', () => {
    const makeAppGenerateService = () => ({
        iterateApp: vi
            .fn()
            .mockResolvedValue({ appUuid: 'app-uuid', version: 2 }),
    });

    const makeAppModel = ({
        spaceUuid = null,
    }: { spaceUuid?: string | null } = {}) => ({
        findAppBySlug: vi.fn().mockResolvedValue({
            app_id: 'app-uuid',
            slug: 'revenue-app',
            space_uuid: spaceUuid,
        }),
    });

    const savedChartService = {
        get: vi.fn().mockResolvedValue({
            uuid: 'chart-uuid',
            spaceUuid: 'sales-space-uuid',
        }),
    };

    const runIterate = (
        service: AiAgentToolsService,
        context: AiAgentToolsRuntimeContext & { source: 'ai_agent' },
        args: Partial<
            Parameters<
                ReturnType<typeof service.createRuntime>['iterateDataApp']
            >[0]
        > = {},
    ) =>
        service.createRuntime(context).iterateDataApp({
            appSlug: 'revenue-app',
            prompt: 'Add an order status filter',
            dashboardSlug: null,
            chartSlugs: null,
            toolCallId: 'tool-call-1',
            ...args,
        });

    it('starts an ai_agent build on the resolved app linked to the tool call', async () => {
        const appGenerateService = makeAppGenerateService();
        const appModel = makeAppModel();
        const service = makeService({ appGenerateService, appModel });

        const result = await runIterate(
            service,
            makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
        );

        expect(result).toEqual({ appUuid: 'app-uuid', version: 2 });
        expect(appModel.findAppBySlug).toHaveBeenCalledWith(
            projectUuid,
            'revenue-app',
        );
        const [
            calledUser,
            calledProject,
            appUuid,
            prompt,
            fileIds,
            ,
            ,
            ,
            opts,
        ] = appGenerateService.iterateApp.mock.calls[0];
        expect(calledUser).toBe(user);
        expect(calledProject).toBe(projectUuid);
        expect(appUuid).toBe('app-uuid');
        expect(prompt).toBe('Add an order status filter');
        expect(fileIds).toEqual([]);
        expect(opts).toEqual({
            creationExperience: 'ai_agent',
            aiAgentToolCall: {
                promptUuid: 'prompt-uuid',
                toolCallId: 'tool-call-1',
            },
        });
    });

    it('reads an unknown slug as not found and starts no build', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: { findAppBySlug: vi.fn().mockResolvedValue(undefined) },
        });

        await expect(
            runIterate(
                service,
                makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
                { appSlug: 'no-such-app' },
            ),
        ).rejects.toThrow('Data app "no-such-app" was not found');
        expect(appGenerateService.iterateApp).not.toHaveBeenCalled();
    });

    it('hides a personal app from a space-scoped agent', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: makeAppModel({ spaceUuid: null }),
        });

        await expect(
            runIterate(
                service,
                makeRuntimeContext({
                    promptUuid: 'prompt-uuid',
                    spaceAccess: ['sales-space-uuid'],
                }),
            ),
        ).rejects.toThrow('Data app "revenue-app" was not found');
        expect(appGenerateService.iterateApp).not.toHaveBeenCalled();
    });

    it('hides an app outside the scoped agent spaces', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: makeAppModel({ spaceUuid: 'finance-space-uuid' }),
        });

        await expect(
            runIterate(
                service,
                makeRuntimeContext({
                    promptUuid: 'prompt-uuid',
                    spaceAccess: ['sales-space-uuid'],
                }),
            ),
        ).rejects.toThrow('Data app "revenue-app" was not found');
        expect(appGenerateService.iterateApp).not.toHaveBeenCalled();
    });

    it('iterates on an app inside the scoped agent spaces', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: makeAppModel({ spaceUuid: 'sales-space-uuid' }),
        });

        await runIterate(
            service,
            makeRuntimeContext({
                promptUuid: 'prompt-uuid',
                spaceAccess: ['sales-space-uuid'],
            }),
        );

        expect(appGenerateService.iterateApp).toHaveBeenCalledTimes(1);
    });

    it('resolves chart slugs to references like the create tool', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: makeAppModel(),
            savedChartService,
        });

        await runIterate(
            service,
            makeRuntimeContext({ promptUuid: 'prompt-uuid' }),
            { chartSlugs: ['revenue'] },
        );

        const [, , , , , charts] = appGenerateService.iterateApp.mock.calls[0];
        expect(charts).toEqual([
            { uuid: 'chart-uuid', includeSampleData: true, linkLive: true },
        ]);
    });

    it('requires a prompt to link the build to', async () => {
        const appGenerateService = makeAppGenerateService();
        const service = makeService({
            appGenerateService,
            appModel: makeAppModel(),
        });

        await expect(runIterate(service, makeRuntimeContext())).rejects.toThrow(
            'iterateDataApp requires a prompt',
        );
        expect(appGenerateService.iterateApp).not.toHaveBeenCalled();
    });
});
