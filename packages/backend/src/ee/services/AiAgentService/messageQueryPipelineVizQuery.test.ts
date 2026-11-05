import {
    ForbiddenError,
    QuerySourceType,
    type AiAgentMessageQueryPipeline,
    type SessionUser,
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
        can: () => true,
        cannot: () => false,
        relevantRuleFor: () => ({ inverted: false }),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

const pipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'pipeline-query-uuid',
    title: 'Net orders',
    terminalNodeId: 'net',
    nodes: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'net',
            sql: 'select 1',
            references: ['orders'],
        },
    ],
};

const ref = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    messageUuid: 'message-uuid',
    queryUuid: 'pipeline-query-uuid',
};

const buildService = ({ agentIdentity }: { agentIdentity: boolean }) => {
    const querySourceService = {
        submitQueries: vi.fn().mockResolvedValue({
            queries: [
                { nodeId: 'orders', queryUuid: 'orders-run' },
                { nodeId: 'net', queryUuid: 'net-run' },
            ],
        }),
    };
    const asyncQueryService = { bindQueryToMessageQuery: vi.fn() };
    const service = new AiAgentService({
        aiAgentModel: {
            findSlackPrompt: vi.fn().mockResolvedValue(undefined),
            findWebAppPrompt: vi.fn().mockResolvedValue(undefined),
        },
        querySourceService,
        asyncQueryService,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: agentIdentity }),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getMessageQueryPipelines').mockResolvedValue([pipeline]);
    return { service, querySourceService, asyncQueryService };
};

describe('getMessageQueryPipelineVizQuery', () => {
    it('runs the pipeline and returns each node run', async () => {
        const { service, querySourceService, asyncQueryService } = buildService(
            { agentIdentity: false },
        );

        const result = await service.getMessageQueryPipelineVizQuery(user, {
            ...ref,
            runtimeOptions: null,
        });

        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({ queries: pipeline.nodes }),
        );
        expect(result).toEqual({
            source: 'composer',
            terminalNodeId: 'net',
            nodeQueryUuids: { orders: 'orders-run', net: 'net-run' },
            metadata: { title: 'Net orders', description: null },
            chartStage: null,
        });
        expect(
            asyncQueryService.bindQueryToMessageQuery,
        ).not.toHaveBeenCalled();
    });

    it('binds every node run to the message query under agent identity', async () => {
        const { service, asyncQueryService } = buildService({
            agentIdentity: true,
        });
        vi.spyOn(
            service as unknown as {
                getArtifactOwnerResultReader: () => Promise<unknown>;
            },
            'getArtifactOwnerResultReader',
        ).mockResolvedValue({ kind: 'person', authMethod: 'session' });

        await service.getMessageQueryPipelineVizQuery(user, {
            ...ref,
            runtimeOptions: null,
        });

        const binding = {
            agentUuid: 'agent-uuid',
            promptUuid: 'message-uuid',
            queryUuid: 'pipeline-query-uuid',
        };
        expect(asyncQueryService.bindQueryToMessageQuery.mock.calls).toEqual([
            [expect.anything(), 'project-uuid', 'orders-run', binding],
            [expect.anything(), 'project-uuid', 'net-run', binding],
        ]);
    });

    it('refuses embedded pipelines with warehouse SQL', async () => {
        const { service, querySourceService } = buildService({
            agentIdentity: false,
        });
        vi.spyOn(service, 'getMessageQueryPipelines').mockResolvedValue([
            {
                ...pipeline,
                nodes: [
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'net',
                        sql: 'select 1',
                    },
                ],
            },
        ]);

        await expect(
            service.getMessageQueryPipelineVizQuery(user, {
                ...ref,
                runtimeOptions: {
                    writeSpaceUuids: [],
                    userAttributeOverrides: {},
                } as never,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('rejects a query that is not one of the message pipelines', async () => {
        const { service } = buildService({ agentIdentity: false });

        await expect(
            service.getMessageQueryPipelineVizQuery(user, {
                ...ref,
                queryUuid: 'other-query-uuid',
                runtimeOptions: null,
            }),
        ).rejects.toThrow('Query not found');
    });
});
