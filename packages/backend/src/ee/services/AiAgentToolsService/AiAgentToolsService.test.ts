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
        previewDeploySetupService: {},
        shareService: {},
        asyncQueryService: {},
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
