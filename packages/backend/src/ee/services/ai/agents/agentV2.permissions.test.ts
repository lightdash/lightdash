import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import { type ToolSet } from 'ai';
import { buildAccount } from '../../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../../services/AgentPermissionService/AgentPermissionService';
import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import { AgentContext } from '../utils/AgentContext';
import { getAgentTools, withAgentToolPermissions } from './agentV2';

const setup = () => {
    const account = buildAccount();
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([]),
    };
    const confirmations = {
        get: vi.fn().mockResolvedValue(null),
        getCurrentBindingFingerprint: vi.fn().mockResolvedValue('current'),
        upsert: vi.fn(),
        delete: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const permissionService = new AgentPermissionService({
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        isCustomRolesLicensed: () => true,
        featureFlagModel,
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: confirmations,
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.VIEWER],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
        agentActionLogModel: { insert: vi.fn() },
    });
    const assertToolOperation = vi.fn((kind, key, connectedTool) =>
        permissionService.assertOperation({
            account,
            organizationUuid: account.organization.organizationUuid!,
            projectUuid: 'agent-project',
            surface: AgentActorSurface.IN_APP_AGENT,
            kind,
            key,
            connectedTool,
        }),
    );
    const runSqlJob = vi.fn().mockResolvedValue({
        rows: [],
        columns: [],
        rowCount: 0,
    });
    const dependencies = new Proxy(
        {
            assertToolOperation,
            runSqlJob,
            getPrompt: vi.fn().mockResolvedValue({}),
            listSqlApprovalDecisions: vi.fn().mockResolvedValue([]),
        },
        {
            get: (target, key) =>
                Reflect.get(target, key) ??
                vi.fn().mockResolvedValue(undefined),
        },
    ) as unknown as AiAgentDependencies;
    const args = {
        agentSettings: { name: 'Agent', projectUuid: 'agent-project' },
        execution: { mode: 'standard', maxSteps: 10 },
        canRunSql: true,
        messageHistory: [],
        autoApproveSql: true,
        availableSkills: [],
        siteUrl: 'https://example.com',
        mcpServers: [],
        runSqlMaxLimit: 500,
    } as unknown as AiAgentArgs;
    const connectedExecute = vi.fn().mockResolvedValue({ result: 'connected' });
    const connectedTool = {
        serverUuid: 'server',
        toolName: 'search',
        enabledToolNames: ['search'] as string[] | null,
    };
    const buildTools = () =>
        getAgentTools(
            args,
            dependencies,
            [],
            {
                tools: {
                    connected_search: { execute: connectedExecute } as never,
                },
                mcpToolNameToServerUuid: { connected_search: 'server' },
                connectedToolInventory: { connected_search: connectedTool },
                unavailableMcpServers: [],
                closeMcpClients: vi.fn(),
            },
            new Map(),
            {},
            { types: [], totalCount: 0 },
            new AgentContext([]),
        );
    return {
        policy,
        confirmations,
        featureFlagModel,
        assertToolOperation,
        runSqlJob,
        args,
        connectedExecute,
        connectedTool,
        buildTools,
    };
};

const options = { toolCallId: 'call', messages: [] };
const executeTool = (tool: ToolSet[string], input: unknown = {}) =>
    (tool.execute as (input: unknown, options: unknown) => Promise<unknown>)(
        input,
        options,
    );

test.each(['standard', 'worker'] as const)(
    'runSql rechecks capability and warehouse confirmation in %s execution',
    async (role) => {
        const h = setup();
        if (role === 'worker')
            h.args.execution = {
                mode: 'deep_research',
                canUseRawSql: true,
                research: { role: 'worker', onFindings: vi.fn() },
            } as unknown as AiAgentArgs['execution'];
        const tools = h.buildTools();
        const run = () =>
            executeTool(tools.runSql, { sql: 'SELECT 1', limit: 1 });
        await expect(run()).resolves.toMatchObject({
            metadata: { status: 'error' },
            structuredContent: {
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                },
            },
        });
        expect(h.runSqlJob).not.toHaveBeenCalled();
        h.policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
        await expect(run()).resolves.toMatchObject({
            structuredContent: {
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                },
            },
        });
        expect(h.runSqlJob).not.toHaveBeenCalled();
        h.confirmations.get.mockResolvedValue({
            bindingFingerprint: 'current',
        });
        await expect(run()).resolves.toMatchObject({
            metadata: { status: 'success' },
        });
        expect(h.runSqlJob).toHaveBeenCalledOnce();
        h.policy.systemRoleMatrix.viewer = [];
        await expect(run()).resolves.toMatchObject({
            metadata: { status: 'error' },
        });
        expect(h.runSqlJob).toHaveBeenCalledOnce();
        expect(h.assertToolOperation).toHaveBeenCalledWith(
            'agent_tool',
            'runSql',
        );
    },
);

test('connected tools require external_tools and recheck revocation', async () => {
    const h = setup();
    const tool = h.buildTools().connected_search;
    const run = () => executeTool(tool);
    await expect(run()).resolves.toMatchObject({
        structuredContent: {
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.ExternalTools,
            },
        },
    });
    expect(h.connectedExecute).not.toHaveBeenCalled();
    h.policy.systemRoleMatrix.viewer = [AgentCapability.ExternalTools];
    await expect(run()).resolves.toEqual({ result: 'connected' });
    h.policy.systemRoleMatrix.viewer = [];
    await run();
    expect(h.connectedExecute).toHaveBeenCalledOnce();
    expect(h.assertToolOperation).toHaveBeenCalledWith(
        'connected_mcp_tool',
        'connected_search',
        h.connectedTool,
    );
});

test.each(['off', 'legacy'] as const)(
    '%s preserves execution without capabilities',
    async (mode) => {
        const h = setup();
        if (mode === 'off')
            h.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else h.policy.mode = 'legacy';
        await executeTool(h.buildTools().connected_search);
        expect(h.connectedExecute).toHaveBeenCalledOnce();
    },
);

test('Deep Research delegation is checked at execution', async () => {
    const h = setup();
    const runTask = vi.fn();
    h.args.execution = {
        mode: 'deep_research',
        research: { role: 'coordinator', runTask },
    } as unknown as AiAgentArgs['execution'];
    await expect(
        executeTool(h.buildTools().delegateResearchTask),
    ).resolves.toMatchObject({
        structuredContent: {
            refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
        },
    });
    expect(runTask).not.toHaveBeenCalled();
    expect(h.assertToolOperation).toHaveBeenCalledWith(
        'agent_tool',
        'delegateResearchTask',
    );
});

test.each([null, [], ['different_tool']])(
    'connected tools without explicit approval are unmapped: %j',
    async (enabledToolNames) => {
        const h = setup();
        h.policy.systemRoleMatrix.viewer = [AgentCapability.ExternalTools];
        h.connectedTool.enabledToolNames = enabledToolNames;
        await expect(
            executeTool(h.buildTools().connected_search),
        ).resolves.toMatchObject({
            structuredContent: {
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
                },
            },
        });
        expect(h.connectedExecute).not.toHaveBeenCalled();
    },
);

test('a namespace collision cannot inherit another server approval', async () => {
    const h = setup();
    h.policy.systemRoleMatrix.viewer = [AgentCapability.ExternalTools];
    const approved = vi.fn().mockResolvedValue('approved');
    const unlisted = vi.fn();
    const tools = withAgentToolPermissions(
        {
            mcp_docs__search: { execute: approved } as never,
            mcp_docs__search_2: { execute: unlisted } as never,
        },
        { assertToolOperation: h.assertToolOperation },
        new Set(['mcp_docs__search', 'mcp_docs__search_2']),
        {
            mcp_docs__search: {
                serverUuid: 'approved',
                toolName: 'search',
                enabledToolNames: ['search'],
            },
            mcp_docs__search_2: {
                serverUuid: 'unlisted',
                toolName: 'search',
                enabledToolNames: null,
            },
        },
    );
    await expect(executeTool(tools.mcp_docs__search)).resolves.toBe('approved');
    await expect(executeTool(tools.mcp_docs__search_2)).resolves.toMatchObject({
        structuredContent: {
            refusal: { reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED },
        },
    });
    expect(unlisted).not.toHaveBeenCalled();
});
