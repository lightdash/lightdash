import {
    Account,
    CatalogType,
    Explore,
    NotFoundError,
    QueryExecutionContext,
    SessionUser,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
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
}: {
    name: string;
    tags?: string[];
    requiredAttributes?: Record<string, string>;
    dimensions?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
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
        },
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

    it('adds verified field usage for AI runtime searches but not MCP searches', async () => {
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
        expect(mcpResults.topMatchingFields?.[0]).not.toHaveProperty(
            'verifiedChartUsage',
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
});
