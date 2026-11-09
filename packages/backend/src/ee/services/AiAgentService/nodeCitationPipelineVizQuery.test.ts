import {
    ForbiddenError,
    NotFoundError,
    QuerySourceType,
    type SessionUser,
    type ThreadComposerQueryNode,
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

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_count'],
};
const net: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net',
    title: 'Net orders',
    sql: 'select 1',
    references: ['orders'],
};
const rawAudit: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'raw_audit',
    title: 'Raw audit',
    sql: 'select 1',
};
const audited: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'audited',
    title: 'Audited net',
    sql: 'select 1',
    references: ['net', 'raw_audit'],
};

const ref = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    messageUuid: 'message-uuid',
    nodeId: 'net',
};

const buildService = ({
    agentIdentity = false,
    canAccessThread = true,
    threadNodes = [orders, net, rawAudit, audited],
}: {
    agentIdentity?: boolean;
    canAccessThread?: boolean;
    threadNodes?: ThreadComposerQueryNode[];
} = {}) => {
    const querySourceService = {
        submitQueries: vi.fn().mockResolvedValue({
            queries: [
                { nodeId: 'orders', queryUuid: 'orders-run' },
                { nodeId: 'net', queryUuid: 'net-run' },
            ],
        }),
    };
    const asyncQueryService = { bindQueryToMessageQuery: vi.fn() };
    const aiAgentModel = {
        findSlackPrompt: vi.fn().mockResolvedValue(undefined),
        findWebAppPrompt: vi.fn().mockResolvedValue(undefined),
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-uuid',
            projectUuid: 'project-uuid',
        }),
        getThread: vi
            .fn()
            .mockResolvedValue({ user: { uuid: 'thread-owner-uuid' } }),
        findThreadMessage: vi.fn().mockResolvedValue({}),
        listComposerQueryNodes: vi.fn().mockResolvedValue(threadNodes),
    };
    const service = new AiAgentService({
        aiAgentModel,
        querySourceService,
        asyncQueryService,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: agentIdentity }),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const internals = service as unknown as {
        getIsCopilotEnabled: () => Promise<boolean>;
        checkAgentThreadAccess: () => Promise<boolean>;
    };
    vi.spyOn(internals, 'getIsCopilotEnabled').mockResolvedValue(true);
    vi.spyOn(internals, 'checkAgentThreadAccess').mockResolvedValue(
        canAccessThread,
    );
    return { service, querySourceService, asyncQueryService, aiAgentModel };
};

const embedRuntimeOptions = {
    writeSpaceUuids: [],
    userAttributeOverrides: {},
} as never;

describe('getNodeCitationVizQuery', () => {
    it('runs only the cited node and what it reads, with the cited node terminal', async () => {
        const { service, querySourceService, asyncQueryService } =
            buildService();

        const result = await service.getNodeCitationVizQuery(user, {
            ...ref,
            runtimeOptions: null,
        });

        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({ queries: [orders, net] }),
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

    it('binds every node run to the cited node under agent identity', async () => {
        const { service, asyncQueryService } = buildService({
            agentIdentity: true,
        });
        vi.spyOn(
            service as unknown as {
                getArtifactOwnerResultReader: () => Promise<unknown>;
            },
            'getArtifactOwnerResultReader',
        ).mockResolvedValue({ kind: 'person', authMethod: 'session' });

        await service.getNodeCitationVizQuery(user, {
            ...ref,
            runtimeOptions: null,
        });

        const binding = {
            agentUuid: 'agent-uuid',
            promptUuid: 'message-uuid',
            nodeId: 'net',
        };
        expect(asyncQueryService.bindQueryToMessageQuery).toHaveBeenCalledTimes(
            2,
        );
        expect(asyncQueryService.bindQueryToMessageQuery).toHaveBeenCalledWith(
            expect.anything(),
            'project-uuid',
            'orders-run',
            binding,
        );
        expect(asyncQueryService.bindQueryToMessageQuery).toHaveBeenCalledWith(
            expect.anything(),
            'project-uuid',
            'net-run',
            binding,
        );
    });

    it('refuses an embedded citation whose closure reads warehouse SQL', async () => {
        const { service, querySourceService } = buildService();

        await expect(
            service.getNodeCitationVizQuery(user, {
                ...ref,
                nodeId: 'audited',
                runtimeOptions: embedRuntimeOptions,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('allows an embedded citation when warehouse SQL sits outside its closure', async () => {
        const { service, querySourceService } = buildService();

        await service.getNodeCitationVizQuery(user, {
            ...ref,
            runtimeOptions: embedRuntimeOptions,
        });

        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({ queries: [orders, net] }),
        );
    });

    it('rejects a node outside the thread registry', async () => {
        const { service } = buildService();

        await expect(
            service.getNodeCitationVizQuery(user, {
                ...ref,
                nodeId: 'unknown',
                runtimeOptions: null,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it('refuses a viewer without access to the thread', async () => {
        const { service, querySourceService } = buildService({
            canAccessThread: false,
        });

        await expect(
            service.getNodeCitationVizQuery(user, {
                ...ref,
                runtimeOptions: null,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(querySourceService.submitQueries).not.toHaveBeenCalled();
    });
});

describe('getThreadComposerNodes', () => {
    it('returns the id and title of the thread composer query nodes', async () => {
        const { service } = buildService({ threadNodes: [orders, net] });

        await expect(
            service.getThreadComposerNodes(user, {
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                runtimeOptions: null,
            }),
        ).resolves.toEqual([
            { nodeId: 'orders', title: null },
            { nodeId: 'net', title: 'Net orders' },
        ]);
    });

    it('omits nodes whose closure reads warehouse SQL for an embed viewer', async () => {
        const { service } = buildService();

        await expect(
            service.getThreadComposerNodes(user, {
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                runtimeOptions: embedRuntimeOptions,
            }),
        ).resolves.toEqual([
            { nodeId: 'orders', title: null },
            { nodeId: 'net', title: 'Net orders' },
        ]);
    });

    it('refuses a viewer without access to the thread', async () => {
        const { service } = buildService({
            canAccessThread: false,
        });

        await expect(
            service.getThreadComposerNodes(user, {
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                runtimeOptions: null,
            }),
        ).rejects.toThrow(ForbiddenError);
    });
});
