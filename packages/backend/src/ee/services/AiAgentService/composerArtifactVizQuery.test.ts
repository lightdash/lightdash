import {
    ForbiddenError,
    QueryExecutionContext,
    QuerySourceType,
    QuerySurface,
    type AiArtifact,
    type SessionUser,
    type SourceQuery,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'org-uuid',
    userId: 1,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

const semanticNode: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
} as unknown as SourceQuery;

const warehouseSqlNode: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'targets',
    title: 'Targets',
    sql: 'select status, target from targets',
} as SourceQuery;

const transformationNode: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'orders_vs_target',
    title: 'Orders vs target',
    sql: 'select * from orders',
    references: ['orders'],
} as SourceQuery;

const setup = ({ queries }: { queries: SourceQuery[] }) => {
    const chartConfig = {
        source: 'composer',
        schemaVersion: 1,
        queries,
        terminalNodeId: 'orders_vs_target',
        vizConfig: null,
    } as const;
    const artifact: AiArtifact = {
        artifactUuid: 'artifact-uuid',
        threadUuid: 'thread-uuid',
        artifactType: 'chart',
        savedQueryUuid: null,
        savedSqlUuid: null,
        savedDashboardUuid: null,
        createdAt: new Date(),
        versionNumber: 2,
        versionUuid: 'version-uuid',
        title: 'Orders vs target',
        description: null,
        chartConfig,
        dashboardConfig: null,
        promptUuid: 'prompt-uuid',
        versionCreatedAt: new Date(),
        verifiedByUserUuid: null,
        verifiedAt: null,
    } as AiArtifact;
    const querySourceService = {
        submitQueries: vi.fn(async ({ queries: submitted }) => ({
            queries: (submitted as SourceQuery[]).map((query, index) => ({
                nodeId: query.nodeId,
                sourceType: query.sourceType,
                queryUuid: `run-${query.nodeId}`,
                cacheHit: index === 0,
            })),
        })),
    };
    const analytics = { track: vi.fn() };
    const aiAgentModel = {
        findSlackPrompt: vi.fn().mockResolvedValue(undefined),
        findWebAppPrompt: vi
            .fn()
            .mockResolvedValue({ threadCreatedFrom: 'web_app' }),
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-uuid',
            name: 'Agent',
            projectUuid: 'project-uuid',
        }),
        updateArtifactVersionChartConfig: vi.fn(),
    };
    const service = new AiAgentService({
        aiAgentModel,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: false }),
        },
        querySourceService,
        analytics,
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.spyOn(
        service as unknown as {
            getIsCopilotEnabled: () => Promise<boolean>;
        },
        'getIsCopilotEnabled',
    ).mockResolvedValue(true);
    vi.spyOn(service, 'getAgent').mockResolvedValue({
        uuid: 'agent-uuid',
        name: 'Agent',
        projectUuid: 'project-uuid',
    } as never);
    vi.spyOn(service, 'getArtifact').mockResolvedValue(artifact);
    vi.spyOn(
        service as unknown as {
            assertEmbedThreadInSpace: () => Promise<void>;
        },
        'assertEmbedThreadInSpace',
    ).mockResolvedValue(undefined);
    return { service, querySourceService, analytics, aiAgentModel };
};

const options = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
};

afterEach(() => vi.restoreAllMocks());

describe('AiAgentService composer artifact visualization query', () => {
    it('opening a composer artifact runs its whole pipeline as the viewer and returns every node result', async () => {
        const { service, querySourceService, analytics, aiAgentModel } = setup({
            queries: [semanticNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, options);

        expect(result).toEqual({
            source: 'composer',
            terminalNodeId: 'orders_vs_target',
            nodeQueryUuids: {
                orders: 'run-orders',
                orders_vs_target: 'run-orders_vs_target',
            },
            metadata: { title: 'Orders vs target', description: null },
        });
        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                queries: [semanticNode, transformationNode],
                context: QueryExecutionContext.AI,
                querySurface: QuerySurface.APP,
                parameters: {},
                userAttributeOverrides: {},
                invalidateCache: false,
                plans: {},
            }),
        );
        expect(
            querySourceService.submitQueries.mock.calls[0][0].account.user.id,
        ).toBe('user-uuid');
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai_agent.artifact_viz_query',
                userId: 'user-uuid',
                properties: expect.objectContaining({
                    source: 'composer',
                    artifactVersionId: 'version-uuid',
                    promptId: 'prompt-uuid',
                    queryId: 'run-orders_vs_target',
                    nodeCount: 2,
                    cachedNodeCount: 1,
                    durationMs: expect.any(Number),
                }),
            }),
        );
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('runs an embedded composer artifact with the embed user attributes', async () => {
        const { service, querySourceService } = setup({
            queries: [semanticNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, {
            ...options,
            runtimeOptions: {
                userAttributeOverrides: { region: ['emea'] },
            } as never,
        });

        expect(result).toMatchObject({
            source: 'composer',
            nodeQueryUuids: {
                orders: 'run-orders',
                orders_vs_target: 'run-orders_vs_target',
            },
        });
        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                userAttributeOverrides: { region: ['emea'] },
            }),
        );
    });

    it('refuses an embedded composer artifact whose pipeline has a warehouse SQL node', async () => {
        const { service, querySourceService } = setup({
            queries: [semanticNode, warehouseSqlNode, transformationNode],
        });

        const run = service.getArtifactVizQuery(user, {
            ...options,
            runtimeOptions: { userAttributeOverrides: {} } as never,
        });

        await expect(run).rejects.toBeInstanceOf(ForbiddenError);
        await expect(run).rejects.not.toThrow(/Lightdash/);
        expect(querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('runs a composer artifact with a warehouse SQL node outside embeds', async () => {
        const { service } = setup({
            queries: [semanticNode, warehouseSqlNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, options);

        expect(result).toMatchObject({
            source: 'composer',
            nodeQueryUuids: {
                orders: 'run-orders',
                targets: 'run-targets',
                orders_vs_target: 'run-orders_vs_target',
            },
        });
    });
});
