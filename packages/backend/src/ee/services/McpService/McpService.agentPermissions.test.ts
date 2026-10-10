import {
    AGENT_PILOT_CAPABILITIES,
    AgentActorSurface,
    AiAccessRefusalReason,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
} from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { McpService } from './McpService';

const projectUuid = 'allowed-project';

const setup = (
    authentication: 'oauth' | 'session' | 'pat' | 'service-account' = 'oauth',
) => {
    const user = defaultSessionUser;
    const accounts = {
        oauth: () =>
            fromOauth(user, {
                accessToken: 'token',
                scope: ['mcp:read', 'mcp:write'],
                client: { id: 'client' },
            }),
        session: () => fromSession(user),
        pat: () => fromApiKey(user, 'token'),
        'service-account': () =>
            fromServiceAccount(
                {
                    ...user,
                    serviceAccount: {
                        uuid: user.userUuid,
                        description: 'test',
                    },
                },
                'token',
            ),
    };
    const account = accounts[authentication]();
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedProjectUuids: [projectUuid],
        systemRoleMatrix: agentSystemRoleMatrix(AGENT_PILOT_CAPABILITIES),
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        isCustomRolesLicensed: () => false,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            getCurrentBindingFingerprint: vi.fn(),
        },
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.DEVELOPER],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        },
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    };
    const permissions = new AgentPermissionService(deps);
    const assertOperation = vi.spyOn(permissions, 'assertOperation');
    const getContext = vi.fn().mockResolvedValue({ context: { projectUuid } });
    const service = Object.assign(Object.create(McpService.prototype), {
        recordToolCall: vi.fn(),
        agentActionLogModel: deps.agentActionLogModel,
        mcpContextModel: { getContext },
        projectService: {
            getProject: vi
                .fn()
                .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        },
    }) as McpService;
    const extra = {
        authInfo: {
            extra: {
                user,
                account,
                headerProjectUuid: undefined as string | undefined,
                getAgentPermissionService: () => permissions,
            },
        },
    };
    const handler = vi
        .fn()
        .mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
    const call = (name: string, args: object = {}) =>
        service['wrapToolCallback'](name, handler)(args, extra);
    return {
        permissions,
        service,
        deps,
        policy,
        extra,
        assertOperation,
        getContext,
        handler,
        call,
    };
};

describe.each(['oauth', 'session'] as const)(
    'MCP agent permissions: %s',
    (authentication) => {
        test.each(['run_sql', 'create_content'])(
            'pilot refuses %s before dispatch',
            async (name) => {
                const { call, handler, deps, assertOperation, service } =
                    setup(authentication);
                const result = await call(name, {
                    sql: 'private SQL',
                    prompt: 'private prompt',
                    token: 'private token',
                });
                expect(result).toMatchObject({
                    isError: true,
                    content: [{ type: 'text', text: expect.any(String) }],
                    structuredContent: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                            operation: name,
                            projectUuid,
                            settingsUrl: '/generalSettings/agentIdentity',
                        },
                    },
                });
                expect(result.content[0].text).toBe(
                    result.structuredContent.refusal.message,
                );
                expect(handler).not.toHaveBeenCalled();
                expect(assertOperation).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        kind: 'mcp_tool',
                        key: name,
                        projectUuid,
                        surface: AgentActorSurface.MCP,
                    }),
                );
                expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
                expect(
                    service['recordToolCall'],
                ).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({ toolArgs: {}, status: 'error' }),
                );
                expect(
                    JSON.stringify(
                        vi.mocked(service['recordToolCall']).mock.calls,
                    ),
                ).not.toContain('private');
                expect(JSON.stringify(result)).not.toContain('private');
                expect(
                    JSON.stringify(deps.agentActionLogModel.insert.mock.calls),
                ).not.toContain('private');
            },
        );

        test('pilot allows run_metric_query', async () => {
            const { call, handler } = setup(authentication);
            await expect(call('run_metric_query')).resolves.toEqual({
                content: [{ type: 'text', text: 'done' }],
            });
            expect(handler).toHaveBeenCalledOnce();
        });

        test.each(['off', 'legacy'] as const)(
            '%s keeps SQL and writes unchanged',
            async (mode) => {
                const {
                    deps,
                    policy,
                    call,
                    handler,
                    getContext,
                    assertOperation,
                } = setup(authentication);
                if (mode === 'off')
                    deps.featureFlagModel.get.mockResolvedValue({
                        enabled: false,
                    });
                else policy.mode = 'legacy';
                await call('run_sql');
                await call('create_content');
                expect(handler).toHaveBeenCalledTimes(2);
                expect(getContext).not.toHaveBeenCalled();
                expect(assertOperation).not.toHaveBeenCalled();
                expect(
                    deps.userModel.getAgentRoleAssignments,
                ).not.toHaveBeenCalled();
                expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
            },
        );

        test.each(['selected', 'pinned', 'explicit'] as const)(
            'refuses a forbidden %s project',
            async (source) => {
                const { extra, getContext, call, handler } =
                    setup(authentication);
                if (source === 'selected')
                    getContext.mockResolvedValue({
                        context: { projectUuid: 'forbidden-project' },
                    });
                if (source === 'pinned')
                    extra.authInfo.extra.headerProjectUuid =
                        'forbidden-project';
                const result = await call(
                    'run_metric_query',
                    source === 'explicit'
                        ? { projectUuid: 'forbidden-project' }
                        : {},
                );
                expect(result).toMatchObject({
                    isError: true,
                    structuredContent: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                        },
                    },
                });
                expect(handler).not.toHaveBeenCalled();
            },
        );

        test('reloads selected project for every call', async () => {
            const { call, getContext, handler } = setup(authentication);
            await call('run_metric_query');
            getContext.mockResolvedValue({
                context: { projectUuid: 'forbidden-project' },
            });
            expect(await call('run_metric_query')).toMatchObject({
                isError: true,
            });
            expect(handler).toHaveBeenCalledOnce();
        });

        test('passes null without a selected project', async () => {
            const { call, getContext, assertOperation } = setup(authentication);
            getContext.mockResolvedValue(undefined);
            await call('get_lightdash_version');
            expect(assertOperation).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: null }),
            );
        });
    },
);

test.each(['pat', 'service-account'] as const)(
    '%s remains exempt',
    async (authentication) => {
        const { call, handler, deps, assertOperation } = setup(authentication);
        await call('run_sql', { projectUuid: 'forbidden-project' });
        await call('create_content');
        expect(handler).toHaveBeenCalledTimes(2);
        expect(assertOperation).not.toHaveBeenCalled();
        expect(deps.featureFlagModel.get).not.toHaveBeenCalled();
    },
);

test('missing permission dependency fails closed', async () => {
    const { call, extra, handler } = setup();
    Object.assign(extra.authInfo.extra, {
        getAgentPermissionService: undefined,
    });
    await expect(call('run_metric_query')).rejects.toThrow(
        'Agent permission service is unavailable',
    );
    expect(handler).not.toHaveBeenCalled();
});

test('managed unknown tool refuses before dispatch', async () => {
    const { call, handler } = setup();
    expect(await call('unknown_tool')).toMatchObject({
        isError: true,
        structuredContent: {
            refusal: { reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED },
        },
    });
    expect(handler).not.toHaveBeenCalled();
});

test.each(['off', 'legacy'] as const)(
    '%s skips project lookup failures and pin validation',
    async (mode) => {
        const { call, getContext, extra, deps, policy, handler } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.mode = 'legacy';
        getContext.mockRejectedValue(new Error('context unavailable'));
        await call('get_lightdash_version');
        extra.authInfo.extra.headerProjectUuid = 'pinned-project';
        await call('run_sql', { projectUuid: 'different-project' });
        expect(handler).toHaveBeenCalledTimes(2);
        expect(getContext).not.toHaveBeenCalled();
    },
);
