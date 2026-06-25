import {
    Account,
    CatalogType,
    Explore,
    FilterOperator,
    ForbiddenError,
    JobStatusType,
    NotFoundError,
    QueryExecutionContext,
    RequestMethod,
    SessionUser,
    UnitOfTime,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { AiAgentContentValidation } from '../ai/utils/AiAgentContentValidation';
import { AiAgentToolsService } from './AiAgentToolsService';

const organizationUuid = 'organization-uuid';
const projectUuid = 'project-uuid';
const userUuid = 'user-uuid';

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: jest.fn(() => true),
        cannot: jest.fn(() => false),
        relevantRuleFor: jest.fn(() => undefined),
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
    searchCatalog = jest.fn(),
    verifiedFieldUsage = new Map<string, number>(),
    searchFieldUniqueValues = jest.fn(),
    projectSpaces = [],
    spaceModel = {
        hasSpaceWithPathAndUuids: jest.fn().mockResolvedValue(true),
    },
    dashboardService = {},
    savedChartService = {},
    asyncQueryService = {},
    coderService = {},
    aiAgentContentValidation = {},
    scheduleCompileProject = jest.fn().mockResolvedValue({ jobUuid: 'job-1' }),
    jobModel = { get: jest.fn() },
}: {
    explores?: Record<string, Explore>;
    userAttributes?: Record<string, string[]>;
    searchCatalog?: jest.Mock;
    verifiedFieldUsage?: Map<string, number>;
    searchFieldUniqueValues?: jest.Mock;
    projectSpaces?: Array<{ uuid: string; path: string }>;
    spaceModel?: Record<string, unknown>;
    dashboardService?: Record<string, unknown>;
    savedChartService?: Record<string, unknown>;
    asyncQueryService?: Record<string, unknown>;
    coderService?: Record<string, unknown>;
    aiAgentContentValidation?: Record<string, unknown>;
    scheduleCompileProject?: jest.Mock;
    jobModel?: Record<string, unknown>;
} = {}) =>
    new AiAgentToolsService({
        builtInSkills: {
            getAiAgentSkills: jest.fn(),
            getAiAgentSkill: jest.fn(),
            listSkillToolReferences: jest.fn(),
            readSkillTool: jest.fn(),
            readSkillToolResource: jest.fn(),
            listMcpResources: jest.fn(),
            getMcpResourceBody: jest.fn(),
        },
        lightdashConfig: {
            siteUrl: 'https://lightdash.example',
            ai: { copilot: { maxQueryLimit: 500 } },
        },
        projectModel: {
            findExploresFromCache: jest.fn(
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
            getAllByOrganizationUuid: jest.fn().mockResolvedValue([]),
            get: jest.fn(),
        },
        projectService: {
            searchFieldUniqueValues,
            getSpaces: jest.fn().mockResolvedValue(projectSpaces),
            scheduleCompileProject,
        },
        jobModel,
        userAttributesModel: {
            getAttributeValuesForOrgMember: jest
                .fn()
                .mockResolvedValue(userAttributes),
        },
        catalogService: { searchCatalog },
        contentVerificationModel: {
            getVerifiedFieldUsage: jest
                .fn()
                .mockResolvedValue(verifiedFieldUsage),
        },
        searchModel: {},
        searchService: {},
        spaceService: {},
        spaceModel,
        dashboardService,
        savedChartService,
        coderService,
        contentService: {},
        aiAgentContentValidation,
        projectContextModel: {},
        aiAgentDocumentModel: {},
        changesetModel: {},
        featureFlagService: {},
        previewDeploySetupService: {},
        shareService: {},
        asyncQueryService,
    } as unknown as ConstructorParameters<typeof AiAgentToolsService>[0]);

const makeRuntimeContext = (
    overrides: Partial<
        Parameters<AiAgentToolsService['createRuntime']>[0]
    > = {},
): Parameters<AiAgentToolsService['createRuntime']>[0] =>
    ({
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
    }) as Parameters<AiAgentToolsService['createRuntime']>[0];

describe('AiAgentToolsService', () => {
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

    it('adds verified field usage for AI field searches but not MCP field searches', async () => {
        const searchCatalog = jest.fn(async () => ({
            data: [
                {
                    type: CatalogType.Field,
                    name: 'orders_count',
                    label: 'Orders Count',
                    tableName: 'orders',
                    fieldType: 'metric',
                    searchRank: 1,
                    description: 'Field detail returned by findFields',
                    chartUsage: 3,
                },
            ],
            pagination: undefined,
        }));
        const explore = makeExplore({ name: 'orders' });
        const service = makeService({
            explores: { orders: explore },
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
            aiRuntime.findFields({
                table: 'orders',
                fieldSearchQuery: { label: 'orders count' },
                page: 1,
                pageSize: 50,
                explore,
            }),
        ).resolves.toMatchObject({
            fields: [expect.objectContaining({ verifiedChartUsage: 7 })],
        });

        const mcpResults = await mcpRuntime.findFields({
            table: 'orders',
            fieldSearchQuery: { label: 'orders count' },
            page: 1,
            pageSize: 50,
            explore,
        });
        expect(mcpResults.fields[0]).not.toHaveProperty('verifiedChartUsage');
        expect(mcpResults.fields[0]).toHaveProperty(
            'description',
            'Field detail returned by findFields',
        );
        expect(searchCatalog).toHaveBeenCalledWith(
            expect.objectContaining({
                catalogSearch: expect.objectContaining({
                    type: CatalogType.Field,
                }),
                paginateArgs: { page: 1, pageSize: 50 },
            }),
        );
    });

    it('returns compact all-field ids for matched explores without field search', async () => {
        const searchCatalog = jest.fn(async () => ({
            data: [
                {
                    type: CatalogType.Table,
                    name: 'orders',
                    label: 'Orders',
                    description: 'Orders explore',
                    aiHints: ['Use for order analysis'],
                    searchRank: 1,
                    joinedTables: ['customers'],
                },
            ],
            pagination: undefined,
        }));
        const service = makeService({
            explores: {
                orders: makeExplore({
                    name: 'orders',
                    dimensions: {
                        status: { name: 'status', table: 'orders' },
                    },
                    metrics: {
                        count: { name: 'count', table: 'orders' },
                    },
                }),
            },
            searchCatalog,
        });

        await expect(
            service.createRuntime(makeRuntimeContext()).findExplores({
                searchQuery: 'orders',
            }),
        ).resolves.toMatchObject({
            exploreSearchResults: [
                expect.objectContaining({
                    name: 'orders',
                    fields: {
                        dimensions: ['orders_status'],
                        metrics: ['orders_count'],
                    },
                }),
            ],
        });
        expect(searchCatalog).not.toHaveBeenCalledWith(
            expect.objectContaining({
                catalogSearch: expect.objectContaining({
                    type: CatalogType.Field,
                }),
            }),
        );
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
        const searchCatalog = jest.fn(async ({ catalogSearch }) => ({
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
        }));
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
        expect(searchCatalog).not.toHaveBeenCalledWith(
            expect.objectContaining({
                catalogSearch: expect.objectContaining({
                    type: CatalogType.Field,
                }),
            }),
        );
    });

    const denySpaceAccessModel = () => ({
        hasSpaceWithPathAndUuids: jest.fn().mockResolvedValue(false),
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
        const searchFieldUniqueValues = jest.fn();
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
        const dashboardService = { getByIdOrSlug: jest.fn() };
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            dashboardService,
            coderService: {
                getDashboards: jest.fn().mockResolvedValue({
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
        const getDashboardCharts = jest.fn();
        const service = makeService({
            dashboardService: {
                getByIdOrSlug: jest.fn().mockResolvedValue({
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
        const getDashboardCharts = jest.fn().mockResolvedValue({
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
                getByIdOrSlug: jest.fn().mockResolvedValue({
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
        const executeSavedChartQueryAndGetResults = jest.fn();
        const service = makeService({
            savedChartService: {
                get: jest.fn().mockResolvedValue({
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
        const get = jest.fn().mockResolvedValue({
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
        const get = jest.fn().mockResolvedValue(savedChart);
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
        const executeSavedChartQueryAndGetResults = jest
            .fn()
            .mockResolvedValue({ rows: [] });
        const service = makeService({
            savedChartService: {
                get: jest.fn().mockResolvedValue({
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

    it('does not run dashboard chart queries outside the scoped agent spaces', async () => {
        const executeDashboardChartQueryAndGetResults = jest.fn();
        const service = makeService({
            dashboardService: {
                getByIdOrSlug: jest.fn().mockResolvedValue({
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
        const upsertDashboard = jest.fn();
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            coderService: { upsertDashboard },
            aiAgentContentValidation: { validateContent: jest.fn() },
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
        const upsertDashboard = jest.fn();
        const service = makeService({
            spaceModel: denySpaceAccessModel(),
            dashboardService: {
                getByIdOrSlug: jest
                    .fn()
                    .mockResolvedValue({ uuid: 'dashboard-uuid' }),
            },
            coderService: {
                getDashboards: jest.fn().mockResolvedValue({
                    dashboards: [makeDashboardContent('allowed-space')],
                }),
                getCurrentContentVersionBySlug: jest.fn().mockResolvedValue({
                    versionUuid: 'version-before',
                }),
                upsertDashboard,
            },
            aiAgentContentValidation: {
                validatePatch: jest.fn(),
                validateContent: jest.fn(),
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
        const upsertChart = jest.fn().mockResolvedValue({
            charts: [{ data: { uuid: 'chart-uuid' } }],
        });
        const service = makeService({
            savedChartService: {
                get: jest.fn().mockResolvedValue({ uuid: 'chart-uuid' }),
            },
            coderService: {
                getCharts: jest
                    .fn()
                    .mockResolvedValue({ charts: [makeChartContent(null)] }),
                getCurrentContentVersionBySlug: jest
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
            jest.restoreAllMocks();
        });

        it('returns success when the compile job reaches DONE without polling', async () => {
            const scheduleCompileProject = jest
                .fn()
                .mockResolvedValue({ jobUuid: 'job-done' });
            const get = jest.fn().mockResolvedValue({
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
            const get = jest.fn().mockResolvedValue({
                jobStatus: JobStatusType.ERROR,
                steps: [
                    { stepError: 'dbt compile failed: model x' },
                    { stepError: null },
                    { stepError: 'ref not found' },
                ],
            });
            const service = makeService({
                scheduleCompileProject: jest
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
            const get = jest.fn().mockResolvedValue({
                jobStatus: JobStatusType.ERROR,
                steps: [],
            });
            const service = makeService({
                scheduleCompileProject: jest
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
            jest.useFakeTimers();
            try {
                const get = jest
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
                    scheduleCompileProject: jest
                        .fn()
                        .mockResolvedValue({ jobUuid: 'job-poll' }),
                    jobModel: { get },
                });

                const promise = service
                    .createRuntime(makeRuntimeContext())
                    .syncDbtProject({ reason: null });
                await jest.advanceTimersByTimeAsync(6_000);
                const result = await promise;

                expect(get.mock.calls.length).toBeGreaterThan(1);
                expect(result.status).toBe('success');
                expect(result.jobUuid).toBe('job-poll');
            } finally {
                jest.useRealTimers();
            }
        });

        it('returns in_progress when the job is still running at the deadline', async () => {
            jest.useFakeTimers();
            try {
                const get = jest.fn().mockResolvedValue({
                    jobStatus: JobStatusType.RUNNING,
                    steps: [],
                });
                const service = makeService({
                    scheduleCompileProject: jest
                        .fn()
                        .mockResolvedValue({ jobUuid: 'job-running' }),
                    jobModel: { get },
                });

                const promise = service
                    .createRuntime(makeRuntimeContext())
                    .syncDbtProject({ reason: null });
                // Advance past the 90s deadline; the loop polls every 2s but
                // never sees a terminal status, so it must time out.
                await jest.advanceTimersByTimeAsync(90_000);
                const result = await promise;

                expect(result).toEqual({
                    status: 'in_progress',
                    jobUuid: 'job-running',
                    message:
                        'The dbt project is still syncing — the compile has not finished yet.',
                });
            } finally {
                jest.useRealTimers();
            }
        });

        it('propagates a ForbiddenError from scheduleCompileProject without polling', async () => {
            const get = jest.fn();
            const service = makeService({
                scheduleCompileProject: jest
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
